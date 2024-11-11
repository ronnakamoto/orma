const TOKEN_LIMITS = {
  SHORT_TERM: 10,
  LONG_TERM: 10000,
  BUFFER_COMPRESSION: 20,
  NANO_CONTEXT: 1024, // Total context window size
  NANO_OVERHEAD: 26, // Tokens used by the model
  NANO_AVAILABLE: 998, // NANO_CONTEXT - NANO_OVERHEAD
  CHARS_PER_TOKEN: 4, // Approximate number of characters per token
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

async function showNotification(tab, message) {
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
    const project = await getProject(projectId);
    const projectContext = project?.description || "";
    const timestamp = new Date().toISOString();

    // Create a simple memory with timestamp and context
    const memoryContent = `[${timestamp}]\n${content}\n\nContext: ${
      projectContext || "Saved from webpage"
    }`;

    // Calculate basic importance score
    const existingMemories = await getAllMemories(projectId);
    const { score: importance, reasoning } = await calculateImportance(
      content,
      existingMemories
    );

    console.log(`Adding memory with importance ${importance}`);

    // Add to short-term buffer
    shortTermBuffer.push({
      content: memoryContent,
      timestamp: Date.now(),
      projectId,
      importance,
    });

    console.log(
      `Buffer size: ${shortTermBuffer.length}, Limit: ${TOKEN_LIMITS.SHORT_TERM}`
    );

    // Store raw memory
    const memory = await storeMemory({
      content: memoryContent,
      projectId,
      timestamp: Date.now(),
      type: "raw",
      importance,
    });

    // Check if buffer needs compression
    if (shortTermBuffer.length >= TOKEN_LIMITS.SHORT_TERM) {
      console.log("Compressing memories...");
      await compressShortTermMemory(projectId);
    }

    // Check if we need to form root memory
    const totalContent = existingMemories.map((m) => m.content).join(" ");
    if (totalContent.length > TOKEN_LIMITS.LONG_TERM) {
      await formRootMemory(projectId, [...existingMemories, memory]);
    }

    return memory;
  } catch (error) {
    console.error("Error in addMemory:", error);
    const timestamp = new Date().toISOString();
    return await storeMemory({
      content: `[${timestamp}]\n${content}\n\nContext: Saved from webpage`,
      projectId,
      timestamp: Date.now(),
      type: "raw",
      importance: 5,
    });
  }
}

async function compressShortTermMemory(projectId) {
  if (shortTermBuffer.length === 0) {
    console.log("No memories to compress");
    return;
  }

  try {
    console.log(`Compressing ${shortTermBuffer.length} memories...`);

    // Sort memories by importance
    const sortedMemories = shortTermBuffer.sort(
      (a, b) => b.importance - a.importance
    );

    // Prepare memories while tracking tokens
    let currentTokens = 0;
    const memoriesToCompress = [];
    const template = `Memory X (Importance: Y):\nContent\n\n`;
    const templateTokens = estimateTokens(template);

    // Reserve tokens for the prompt template and expected output
    const promptOverhead = estimateTokens(`
Create a comprehensive summary that:
1. Identifies main themes
2. Preserves important details
3. Shows relationships
4. Highlights insights
5. Maintains chronological order

Format as:
SUMMARY:
[Overview]

KEY POINTS:
- Points

RELATIONSHIPS:
- Relations

DETAILS:
- Details
    `);

    const availableTokens = TOKEN_LIMITS.NANO_AVAILABLE - promptOverhead;
    console.log(`Available tokens for memories: ${availableTokens}`);

    for (const memory of sortedMemories) {
      // Extract the actual content without metadata
      const contentParts = memory.content.split("\n\n");
      const mainContent = contentParts[0].split("\n").slice(1).join("\n");

      const memoryText = `Memory ${
        memoriesToCompress.length + 1
      } (Importance: ${memory.importance}):\n${mainContent}`;
      const memoryTokens = estimateTokens(memoryText) + templateTokens;

      if (currentTokens + memoryTokens > availableTokens) {
        console.log(
          `Token limit reached at ${currentTokens} tokens. Processing batch.`
        );
        break;
      }

      memoriesToCompress.push({
        text: memoryText,
        originalMemory: memory,
      });
      currentTokens += memoryTokens;
    }

    console.log(
      `Processing ${memoriesToCompress.length} memories with ~${currentTokens} tokens`
    );

    // Use AI for compression with a clear structure
    const summarizer = await ai.summarizer.create();
    const compressedContent = await summarizer.summarize(
      `Compress these related memories into a meaningful summary:

${memoriesToCompress.map((m) => m.text).join("\n\n")}

Create a comprehensive summary that:
1. Identifies main themes
2. Preserves important details
3. Shows relationships
4. Highlights insights
5. Maintains chronological order

Format as:
SUMMARY:
[Overview]

KEY POINTS:
- Points

RELATIONSHIPS:
- Relations

DETAILS:
- Details`
    );

    // Add metadata to the compressed content
    const timestamp = new Date().toISOString();
    const finalContent = `[${timestamp}] COMPRESSED MEMORY (${
      memoriesToCompress.length
    } memories)

${compressedContent}

Source Memories:
${memoriesToCompress
  .map((m, i) => `${i + 1}. ${m.originalMemory.content.split("\n")[1]}`)
  .join("\n")}`;

    summarizer.destroy();

    // Store the compressed memory
    const compressedMemory = await storeMemory({
      content: finalContent,
      projectId,
      timestamp: Date.now(),
      type: "compressed",
      importance: Math.max(
        ...memoriesToCompress.map((m) => m.originalMemory.importance)
      ),
      sourceCount: memoriesToCompress.length,
    });

    // Remove compressed memories from buffer
    shortTermBuffer = sortedMemories.slice(memoriesToCompress.length);

    // If we still have memories in the buffer, process them too
    if (shortTermBuffer.length >= TOKEN_LIMITS.SHORT_TERM) {
      console.log(
        `${shortTermBuffer.length} memories remaining in buffer, continuing compression...`
      );
      await compressShortTermMemory(projectId);
    }

    return compressedMemory;
  } catch (error) {
    console.error("Error compressing memories:", error);
    // Fallback to basic compression, still respecting token limits
    const timestamp = new Date().toISOString();
    const sortedMemories = shortTermBuffer
      .sort((a, b) => b.importance - a.importance)
      .slice(
        0,
        Math.floor(
          TOKEN_LIMITS.NANO_AVAILABLE / TOKEN_LIMITS.CHARS_PER_TOKEN / 100
        )
      ); // Conservative estimate

    const bufferContent = `[${timestamp}] COMPRESSED MEMORIES

SUMMARY:
Combined ${sortedMemories.length} related memories.

CONTENTS:
${sortedMemories
  .map((m, i) => `Memory ${i + 1} (Importance: ${m.importance}):\n${m.content}`)
  .join("\n\n---\n\n")}`;

    const compressedMemory = await storeMemory({
      content: bufferContent,
      projectId,
      timestamp: Date.now(),
      type: "compressed",
      importance: Math.max(...sortedMemories.map((m) => m.importance)),
      sourceCount: sortedMemories.length,
    });

    // Remove compressed memories from buffer
    shortTermBuffer = shortTermBuffer.slice(sortedMemories.length);

    // If we still have memories in buffer, continue compression
    if (shortTermBuffer.length >= TOKEN_LIMITS.SHORT_TERM) {
      await compressShortTermMemory(projectId);
    }

    return compressedMemory;
  }
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
        await showNotification(tab, "Please select a project in Orma first");
        return;
      }

      await addMemory(info.selectionText, currentProjectId);
      await showNotification(tab, "Added to Orma memory!");
    } catch (error) {
      console.error("Error saving memory:", error);
      await showNotification(tab, "Error saving to Orma: " + error.message);
    }
  }
});
