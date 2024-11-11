// src/background/index.js

// Memory Manager functionality inlined for service worker compatibility
const TOKEN_LIMITS = {
    SHORT_TERM: 20,
    LONG_TERM: 10000,
    BUFFER_COMPRESSION: 20
  };
  
  let shortTermBuffer = [];
  
  async function addMemory(content, projectId) {
    // Add to short-term buffer
    shortTermBuffer.push({
      content,
      timestamp: Date.now(),
      projectId
    });
  
    // Check if buffer needs compression
    if (shortTermBuffer.length >= TOKEN_LIMITS.BUFFER_COMPRESSION) {
      await compressShortTermMemory(projectId);
    }
  
    // Store the raw memory
    return await storeMemory({
      content,
      projectId,
      timestamp: Date.now(),
      type: 'raw',
      importance: 5 // Default importance for now
    });
  }
  
  async function compressShortTermMemory(projectId) {
    const bufferContent = shortTermBuffer
      .map(m => m.content)
      .join('\n\n');
  
    // Store compressed memory
    await storeMemory({
      content: bufferContent,
      projectId,
      timestamp: Date.now(),
      type: 'compressed',
      importance: 7, // Compressed memories are more important
      sourceCount: shortTermBuffer.length
    });
  
    // Clear buffer
    shortTermBuffer = [];
  }
  
  async function storeMemory(memory) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('orma-db', 1);
  
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['memories'], 'readwrite');
        const store = transaction.objectStore('memories');
        
        const request = store.add(memory);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      };
  
      request.onerror = () => reject(request.error);
    });
  }
  
  async function getAllMemories(projectId) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('orma-db', 1);
  
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['memories'], 'readonly');
        const store = transaction.objectStore('memories');
        const index = store.index('projectId');
        
        const request = index.getAll(projectId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      };
  
      request.onerror = () => reject(request.error);
    });
  }
  
  async function formRootMemory(projectId, memories) {
    const content = memories
      .sort((a, b) => b.importance - a.importance)
      .map(m => m.content)
      .join('\n\n');
  
    return await storeMemory({
      content: `ROOT MEMORY:\n${content}`,
      projectId,
      timestamp: Date.now(),
      type: 'root',
      importance: 10, // Root memories are maximally important
    });
  }
  
  // Initialize context menu
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'save-to-orma',
      title: 'Save to Orma',
      contexts: ['selection']
    });
  });
  
  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('Context menu clicked:', info.menuItemId);
    
    if (info.menuItemId === 'save-to-orma') {
      console.log('Selected text:', info.selectionText);
      
      try {
        // Get current project ID from storage
        const { currentProjectId } = await chrome.storage.local.get('currentProjectId');
        console.log('Current project ID:', currentProjectId);
        
        if (!currentProjectId) {
          console.warn('No project selected!');
          await chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_NOTIFICATION',
            message: 'Please select a project in Orma first'
          });
          return;
        }
  
        // Add the memory
        await addMemory(info.selectionText, currentProjectId);
        console.log('Memory added successfully');
        
        // Check if we need to form root memory
        const memories = await getAllMemories(currentProjectId);
        const totalContent = memories.map(m => m.content).join(' ');
        if (totalContent.length > 10000) { // Simple token estimation
          await formRootMemory(currentProjectId, memories);
        }
        
        // Notify user of success
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_NOTIFICATION',
          message: 'Added to Orma memory!'
        });
        
      } catch (error) {
        console.error('Error saving memory:', error);
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_NOTIFICATION',
          message: 'Error saving to Orma: ' + error.message
        });
      }
    }
  });