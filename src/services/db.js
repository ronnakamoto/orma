import Dexie from 'dexie';

export class OrmaDatabase extends Dexie {
  constructor() {
    super('orma-db');
    
    this.version(1).stores({
      memories: '++id, projectId, timestamp, type, importance',
      projects: '++id, name, created'
    });

    // Add any custom methods here
    this.memories = this.table('memories');
    this.projects = this.table('projects');
  }

  // Helper methods
  async addMemory(memory) {
    return await this.memories.add(memory);
  }

  async getMemoriesByProject(projectId) {
    return await this.memories.where('projectId').equals(projectId).toArray();
  }

  async getRecentCompressedMemories(projectId, hoursAgo = 24) {
    const cutoffTime = Date.now() - (hoursAgo * 60 * 60 * 1000);
    return await this.memories
      .where('projectId').equals(projectId)
      .and(memory => memory.type === 'compressed' && memory.timestamp >= cutoffTime)
      .toArray();
  }

  async getAllMemories(projectId) {
    return await this.memories
      .where('projectId').equals(projectId)
      .toArray();
  }

  async getProject(projectId) {
    return await this.projects.get(projectId);
  }

  async addProject(project) {
    return await this.projects.add(project);
  }
}

// Create a single instance to be used throughout the app
const db = new OrmaDatabase();
export default db;
