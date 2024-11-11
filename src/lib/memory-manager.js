import { chromeai } from 'chrome-ai';
import { generateText, embedMany, cosineSimilarity } from 'ai';

export class MemoryManager {
  constructor() {
    this.model = chromeai('text', { temperature: 0.7 });
    this.embeddingModel = chromeai('embedding');
    this.shortTermBuffer = [];
    this.TOKEN_LIMITS = {
      SHORT_TERM: 20,  // messages
      LONG_TERM: 10000,  // tokens
      BUFFER_COMPRESSION: 20  // messages before compression
    };
  }

  async addMemory(content, projectId) {
    // Add to short-term buffer
    this.shortTermBuffer.push({
      content,
      timestamp: Date.now(),
      projectId
    });

    // Check if buffer needs compression
    if (this.shortTermBuffer.length >= this.TOKEN_LIMITS.BUFFER_COMPRESSION) {
      await this.compressShortTermMemory(projectId);
    }

    // Generate embedding for the new content
    const embedding = await this.generateEmbedding(content);

    // Store the raw memory with its embedding
    return await this.storeMemory({
      content,
      projectId,
      embedding,
      timestamp: Date.now(),
      type: 'raw',
      importance: await this.calculateImportance(content)
    });
  }

  async compressShortTermMemory(projectId) {
    const bufferContent = this.shortTermBuffer
      .map(m => m.content)
      .join('\n\n');

    // Generate summary using ChromeAI
    const { text: summary } = await generateText({
      model: this.model,
      prompt: `Summarize these memories concisely while preserving key information:\n\n${bufferContent}`
    });

    // Store compressed memory
    await this.storeMemory({
      content: summary,
      projectId,
      embedding: await this.generateEmbedding(summary),
      timestamp: Date.now(),
      type: 'compressed',
      importance: await this.calculateImportance(summary),
      sourceCount: this.shortTermBuffer.length
    });

    // Clear buffer
    this.shortTermBuffer = [];
  }

  async calculateImportance(content) {
    const { text: importanceStr } = await generateText({
      model: this.model,
      prompt: `On a scale of 1-10, rate the importance of this information for future context:\n\n${content}\n\nImportance rating:`
    });
    return parseInt(importanceStr) || 5; // default to 5 if parsing fails
  }

  async generateEmbedding(text) {
    const { embeddings } = await embedMany({
      model: this.embeddingModel,
      values: [text]
    });
    return embeddings[0];
  }

  async retrieveRelevantMemories(query, projectId, limit = 5) {
    const queryEmbedding = await this.generateEmbedding(query);
    
    // Get all memories for the project
    const memories = await this.getAllMemories(projectId);
    
    // Calculate relevance scores
    const scoredMemories = memories.map(memory => {
      const similarityScore = cosineSimilarity(queryEmbedding, memory.embedding);
      const temporalScore = this.calculateTemporalScore(memory.timestamp);
      const importanceScore = memory.importance / 10;

      // Weighted combination of scores
      const totalScore = (
        similarityScore * 0.6 +
        temporalScore * 0.2 +
        importanceScore * 0.2
      );

      return { ...memory, relevanceScore: totalScore };
    });

    // Sort by relevance and return top results
    return scoredMemories
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  calculateTemporalScore(timestamp) {
    const age = Date.now() - timestamp;
    const dayInMs = 24 * 60 * 60 * 1000;
    const ageInDays = age / dayInMs;
    // Decay function: 1 for very recent memories, approaching 0 for old ones
    return Math.exp(-ageInDays / 30); // 30-day half-life
  }

  async formRootMemory(projectId) {
    const memories = await this.getAllMemories(projectId);
    const totalContent = memories
      .sort((a, b) => b.importance - a.importance)
      .map(m => m.content)
      .join('\n\n');

    const { text: rootMemory } = await generateText({
      model: this.model,
      prompt: `Create a comprehensive summary that captures the essential knowledge and insights from these memories:\n\n${totalContent}`
    });

    return await this.storeMemory({
      content: rootMemory,
      projectId,
      embedding: await this.generateEmbedding(rootMemory),
      timestamp: Date.now(),
      type: 'root',
      importance: 10, // Root memories are maximally important
    });
  }

  // IndexedDB operations
  async storeMemory(memory) {
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

  async getAllMemories(projectId) {
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
}