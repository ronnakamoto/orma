const TOKEN_LIMITS = {
  SHORT_TERM: 5,
  LONG_TERM: 10000,
  BUFFER_COMPRESSION: 20,
  NANO_CONTEXT: 4000, // Total context window size
  NANO_OVERHEAD: 500, // Tokens used by system prompts and formatting
  NANO_AVAILABLE: 3500, // NANO_CONTEXT - NANO_OVERHEAD
  CHARS_PER_TOKEN: 1, // 1:1 ratio of characters to tokens
  PROMPT_RESERVE: 1000,    // Reserve tokens for the compression prompt
  SUMMARY_RESERVE: 500,   // Reserve tokens for compressed memory summaries
  OUTPUT_RESERVE: 1000,    // Reserve tokens for expected output structure
};

import db from '../services/db';
import { vectorService } from '../services/vectorService';

function estimateTokens(text) {
  if (!text) return 0;
  
  // Simple 1:1 character to token ratio
  return text.length;
}

let shortTermBuffer = [];
let currentOperationStatus = null;

// Initialize IndexedDB when extension is installed
chrome.runtime.onInstalled.addListener(async () => {
  try {
    // Initialize vector service
    const setting = await db.getSetting('openai_api_key');
    if (setting?.value) {
      await vectorService.initialize(setting.value);
    }
    
    await initializeContextMenu();
    console.log("Orma: Context menu initialized");
  } catch (error) {
    console.error("Error initializing Orma:", error);
  }
});

async function initializeContextMenu() {
  chrome.contextMenus.create({
    id: "save-to-orma",
    title: "Save selection to Orma",
    contexts: ["selection"],
  });
  
  chrome.contextMenus.create({
    id: "save-page-to-orma",
    title: "Save page to Orma",
    contexts: ["page", "link"],
  });
}

// Debug logging utility with content preview
function debugLog(stage, message, data = null) {
  const log = `[Orma Debug] ${stage}: ${message}`;
  
  // If data contains content, add a preview
  if (data && (data.content || data.processedContent || data.rawContent)) {
    const content = data.content || data.processedContent || data.rawContent;
    const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
    data.contentPreview = preview;
  }
  
  console.log(log, data ? data : '');
}

// Clean and extract meaningful text using AI
async function preprocessContent(content) {
  updateOperationStatus({ 
    type: 'loading',
    message: 'Pre-processing content ...',
    progress: 45 
  });

  if (!ai?.writer) {
    debugLog('Content Preprocessing', 'ai.writer not available, using raw content');
    return content;
  }

  try {
    debugLog('Content Preprocessing', 'Starting text extraction', {
      inputLength: content.length,
      estimatedTokens: estimateTokens(content)
    });

    const writer = await ai.writer.create();
    const context = 
      "You are a text extraction expert. Extract and clean the main content while:\n" +
      "1. Preserve all meaningful information\n" +
      "2. Remove redundant formatting and noise\n" +
      "3. Fix any broken sentences or formatting\n" +
      "4. Maintain technical accuracy\n" +
      "5. Keep code blocks and technical terms intact\n" +
      "6. Use proper punctuation and spacing\n\n" +
      "Output only the cleaned content without any explanations or metadata.";

    const cleanedContent = await writer.write(content, {
      context,
      maxTokens: TOKEN_LIMITS.NANO_AVAILABLE - TOKEN_LIMITS.PROMPT_RESERVE
    });

    if (!cleanedContent?.trim()) {
      debugLog('Content Preprocessing', 'No content after cleaning, using original');
      return content;
    }

    debugLog('Content Preprocessing', 'Finished text extraction', {
      originalLength: content.length,
      cleanedLength: cleanedContent.length,
      originalTokens: estimateTokens(content),
      cleanedTokens: estimateTokens(cleanedContent)
    });

    return cleanedContent.trim();
  } catch (error) {
    debugLog('Content Preprocessing', 'Error during preprocessing', { error });
    return content;
  }
}

// Process content using AI writer
export async function processWithAI(content) {
  updateOperationStatus({ 
    type: 'loading',
    message: 'Starting to process with AI...',
    progress: 35 
  });

  try {
    if (!ai?.writer) {
      debugLog('AI Processing', 'ai.writer is not available', { 
        aiExists: !!ai, 
        writerExists: false
      });
      return content;
    }

    debugLog('AI Processing', 'Starting content processing');
    
    // First, preprocess the content
    const cleanedContent = await preprocessContent(content);
    
    // Split content into chunks if it exceeds the token limit
    const chunks = splitIntoChunks(cleanedContent, TOKEN_LIMITS.NANO_CONTEXT);
    debugLog('AI Processing', `Processing ${chunks.length} chunks`);

    let processedChunks = [];
    const writer = await ai.writer.create();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkTokens = estimateTokens(chunk);
      debugLog('AI Processing', 'Processing chunk', {
        chunkIndex: i + 1,
        totalChunks: chunks.length,
        tokens: chunkTokens,
        length: chunk.length
      });

      // Add contextual information for better chunk processing
      const enrichedChunk = `
Content Section ${i + 1} of ${chunks.length}:
---
${chunk}
---

Guidelines:
- If this is not the first section, it continues from the previous section
- If this is not the last section, it continues in the next section
- Extract both factual information and subjective insights
- Include any emotional or personal elements if present
- Preserve specific examples and analogies
- Maintain chronological order if relevant`;

      const context = 
        "You are an expert content analyst. Transform this content section into clear, organized bullet points while:\n" +
        "1. ALWAYS format output as bullet points for easy scanning\n" +
        "2. Extract both objective facts AND subjective insights\n" +
        "3. Capture key themes, patterns, and relationships\n" +
        "4. Preserve technical details when present\n" +
        "5. Include emotional elements and personal perspectives\n" +
        "6. Note real-world examples and practical applications\n" +
        "7. Highlight unique or creative ideas\n" +
        "8. Add brief context for clarity\n" +
        "9. Use sub-bullets for related points\n" +
        "10. Keep original quotes if meaningful\n\n" +
        "Structure the output like this:\n" +
        "• Main point or theme\n" +
        "  - Supporting detail or example\n" +
        "  - Related insight or application\n" +
        "• Next main point\n" +
        "  - etc.\n\n" +
        "Output ONLY the bullet points without any meta-text or section markers.";

      const result = await writer.write(enrichedChunk, { 
        context,
        maxTokens: TOKEN_LIMITS.NANO_AVAILABLE - TOKEN_LIMITS.PROMPT_RESERVE
      });

      if (result?.trim()) {
        // Clean up any remaining section markers and ensure proper bullet formatting
        const cleanedResult = result.trim()
          .replace(/^Content Section \d+ of \d+:?\s*/, '')
          .replace(/^-{3,}\s*/, '')
          .replace(/\s*-{3,}$/, '')
          // Ensure main bullets use •
          .replace(/^[•\-\*]\s/gm, '• ')
          // Ensure sub-bullets use -
          .replace(/^\s+[•\*]\s/gm, '  - ')
          // Add newlines between main bullet points for readability
          .replace(/(\n• )/g, '\n\n• ');

        processedChunks.push(cleanedResult);
        debugLog('AI Processing', 'Processed chunk result', {
          chunkIndex: i + 1,
          inputTokens: chunkTokens,
          outputTokens: estimateTokens(cleanedResult),
          preview: cleanedResult
        });
      }
    }

    if (processedChunks.length === 0) {
      debugLog('AI Processing', 'No chunks were processed successfully', {
        originalContent: !!content,
        cleanedContent: !!cleanedContent
      });
      return content;
    }

    if (processedChunks.length === 1) {
      const result = processedChunks[0];
      debugLog('AI Processing', 'Single chunk result', {
        inputTokens: estimateTokens(cleanedContent),
        outputTokens: estimateTokens(result)
      });
      return result;
    }

    // Join all chunks with double newlines for readability
    const combinedContent = processedChunks.join('\n\n');
    debugLog('AI Processing', 'Multiple chunks combined', {
      numberOfChunks: processedChunks.length,
      totalTokens: estimateTokens(combinedContent),
      preview: combinedContent.substring(0, 100) + '...'
    });

    return combinedContent;

  } catch (error) {
    debugLog('AI Processing', 'Error processing with AI', { error });
    return content;
  }
}

// Helper function to split content into chunks
function splitIntoChunks(text, tokenLimit) {
  updateOperationStatus({ 
    type: 'loading',
    message: 'Splitting content into chunks ...',
    progress: 65 
  });

  // Calculate available tokens for content, leaving room for context and overhead
  const availableTokens = tokenLimit - TOKEN_LIMITS.PROMPT_RESERVE;
  const sourceTokens = estimateTokens(text);
  
  debugLog('Chunk Processing', 'Starting content analysis', {
    totalTokens: sourceTokens,
    tokenLimit,
    availableTokens,
    estimatedChunks: Math.ceil(sourceTokens / availableTokens)
  });

  if (sourceTokens <= availableTokens) {
    debugLog('Chunk Processing', 'Content fits in single chunk', {
      contentTokens: sourceTokens,
      availableTokens
    });
    return [text];
  }
  
  const chunks = [];
  
  // Split into sentences more carefully, preserving newlines
  const sentences = text.split(/([.!?]\s+|\n+)/).reduce((acc, current, i, arr) => {
    if (i % 2 === 0) {
      return acc.concat(current + (arr[i + 1] || ''));
    }
    return acc;
  }, []).filter(s => s.trim());

  debugLog('Chunk Processing', `Split into ${sentences.length} sentences`);
  
  updateOperationStatus({ 
    type: 'loading',
    message: 'Performing sentence analysis...',
    progress: 75 
  });


  let currentChunk = '';
  let currentChunkTokens = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceTokens = estimateTokens(sentence);
    
    debugLog('Chunk Processing', `Processing sentence ${i + 1}/${sentences.length}`, {
      sentenceTokens,
      currentChunkTokens,
      wouldExceedLimit: currentChunkTokens + sentenceTokens > availableTokens
    });

    if (currentChunkTokens + sentenceTokens > availableTokens) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        debugLog('Chunk Processing', `Created chunk`, {
          tokens: currentChunkTokens,
          sentences: currentChunk.split(/[.!?]\s+/).length
        });
        currentChunk = '';
        currentChunkTokens = 0;
      }
      
      if (sentenceTokens > availableTokens) {
        debugLog('Chunk Processing', 'Processing long sentence', {
          sentenceTokens,
          availableTokens
        });
        
        const paragraphs = sentence.split(/\n\s*\n/);
        for (const paragraph of paragraphs) {
          const paragraphTokens = estimateTokens(paragraph);
          
          if (paragraphTokens <= availableTokens) {
            chunks.push(paragraph.trim());
            debugLog('Chunk Processing', `Created paragraph chunk`, {
              tokens: paragraphTokens
            });
          } else {
            const clauses = paragraph.split(/([,;]\s+)/).reduce((acc, current, i, arr) => {
              if (i % 2 === 0) {
                return acc.concat(current + (arr[i + 1] || ''));
              }
              return acc;
            }, []);
            
            let clauseChunk = '';
            let clauseTokens = 0;
            
            for (const clause of clauses) {
              const clauseEstTokens = estimateTokens(clause);
              
              if (clauseTokens + clauseEstTokens > availableTokens) {
                if (clauseChunk) {
                  chunks.push(clauseChunk.trim());
                  debugLog('Chunk Processing', `Created clause chunk`, {
                    tokens: clauseTokens
                  });
                  clauseChunk = '';
                  clauseTokens = 0;
                }
              }
              
              clauseChunk += clause;
              clauseTokens += clauseEstTokens;
            }
            
            if (clauseChunk) {
              chunks.push(clauseChunk.trim());
              debugLog('Chunk Processing', `Created final clause chunk`, {
                tokens: clauseTokens
              });
            }
          }
        }
      } else {
        currentChunk = sentence;
        currentChunkTokens = sentenceTokens;
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentChunkTokens += sentenceTokens;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
    debugLog('Chunk Processing', `Created final chunk`, {
      tokens: currentChunkTokens
    });
  }

  debugLog('Chunk Processing', 'Finished processing', {
    originalTokens: sourceTokens,
    chunks: chunks.length,
    chunkDetails: chunks.map(chunk => ({
      tokens: estimateTokens(chunk),
      sentences: chunk.split(/[.!?]\s+/).length,
      preview: chunk.substring(0, 100) + '...'
    }))
  });

  return chunks;
}

async function extractPageContent(tabId) {
  debugLog('Extraction', 'Starting content extraction', { tabId });

  try {
    // Extract the raw content from the page
    const [{ result: rawContent }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const debug = (stage, message, data = null) => {
          console.log(`[Orma Debug - Content Script] ${stage}: ${message}`, data ? data : '');
        };

        try {
          debug('DOM', 'Starting content extraction');

          // Function to extract text content from an element
          const extractText = (element) => {
            if (!element) return '';

            // Get all text nodes
            const textNodes = [];
            const walk = document.createTreeWalker(
              element,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: (node) => {
                  // Skip hidden elements
                  let parent = node.parentElement;
                  while (parent) {
                    const style = window.getComputedStyle(parent);
                    if (style.display === 'none' || style.visibility === 'hidden') {
                      return NodeFilter.FILTER_REJECT;
                    }
                    parent = parent.parentElement;
                  }
                  
                  // Accept non-empty text nodes
                  return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
              }
            );

            let node;
            while (node = walk.nextNode()) {
              const parent = node.parentElement;
              if (parent) {
                const tagName = parent.tagName.toLowerCase();
                const text = node.textContent.trim();

                // Skip common UI elements
                if (parent.getAttribute('role') === 'button' ||
                    parent.onclick ||
                    parent.classList.contains('button') ||
                    parent.classList.contains('btn') ||
                    /btn|button|nav|menu|sidebar|widget|popup|modal|cookie|newsletter|social|share/.test(parent.className)) {
                  continue;
                }

                // Format based on element type
                if (/^h[1-6]$/.test(tagName)) {
                  textNodes.push(`\n# ${text}\n`);
                } else if (tagName === 'li') {
                  textNodes.push(`\n- ${text}`);
                } else if (tagName === 'p' || (tagName === 'div' && text.length > 30)) {
                  textNodes.push(`\n${text}\n`);
                } else if (text.length > 20 || text.includes('.')) {
                  textNodes.push(text);
                }
              }
            }

            return textNodes.join(' ');
          };

          // Try to find the main content container
          const selectors = [
            'article',
            '[role="main"]',
            'main',
            '#main-content',
            '.main-content',
            '.article-content',
            '.post-content',
            '.entry-content',
            '.content',
            '#content'
          ];

          let mainContent = null;
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
              const text = extractText(element);
              if (text.length > 200) {  // Reasonable content length
                mainContent = text;
                debug('Content', `Found main content using selector: ${selector}`, {
                  length: text.length
                });
                break;
              }
            }
          }

          // Fallback to body if no main content found
          if (!mainContent) {
            debug('Content', 'No main content found, extracting from body');
            mainContent = extractText(document.body);
          }     

          // Clean up the extracted content
          const cleanContent = mainContent
            .replace(/\s+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          debug('Content', 'Content extracted', {
            length: cleanContent.length,
            preview: cleanContent.substring(0, 100) + '...'
          });

          return cleanContent;
        } catch (error) {
          debug('Error', 'Content extraction failed', { 
            error: error.message,
            stack: error.stack 
          });
          return '';
        }
      },
    });

    debugLog('Extraction', 'Raw content extracted', {
      contentLength: rawContent?.length || 0,
      hasContent: !!rawContent,
      preview: rawContent?.substring(0, 100)
    });

    if (!rawContent) {
      throw new Error('No content found on page');
    }

    // Process the content with AI
    const processedContent = await processWithAI(rawContent);
    
    debugLog('Final', 'Content processing complete', {
      rawLength: rawContent.length,
      processedLength: processedContent.length,
      success: processedContent.length > 0
    });

    return processedContent;

  } catch (error) {
    debugLog('Error', 'Content extraction failed', { error: error.message });
    throw new Error(`Could not extract page content: ${error.message}`);
  }
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

async function addMemory(content, projectId, metadata = {}) {
  try {
    updateOperationStatus({ 
      type: 'loading',
      message: 'Processing new memory...',
      progress: 10 
    });

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

    // Generate a temporary ID for the memory
    const tempId = Date.now().toString();

    // Notify UI that memory processing has started with the temporary ID
    chrome.runtime.sendMessage({
      type: 'memoryProcessingStarted',
      memoryId: tempId
    });

    // Add to short-term buffer
    const newMemory = {
      content: memoryContent,
      timestamp: Date.now(),
      projectId,
      importance,
      metadata
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
      metadata
    });

    // Check if buffer needs compression
    if (shortTermBuffer.length >= TOKEN_LIMITS.SHORT_TERM) {
      console.log('Buffer full, starting compression...');
      await compressShortTermMemory(projectId);
    }

    // Notify UI that memory processing is complete, including both IDs for cleanup
    chrome.runtime.sendMessage({
      type: 'memoryProcessingComplete',
      memoryId: storedMemory.id,
      tempId: tempId
    });

    updateOperationStatus({ 
      type: 'success',
      message: 'Memory saved successfully',
      progress: 100 
    });

    // Clear status after 2 seconds
    setTimeout(clearOperationStatus, 2000);

    return storedMemory;
  } catch (error) {
    console.error("Error in addMemory:", error);
    const fallbackMemory = await storeMemory({
      content: `[${new Date().toISOString()}]\n${content}\n\nContext: Saved from webpage`,
      projectId,
      timestamp: Date.now(),
      type: "raw",
      importance: 5,
    });

    // Notify UI of completion even in case of error
    chrome.runtime.sendMessage({
      type: 'memoryProcessingComplete',
      memoryId: fallbackMemory.id
    });

    updateOperationStatus({ 
      type: 'error',
      message: 'Failed to save memory: ' + error.message 
    });
    
    // Clear error status after 3 seconds
    setTimeout(clearOperationStatus, 3000);

    return fallbackMemory;
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
    shortTermBuffer = shortTermBuffer.filter(memory => 
      !compressedTimestamps.has(memory.timestamp)
    );
    
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

async function compressMemories(memories, projectId) {
  try {
    const timestamp = new Date().toISOString();
    const summarizer = await ai.summarizer.create();
    
    // Group memories by semantic similarity
    const groups = [];
    const assigned = new Set();

    for (const memory of memories) {
      if (assigned.has(memory.id)) continue;

      try {
        const similar = await vectorService.findSimilarMemories(
          memory.content,
          projectId
        );
        
        const group = [memory];
        assigned.add(memory.id);

        for (const similarMemory of similar) {
          if (!assigned.has(similarMemory.id)) {
            group.push(similarMemory);
            assigned.add(similarMemory.id);
          }
        }

        if (group.length > 1) {
          groups.push(group);
        }
      } catch (error) {
        console.error('Error finding similar memories:', error);
        // If vector search fails, just use the single memory
        if (!assigned.has(memory.id)) {
          groups.push([memory]);
          assigned.add(memory.id);
        }
      }
    }

    // Compress each group
    const compressedMemories = await Promise.all(
      groups.map(async (group) => {
        const content = group
          .map(m => m.content)
          .join('\n\n');

        const summary = await summarizer.summarize(
          `${content}\n\nCreate a concise synthesis. Format as:\n` +
          `SUMMARY:\n[core insights]\n\nKEY POINTS:\n[Bullet points]\n\n` +
          `RELATIONSHIPS:\n[Connections]\n\nDETAILS:\n[Important specifics]`
        );

        return {
          projectId,
          content: summary,
          timestamp,
          type: 'compressed',
          importance: Math.max(...group.map(m => m.importance || 0)),
          metadata: {
            sourceIds: group.map(m => m.id),
            compressionType: 'semantic'
          }
        };
      })
    );

    summarizer.destroy();
    return compressedMemories;
  } catch (error) {
    console.error('Error in semantic compression:', error);
    throw error;
  }
}

async function storeMemory(memory) {
  updateOperationStatus({ 
    type: 'loading',
    message: 'Generating vector embeddings for memory...',
    progress: 90 
  });

  try {
    const id = await db.addMemory(memory);
    const storedMemory = { ...memory, id };

    // Generate and store embedding
    try {
      const embedding = await vectorService.generateEmbedding(memory.content);
      await db.updateMemory(id, {
        ...storedMemory,
        metadata: {
          ...storedMemory.metadata,
          embedding
        }
      });

      // Update graph connections in the background
      vectorService.buildGraphConnections(memory.projectId).catch(console.error);
    } catch (error) {
      console.error('Error generating embedding:', error);
      // Don't throw here, we still want to store the memory even if embedding fails
    }

    return storedMemory;
  } catch (error) {
    console.error('Error storing memory:', error);
    throw error;
  }
}

async function selectMemoriesWithinTokenLimit(memories, tokenLimit) {
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
      `SUMMARY:\n[core insights]\n\nKEY POINTS:\n[Bullet points]\n\n` +
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
  try {
    return await db.getRecentCompressedMemories(projectId, hoursAgo);
  } catch (error) {
    console.error('Error getting recent compressed memories:', error);
    throw error;
  }
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
1. Format source URLs elegantly
2. Include relevant section titles
3. Note specific references

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

async function getAllMemories(projectId) {
  updateOperationStatus({ 
      type: 'loading',
      message: 'Finding relevant memories...',
      progress: 12 
    });

  try {
    return await db.getAllMemories(projectId);
  } catch (error) {
    console.error('Error getting memories:', error);
    throw error;
  }
}

async function getProject(projectId) {
  try {
    return await db.getProject(projectId);
  } catch (error) {
    console.error('Error getting project:', error);
    throw error;
  }
}

// Advanced sliding window algorithm optimized for Nano AI's 1024 token context window
async function processMemoriesWithSlidingWindow(memories, projectId) {
  const NANO_CONTEXT_SIZE = 1024;
  const maxWindowSize = Math.floor(NANO_CONTEXT_SIZE * 0.8); // 819 tokens for main content
  const minWindowSize = Math.floor(NANO_CONTEXT_SIZE * 0.2); // 204 tokens minimum chunk
  const overlapSize = Math.floor(NANO_CONTEXT_SIZE * 0.1); // 102 tokens overlap
  
  try {
    let processedMemories = [];
    let currentWindow = [];
    let currentTokens = 0;
    let windowStart = 0;
    
    // Helper to detect natural fact boundaries (optimized for smaller chunks)
    const isFactBoundary = (memory) => {
      const content = memory.content;
      // Prioritize stronger boundaries for smaller chunks
      if (/^#|^\s*[-*•]/.test(content)) return 2; // Strong boundary (heading/list)
      if (/[.!?]\s*$/.test(content)) return 1;   // Medium boundary (sentence)
      if (/\n\s*\n/.test(content)) return 0.5;   // Weak boundary (paragraph)
      return 0;                                   // No natural boundary
    };
    
    // Helper to estimate optimal window size based on content density
    const getOptimalWindowSize = (memories, start) => {
      const nextFewMemories = memories.slice(start, Math.min(start + 3, memories.length));
      const avgDensity = nextFewMemories.reduce((sum, m) => {
        // Calculate content density score
        const codeBlockCount = (m.content.match(/```/g) || []).length;
        const listItemCount = (m.content.match(/^\s*[-*•]/gm) || []).length;
        const sentenceCount = (m.content.match(/[.!?]\s/g) || []).length;
        
        // Density score: higher means more complex content
        const density = (codeBlockCount * 3 + listItemCount * 2 + sentenceCount) / 
                       Math.max(1, m.content.length / 100);
        return sum + density;
      }, 0) / nextFewMemories.length;
      
      // Adjust window size inversely to density
      // Dense content = smaller windows for better processing
      const sizeMultiplier = 1 / (1 + Math.min(avgDensity, 1));
      return Math.max(minWindowSize, 
             Math.min(maxWindowSize, Math.floor(maxWindowSize * sizeMultiplier)));
    };

    while (windowStart < memories.length) {
      const optimalSize = getOptimalWindowSize(memories, windowStart);
      let windowEnd = windowStart;
      currentTokens = 0;
      currentWindow = [];
      let bestBoundaryScore = -1;
      let bestBoundaryIndex = -1;
      
      // Build window while respecting token limit and looking for natural boundaries
      while (windowEnd < memories.length) {
        const nextMemory = memories[windowEnd];
        const nextTokens = estimateTokens(nextMemory.content);
        
        if (currentTokens + nextTokens > optimalSize) {
          // If we found any good boundaries, use the best one
          if (bestBoundaryIndex >= 0) {
            windowEnd = bestBoundaryIndex + 1;
            currentWindow = memories.slice(windowStart, windowEnd);
          }
          break;
        }
        
        // Track the best boundary we've seen
        const boundaryScore = isFactBoundary(nextMemory);
        if (boundaryScore > bestBoundaryScore) {
          bestBoundaryScore = boundaryScore;
          bestBoundaryIndex = windowEnd;
        }
        
        currentWindow.push(nextMemory);
        currentTokens += nextTokens;
        windowEnd++;
      }
      
      if (currentWindow.length > 0) {
        // Process window with minimal but essential context
        const contextWindow = processedMemories.length > 0 
          ? [processedMemories[processedMemories.length - 1]] // Just one previous memory for context
          : [];
          
        const processedWindow = await compressMemories(
          [...contextWindow, ...currentWindow],
          projectId
        );
        
        processedMemories.push(...processedWindow);
        
        // Slide window with minimal overlap to stay within token limits
        windowStart = Math.max(
          windowStart + 1,
          windowEnd - Math.ceil(overlapSize / Math.max(50, estimateTokens(currentWindow[0].content)))
        );
      } else {
        // Emergency fallback: process single memory
        const singleMemory = await compressRawMemoriesOnly([memories[windowStart]], projectId);
        if (singleMemory) processedMemories.push(singleMemory);
        windowStart++;
      }
    }
    
    return processedMemories.filter(Boolean);
  } catch (error) {
    console.error('Error in sliding window processing:', error);
    return compressRawMemoriesOnly(memories, projectId);
  }
}

// Status management functions
function updateOperationStatus(status) {
  currentOperationStatus = status;
  chrome.runtime.sendMessage({ 
    type: 'STATUS_UPDATE', 
    status 
  }).catch(() => {
    // Ignore errors when popup is not open
  });
}

function clearOperationStatus() {
  currentOperationStatus = null;
  updateOperationStatus(null);
}

// Message handlers for status
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_OPERATION_STATUS') {
    sendResponse({ status: currentOperationStatus });
    return true;
  }
});

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
  if (info.menuItemId === "save-page-to-orma") {
    try {
      const { currentProjectId } = await chrome.storage.local.get("currentProjectId");

      if (!currentProjectId) {
        await showNotification(tab, "Please select a project in Orma first", "error");
        return;
      }

      await showNotification(tab, "Extracting page content...", "info");
      updateOperationStatus({ 
        type: 'loading',
        message: 'Extracting content...',
        progress: 5 
      });
      const pageContent = await extractPageContent(tab.id);
      
      if (!pageContent) {
        await showNotification(tab, "Could not extract page content", "error");
        return;
      }

      const metadata = {
        source: tab.url,
        title: tab.title,
        timestamp: new Date().toISOString()
      };

      await addMemory(pageContent, currentProjectId, metadata);
      await showNotification(tab, "Page saved to Orma memory!", "success");
    } catch (error) {
      console.error("Error saving page:", error);
      await showNotification(tab, "Error saving to Orma: " + error.message, "error");
    }
  }
});

async function generateMemoryContent(extractedContent, url, title) {
  const prompt = `You are a precise and elegant note-taking assistant. Create a beautifully structured memory from the following webpage content. Focus on clarity, elegance, and meaningful insights.

Format the response in clean sections:

SUMMARY:
A concise, well-crafted overview that captures the essence in 2-3 sentences.

KEY POINTS:
• Highlight key insights with elegant bullet points
• Each point should be clear and meaningful
• Use proper markdown for emphasis where needed
• If code is involved, format it properly with language tags

RELATIONSHIPS:
• Note connections to relevant concepts
• Highlight technical dependencies if present
• Identify key technologies or frameworks mentioned

DETAILS:
Present important details in a clean, organized manner. Use proper markdown formatting:
- Use headings (##) for subsections
- Format code snippets with proper language tags
- Use *emphasis* for important terms
- Create tables if data is structured
- Use > for important quotes

Source Memories:
1. Format source URLs elegantly
2. Include relevant section titles
3. Note specific references

Content to analyze:
Title: ${title}
URL: ${url}
Content:
${extractedContent}`;

  try {
    const response = await ai.writer.writeText(prompt);
    return response;
  } catch (error) {
    console.error('Error generating memory:', error);
    return null;
  }
}

function formatCodeInContent(content) {
  // Format code blocks with proper language detection
  content = content.replace(/```([\s\S]*?)```/g, (match, code) => {
    const lines = code.trim().split('\n');
    let language = 'text';
    
    // Detect language from common patterns
    if (lines[0].includes('function') || lines[0].includes('const') || lines[0].includes('let')) {
      language = 'javascript';
    } else if (lines[0].includes('def ') || lines[0].includes('import ')) {
      language = 'python';
    } else if (lines[0].includes('<') && lines[0].includes('>')) {
      language = 'html';
    }
    
    return '```' + language + '\n' + code.trim() + '\n```';
  });

  // Format inline code
  content = content.replace(/`([^`]+)`/g, (match, code) => {
    return '`' + code.trim() + '`';
  });

  return content;
}

async function processContent(content, url) {
  try {
    const title = await getCurrentTabTitle();
    let memoryContent = await generateMemoryContent(content, url, title);
    
    if (memoryContent) {
      // Format code blocks and inline code
      memoryContent = formatCodeInContent(memoryContent);
      
      // Ensure consistent section spacing
      memoryContent = memoryContent.replace(/\n{3,}/g, '\n\n');
      
      // Format bullet points consistently
      memoryContent = memoryContent.replace(/^[•●-]\s*/gm, '• ');
      
      // Format numbered lists consistently
      memoryContent = memoryContent.replace(/^\d+\.\s+/gm, (match) => {
        return match.trim() + ' ';
      });
      
      // Add proper spacing around headings
      memoryContent = memoryContent.replace(/^(#+.*?)$/gm, '\n$1\n');
    }
    
    return memoryContent;
  } catch (error) {
    console.error('Error processing content:', error);
    return null;
  }
}
