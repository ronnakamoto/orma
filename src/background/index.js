const TOKEN_LIMITS = {
  SHORT_TERM: 10,
  LONG_TERM: 10000,
  BUFFER_COMPRESSION: 20,
};

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
    console.log('No memories to compress');
    return;
  }

  try {
    console.log(`Compressing ${shortTermBuffer.length} memories...`);
    
    // Prepare memories in a more structured way for AI
    const memoryText = shortTermBuffer
      .sort((a, b) => b.importance - a.importance)
      .map((m, i) => {
        // Extract the actual content without the timestamp and context
        // This assumes the content format we used in addMemory:
        // [timestamp]\ncontent\n\nContext: context
        const contentParts = m.content.split('\n\n');
        const mainContent = contentParts[0].split('\n').slice(1).join('\n');
        
        return `Memory ${i + 1} (Importance: ${m.importance}):
${mainContent}`;
      })
      .join('\n\n');

    // Use AI for compression with a clear structure
    const summarizer = await ai.summarizer.create();
    const compressedContent = await summarizer.summarize(
`These are related memories that need to be compressed into a meaningful summary:

${memoryText}

Create a comprehensive summary that:
1. Identifies the main themes and key ideas
2. Preserves important details and context
3. Shows relationships between different memories
4. Highlights the most significant insights
5. Maintains chronological or logical order where relevant

Format the output as:
SUMMARY:
[Main overview of the combined memories]

KEY POINTS:
- [First key point]
- [Second key point]
...

RELATIONSHIPS & PATTERNS:
- [First relationship/pattern]
- [Second relationship/pattern]
...

IMPORTANT DETAILS:
- [First important detail]
- [Second important detail]
...`
    );

    // Add metadata to the compressed content
    const timestamp = new Date().toISOString();
    const finalContent = `[${timestamp}] COMPRESSED MEMORY (${shortTermBuffer.length} memories)

${compressedContent}

Source Memories:
${shortTermBuffer.map((m, i) => `${i + 1}. ${m.content.split('\n')[1]}`).join('\n')}`;

    summarizer.destroy();

    // Store the compressed memory
    const compressedMemory = await storeMemory({
      content: finalContent,
      projectId,
      timestamp: Date.now(),
      type: 'compressed',
      importance: Math.max(...shortTermBuffer.map(m => m.importance)),
      sourceCount: shortTermBuffer.length
    });

    console.log('Compression complete, clearing buffer');
    shortTermBuffer = [];
    
    return compressedMemory;
  } catch (error) {
    console.error('Error compressing memories:', error);
    // Fallback to basic compression
    const timestamp = new Date().toISOString();
    const bufferContent = `[${timestamp}] COMPRESSED MEMORIES

SUMMARY:
Combined ${shortTermBuffer.length} related memories.

CONTENTS:
${shortTermBuffer
  .sort((a, b) => b.importance - a.importance)
  .map((m, i) => `Memory ${i + 1} (Importance: ${m.importance}):\n${m.content}`)
  .join('\n\n---\n\n')}`;

    const compressedMemory = await storeMemory({
      content: bufferContent,
      projectId,
      timestamp: Date.now(),
      type: 'compressed',
      importance: Math.max(...shortTermBuffer.map(m => m.importance)),
      sourceCount: shortTermBuffer.length
    });

    shortTermBuffer = [];
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
