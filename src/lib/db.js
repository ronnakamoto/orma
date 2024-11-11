import { openDB } from 'idb';
import { chromeai } from 'chrome-ai';
import { embedMany, cosineSimilarity } from 'ai';

export class OrmaDB {
  constructor() {
    this.dbPromise = openDB('orma-db', 1, {
      upgrade(db) {
        // Projects store
        const projectStore = db.createObjectStore('projects', {
          keyPath: 'id',
          autoIncrement: true
        });
        projectStore.createIndex('name', 'name');

        // Memories store
        const memoriesStore = db.createObjectStore('memories', {
          keyPath: 'id',
          autoIncrement: true
        });
        memoriesStore.createIndex('projectId', 'projectId');
        memoriesStore.createIndex('timestamp', 'timestamp');
        memoriesStore.createIndex('embedding', 'embedding', { multiEntry: true });
      }
    });
  }

  async getAllProjects() {
    const db = await this.dbPromise;
    return db.getAll('projects');
  }

  async createProject(name) {
    const db = await this.dbPromise;
    return db.add('projects', {
      name,
      created: Date.now()
    });
  }

  async addMemory(projectId, content) {
    const db = await this.dbPromise;
    const memory = {
      projectId,
      content,
      timestamp: Date.now(),
      embedding: await this.generateEmbedding(content)
    };
    return db.add('memories', memory);
  }

  async generateEmbedding(text) {
    const { embeddings } = await embedMany({
      model: chromeai('embedding'),
      values: [text]
    });
    return embeddings[0];
  }

  async searchSimilarMemories(text, limit = 5) {
    const queryEmbedding = await this.generateEmbedding(text);
    const db = await this.dbPromise;
    const memories = await db.getAll('memories');
    
    return memories
      .map(memory => ({
        ...memory,
        similarity: cosineSimilarity(queryEmbedding, memory.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}