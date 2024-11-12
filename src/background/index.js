const TOKEN_LIMITS = {
  SHORT_TERM: 5,
  LONG_TERM: 10000,
  BUFFER_COMPRESSION: 20,
  NANO_CONTEXT: 1024, // Total context window size
  NANO_OVERHEAD: 26, // Tokens used by the model
  NANO_AVAILABLE: 998, // NANO_CONTEXT - NANO_OVERHEAD
  CHARS_PER_TOKEN: 4, // Approximate number of characters per token
  PROMPT_RESERVE: 200,    // Reserve tokens for the compression prompt
  SUMMARY_RESERVE: 100,   // Reserve tokens for compressed memory summaries
  OUTPUT_RESERVE: 300,    // Reserve tokens for expected output structure
};

function estimateTokens(text) {
  return Math.ceil(text.length / TOKEN_LIMITS.CHARS_PER_TOKEN);
}

let shortTermBuffer = [];

// Initialize IndexedDB when extension is installed
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await initializeDB();
    await initializeContextMenu();
    console.log("Orma: Database and context menu initialized");
  } catch (error) {
    console.error("Error initializing Orma:", error);
  }
});

async function initializeContextMenu() {
  chrome.contextMenus.create({
    id: "save-to-orma",
    title: "Save to Orma",
    contexts: ["selection"],
  });
}

async function initializeDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("orma-db", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("memories")) {
        const memoriesStore = db.createObjectStore("memories", {
          keyPath: "id",
          autoIncrement: true,
        });
        memoriesStore.createIndex("projectId", "projectId");
        memoriesStore.createIndex("timestamp", "timestamp");
        memoriesStore.createIndex("type", "type");
        memoriesStore.createIndex("importance", "importance");
      }

      if (!db.objectStoreNames.contains("projects")) {
        const projectsStore = db.createObjectStore("projects", {
          keyPath: "id",
          autoIncrement: true,
        });
        projectsStore.createIndex("name", "name");
        projectsStore.createIndex("created", "created");
      }
    };
  });
}

async function showNotification(tab, message, style = "info") {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return window.hasOwnProperty("ormaContentScriptLoaded");
      },
    });

    if (!result) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["js/content.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["css/app.css"],
      });
    }

    await chrome.tabs.sendMessage(tab.id, {
      type: "SHOW_NOTIFICATION",
      message: message,
      style
    });
  } catch (error) {
    console.error("Error showing notification:", error);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon-48.png",
      title: "Orma",
      message: message,
    });
  }
}

async function calculateImportance(content, existingMemories) {
  const contentWords = content.toLowerCase().split(/\s+/);
  let uniqueScore = 1;

  for (const memory of existingMemories) {
    const memoryWords = memory.content.toLowerCase().split(/\s+/);
    const overlap = contentWords.filter((word) =>
      memoryWords.includes(word)
    ).length;
    const overlapRatio = overlap / contentWords.length;
    uniqueScore = Math.min(uniqueScore, 1 - overlapRatio);
  }

  const lengthScore = Math.min(contentWords.length / 100, 1);
  return {
    score: Math.ceil((uniqueScore * 0.7 + lengthScore * 0.3) * 10),
    reasoning: ["Score calculated based on content uniqueness and length"],
  };
}

async function addMemory(content, projectId) {
  try {
    console.log('=== Starting addMemory ===');
    console.log('Current buffer size:', shortTermBuffer.length);

    const project = await getProject(projectId);
    const projectContext = project?.description || "";
    const timestamp = new Date().toISOString();

    // Create memory content
    const memoryContent = `[${timestamp}]\n${content}\n\nContext: ${
      projectContext || "Saved from webpage"
    }`;

    // Calculate importance
    const existingMemories = await getAllMemories(projectId);
    const { score: importance } = await calculateImportance(
      content,
      existingMemories
    );

    // Add to short-term buffer
    const newMemory = {
      content: memoryContent,
      timestamp: Date.now(),
      projectId,
      importance,
    };
    
    shortTermBuffer.push(newMemory);
    console.log('Added to buffer. New size:', shortTermBuffer.length);

    // Store raw memory
    const storedMemory = await storeMemory({
      content: memoryContent,
      projectId,
      timestamp: Date.now(),
      type: "raw",
      importance,
    });

    // Check if buffer needs compression
    if (shortTermBuffer.length >= TOKEN_LIMITS.SHORT_TERM) {
      console.log('Buffer full, starting compression...');
      await compressShortTermMemory(projectId);
    }

    return storedMemory;
  } catch (error) {
    console.error("Error in addMemory:", error);
    return await storeMemory({
      content: `[${new Date().toISOString()}]\n${content}\n\nContext: Saved from webpage`,
      projectId,
      timestamp: Date.now(),
      type: "raw",
      importance: 5,
    });
  }
}

async function compressShortTermMemory(projectId) {
  console.log('=== Starting compression ===');
  console.log('Buffer size at start:', shortTermBuffer.length);

  if (shortTermBuffer.length < TOKEN_LIMITS.SHORT_TERM) {
    console.log('Not enough memories to compress');
    return null;
  }

  try {
    // Get the most recent compressed memory first
    const recentCompressed = await getRecentCompressedMemories(projectId, 24);
    const lastCompressedMemory = recentCompressed.length > 0 
      ? recentCompressed.sort((a, b) => b.timestamp - a.timestamp)[0]
      : null;

    console.log('Recent compressed memory found:', lastCompressedMemory ? 'yes' : 'no');

    // Take the oldest memories up to SHORT_TERM limit
    const rawMemoriesToCompress = [...shortTermBuffer]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, TOKEN_LIMITS.SHORT_TERM);

    console.log('Selected raw memories for compression:', rawMemoriesToCompress.length);

    // Calculate available tokens
    const availableInputTokens = TOKEN_LIMITS.NANO_AVAILABLE - 
      TOKEN_LIMITS.PROMPT_RESERVE - 
      TOKEN_LIMITS.OUTPUT_RESERVE;

    // Prepare input with minimal formatting, including the last compressed memory if available
    let compressionInput = '';
    
    if (lastCompressedMemory) {
      const parsedLastCompressed = parseCompressedContent(lastCompressedMemory.content);
      compressionInput = `Previous Summary [${lastCompressedMemory.importance}]:\n${
        parsedLastCompressed.summary
      }\n\nNew Memories to Integrate:\n`;
    }

    compressionInput += rawMemoriesToCompress
      .map((m, i) => `M${i + 1}[${m.importance}]: ${
        m.content.split('\n\n')[0].split('\n').slice(1).join('\n')
      }`)
      .join('\n\n');

    console.log('Preparing to compress memories with input length:', compressionInput.length);
    const summarizer = await ai.summarizer.create();
    
    const promptText = lastCompressedMemory 
      ? `${compressionInput}\n\nCreate an updated synthesis that integrates the previous summary with new memories. Format as:\nSUMMARY:\n[core insights]\nKEY POINTS:\n[bullets]\nRELATIONSHIPS:\n[links]\nDETAILS:\n[specifics]`
      : `${compressionInput}\n\nSynthesize concisely:\nSUMMARY:\n[core insights]\nKEY POINTS:\n[bullets]\nRELATIONSHIPS:\n[links]\nDETAILS:\n[specifics]`;

    const compressedContent = await summarizer.summarize(promptText);
    summarizer.destroy();

    // Create compressed memory with enhanced source tracking
    const timestamp = new Date().toISOString();
    const finalContent = `[${timestamp}] COMPRESSED MEMORY\n\n${compressedContent}\n\nSource Memories:\n${
      rawMemoriesToCompress
        .map((m, i) => `${i + 1}. [RAW] ${m.content.split('\n')[1]}`)
        .concat(
          lastCompressedMemory 
            ? [`${rawMemoriesToCompress.length + 1}. [COMPRESSED] Previous summary with ${
              parseCompressedContent(lastCompressedMemory.content).sourceMemories?.split('\n').length || 0
            } source memories`]
            : []
        )
        .join('\n')
    }`;

    const compressedMemory = await storeMemory({
      content: finalContent,
      projectId,
      timestamp: Date.now(),
      type: 'compressed',
      importance: Math.max(
        ...rawMemoriesToCompress.map(m => m.importance),
        lastCompressedMemory?.importance || 0
      ),
      metadata: {
        sourceCount: rawMemoriesToCompress.length + (lastCompressedMemory ? 1 : 0),
        includesCompressed: !!lastCompressedMemory,
        previousCompressedId: lastCompressedMemory?.id,
        sourcesTimestamp: {
          oldest: Math.min(...rawMemoriesToCompress.map(m => m.timestamp)),
          newest: Math.max(...rawMemoriesToCompress.map(m => m.timestamp))
        }
      }
    });

    // Remove compressed raw memories from buffer
    const compressedTimestamps = new Set(rawMemoriesToCompress.map(m => m.timestamp));
    shortTermBuffer = shortTermBuffer.filter(m => !compressedTimestamps.has(m.timestamp));
    
    console.log('Compression complete');
    console.log('New buffer size:', shortTermBuffer.length);

    // Check if we need another compression cycle
    if (shortTermBuffer.length >= TOKEN_LIMITS.SHORT_TERM) {
      console.log('Buffer still full, triggering another compression cycle');
      await compressShortTermMemory(projectId);
    }

    return compressedMemory;
  } catch (error) {
    console.error('Compression error:', error);
    return null;
  }
}

function selectMemoriesWithinTokenLimit(memories, tokenLimit) {
  let selectedMemories = [];
  let currentTokens = 0;

  // Sort by importance and recency
  const sortedMemories = [...memories].sort((a, b) => {
    const timeDiff = b.timestamp - a.timestamp;
    const importanceDiff = b.importance - a.importance;
    return importanceDiff !== 0 ? importanceDiff : timeDiff;
  });

  for (const memory of sortedMemories) {
    const tokens = estimateTokens(memory.content);
    if (currentTokens + tokens <= tokenLimit) {
      selectedMemories.push(memory);
      currentTokens += tokens;
    } else {
      break;
    }
  }

  return selectedMemories;
}

function selectCompressedMemories(compressedMemories, availableTokens, maxTokensPerMemory) {
  let selected = [];
  let currentTokens = 0;

  // Sort by importance and recency
  const sortedMemories = compressedMemories
    .sort((a, b) => b.importance - a.importance || b.timestamp - a.timestamp);

  for (const memory of sortedMemories) {
    const parsed = parseCompressedContent(memory.content);
    const summaryTokens = estimateTokens(parsed.summary);
    
    if (summaryTokens <= maxTokensPerMemory && 
        currentTokens + summaryTokens <= availableTokens) {
      selected.push({
        memory,
        summaryTokens
      });
      currentTokens += summaryTokens;
    }
  }

  return selected;
}

function prepareCompressionInput(rawMemories, compressedMemories) {
  // Format raw memories concisely
  const rawParts = rawMemories.map((memory, i) => 
    `M${i + 1}[${memory.importance}]: ${
      memory.content.split('\n\n')[0].split('\n').slice(1).join('\n')
    }`
  );

  // Format compressed memories concisely
  const compressedParts = compressedMemories.map(({ memory }, i) => {
    const parsed = parseCompressedContent(memory.content);
    return `CS${i + 1}[${memory.importance}]: ${parsed.summary}`;
  });

  return [...rawParts, ...compressedParts].join('\n\n');
}

function updateShortTermBuffer(processedMemories) {
  // Get timestamps of processed memories
  const processedTimestamps = new Set(
    processedMemories.map(m => m.timestamp)
  );

  console.log('Updating buffer:', {
    beforeSize: shortTermBuffer.length,
    processedCount: processedMemories.length,
    processedTimestamps: Array.from(processedTimestamps)
  });

  // Remove processed memories from buffer
  shortTermBuffer = shortTermBuffer.filter(memory => 
    !processedTimestamps.has(memory.timestamp)
  );

  console.log('Buffer updated:', {
    afterSize: shortTermBuffer.length,
    remainingMemories: shortTermBuffer.map(m => ({
      timestamp: m.timestamp,
      importance: m.importance
    }))
  });
}

// Estimate tokens for an array of memories
function estimateTokensForMemories(memories) {
  return memories.reduce((total, memory) => {
    const contentTokens = estimateTokens(memory.content);
    const metadataTokens = estimateTokens(`Memory ${memory.importance}:\n`);
    return total + contentTokens + metadataTokens;
  }, 0);
}

// Parse compressed content structure
function parseCompressedContent(content) {
  const timestampMatch = content.match(/\[(.*?)\]/);
  const sections = {
    summary: content.match(/SUMMARY:\s*(.*?)(?=\s*KEY POINTS:|$)/s)?.[1]?.trim(),
    keyPoints: content.match(/KEY POINTS:\s*(.*?)(?=\s*RELATIONSHIPS:|$)/s)?.[1]?.trim(),
    relationships: content.match(/RELATIONSHIPS:\s*(.*?)(?=\s*DETAILS:|$)/s)?.[1]?.trim(),
    details: content.match(/DETAILS:\s*(.*?)(?=\s*Source Memories:|$)/s)?.[1]?.trim(),
    sourceMemories: content.match(/Source Memories:\s*(.*?)$/s)?.[1]?.trim()
  };

  return {
    timestamp: timestampMatch ? timestampMatch[1] : '',
    ...sections
  };
}

// Fallback compression for raw memories only
async function compressRawMemoriesOnly(memories, projectId) {
  if (!memories.length) return null;

  const timestamp = new Date().toISOString();
  const summarizer = await ai.summarizer.create();
  
  try {
    const input = memories.map((m, i) => 
      `Memory ${i + 1} (Importance: ${m.importance}):\n${
        m.content.split('\n\n')[0].split('\n').slice(1).join('\n')
      }`
    ).join('\n\n');

    const compressedContent = await summarizer.summarize(
      `${input}\n\nCreate a concise synthesis. Format as:\n` +
      `SUMMARY:\n[Core insights]\n\nKEY POINTS:\n[Bullet points]\n\n` +
      `RELATIONSHIPS:\n[Connections]\n\nDETAILS:\n[Important specifics]`
    );

    return await createCompressedMemory(
      compressedContent,
      memories,
      [],
      projectId
    );
  } catch (error) {
    console.error('Error in raw compression:', error);
    return await fallbackCompression(memories, projectId);
  } finally {
    summarizer.destroy();
  }
}

// Create compressed memory with proper metadata
async function createCompressedMemory(compressedContent, rawMemories, compressedMemories, projectId) {
  const timestamp = new Date().toISOString();
  const finalContent = `[${timestamp}] COMPRESSED MEMORY\n\n${compressedContent}\n\nSource Memories:\n${
    rawMemories
      .map((m, i) => `${i + 1}. [RAW] ${m.content.split('\n')[1]}`)
      .concat(
        compressedMemories.map(({ memory }, i) => 
          `${rawMemories.length + i + 1}. [COMPRESSED] ${
            parseCompressedContent(memory.content).summary?.split('\n')[0]
          }`
        )
      )
      .join('\n')
  }`;

  return await storeMemory({
    content: finalContent,
    projectId,
    timestamp: Date.now(),
    type: 'compressed',
    importance: Math.max(
      ...rawMemories.map(m => m.importance),
      ...compressedMemories.map(({ memory }) => memory.importance)
    ),
    metadata: {
      rawCount: rawMemories.length,
      compressedCount: compressedMemories.length,
      sourcesTimestamp: {
        oldest: Math.min(
          ...rawMemories.map(m => m.timestamp),
          ...compressedMemories.map(({ memory }) => memory.timestamp)
        ),
        newest: Math.max(
          ...rawMemories.map(m => m.timestamp),
          ...compressedMemories.map(({ memory }) => memory.timestamp)
        )
      }
    }
  });
}

// Get recent compressed memories
async function getRecentCompressedMemories(projectId, hoursAgo = 24) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('orma-db', 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['memories'], 'readonly');
      const store = transaction.objectStore('memories');
      const index = store.index('projectId');

      const request = index.getAll(projectId);
      request.onsuccess = () => {
        const allMemories = request.result;
        const cutoffTime = Date.now() - (hoursAgo * 60 * 60 * 1000);
        
        const recentCompressed = allMemories.filter(memory => 
          memory.type === 'compressed' && 
          memory.timestamp >= cutoffTime
        );
        
        resolve(recentCompressed);
      };
      request.onerror = () => reject(request.error);
    };

    request.onerror = () => reject(request.error);
  });
}

// Fallback compression when AI compression fails
async function fallbackCompression(memories, projectId) {
  const timestamp = new Date().toISOString();
  const sortedMemories = memories
    .sort((a, b) => b.importance - a.importance)
    .slice(0, Math.min(memories.length, 5)); // Take top 5 most important

  const content = `[${timestamp}] COMPRESSED MEMORY

SUMMARY:
Combined ${sortedMemories.length} related memories for project ${projectId}.

KEY POINTS:
${sortedMemories.map(m => `- ${m.content.split('\n')[1]}`).join('\n')}

RELATIONSHIPS:
- Memories collected within same time period
- Similar importance levels

DETAILS:
Fallback compression due to processing constraints.

Source Memories:
${sortedMemories.map((m, i) => `${i + 1}. ${m.content.split('\n')[1]}`).join('\n')}`;

  return await storeMemory({
    content,
    projectId,
    timestamp: Date.now(),
    type: 'compressed',
    importance: Math.max(...sortedMemories.map(m => m.importance)),
    metadata: {
      rawCount: sortedMemories.length,
      compressedCount: 0,
      sourcesTimestamp: {
        oldest: Math.min(...sortedMemories.map(m => m.timestamp)),
        newest: Math.max(...sortedMemories.map(m => m.timestamp))
      }
    }
  });
}

async function formRootMemory(projectId, memories) {
  try {
    const summarizer = await ai.summarizer.create();
    const rootContent = await summarizer.summarize(
      `Create a comprehensive root memory that captures the essence of these memories:
      
      ${memories.map((m, i) => `Memory ${i + 1}:\n${m.content}`).join("\n\n")}
      
      Synthesize into:
      1. High-level overview
      2. Major themes and patterns
      3. Essential relationships
      4. Key insights
      5. Important context`
    );
    summarizer.destroy();

    return await storeMemory({
      content: `ROOT MEMORY:\n${rootContent}`,
      projectId,
      timestamp: Date.now(),
      type: "root",
      importance: 10,
    });
  } catch (error) {
    console.error("Error forming root memory:", error);
    const timestamp = new Date().toISOString();
    const content = memories
      .sort((a, b) => b.importance - a.importance)
      .map((m) => m.content)
      .join("\n\n===\n\n");

    return await storeMemory({
      content: `[${timestamp}] ROOT MEMORY:\n\n${content}`,
      projectId,
      timestamp: Date.now(),
      type: "root",
      importance: 10,
    });
  }
}

async function storeMemory(memory) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("orma-db", 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["memories"], "readwrite");
      const store = transaction.objectStore("memories");

      const request = store.add(memory);
      request.onsuccess = () => resolve({ ...memory, id: request.result });
      request.onerror = () => reject(request.error);
    };

    request.onerror = () => reject(request.error);
  });
}

async function getAllMemories(projectId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("orma-db", 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["memories"], "readonly");
      const store = transaction.objectStore("memories");
      const index = store.index("projectId");

      const request = index.getAll(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };

    request.onerror = () => reject(request.error);
  });
}

async function getProject(projectId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("orma-db", 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["projects"], "readonly");
      const store = transaction.objectStore("projects");

      const request = store.get(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };

    request.onerror = () => reject(request.error);
  });
}

// Context Menu Handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-to-orma") {
    try {
      const { currentProjectId } = await chrome.storage.local.get(
        "currentProjectId"
      );

      if (!currentProjectId) {
        await showNotification(tab, "Please select a project in Orma first", "error");
        return;
      }

      await addMemory(info.selectionText, currentProjectId);
      await showNotification(tab, "Added to Orma memory!", "success");
    } catch (error) {
      console.error("Error saving memory:", error);
      await showNotification(tab, "Error saving to Orma: " + error.message, "error");
    }
  }
});
