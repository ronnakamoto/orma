import Dexie from 'dexie';

export class OrmaDatabase extends Dexie {
  constructor() {
    super('orma-db');
    
    this.version(1).stores({
      memories: '++id, projectId, timestamp, type, importance',
      projects: '++id, name, created',
      graph: '[projectId+sourceId+targetId], projectId, sourceId, targetId, weight',
      settings: 'key'
    });

    this.memories = this.table('memories');
    this.projects = this.table('projects');
    this.graph = this.table('graph');
    this.settings = this.table('settings');
  }

  // Memory operations
  async addMemory(memory) {
    return await this.memories.add(memory);
  }

  async updateMemory(id, memory) {
    return await this.memories.update(id, memory);
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

  // Graph operations
  async addGraphConnection(connection) {
    const key = {
      projectId: connection.projectId,
      sourceId: connection.sourceId,
      targetId: connection.targetId
    };
    
    try {
      await this.graph.where(key).delete();
      return await this.graph.add({
        ...connection,
        id: `${connection.projectId}-${connection.sourceId}-${connection.targetId}`
      });
    } catch (error) {
      console.error('Error adding graph connection:', error);
      throw error;
    }
  }

  async getGraphConnections(projectId) {
    return await this.graph
      .where('projectId').equals(projectId)
      .toArray();
  }

  async updateGraphConnections(projectId, connections) {
    await this.graph
      .where('projectId').equals(projectId)
      .delete();
    
    const uniqueConnections = connections.reduce((acc, conn) => {
      const key = `${conn.sourceId}-${conn.targetId}`;
      if (!acc[key] || acc[key].weight < conn.weight) {
        acc[key] = conn;
      }
      return acc;
    }, {});
    
    return await Promise.all(
      Object.values(uniqueConnections).map(conn => this.addGraphConnection({
        projectId,
        ...conn
      }))
    );
  }

  // Project operations
  async getProject(projectId) {
    return await this.projects.get(projectId);
  }

  async addProject(project) {
    return await this.projects.add(project);
  }

  // Settings operations
  async getSetting(key) {
    return await this.settings.get(key);
  }

  async setSetting(key, value) {
    return await this.settings.put({ key, value });
  }
}

const db = new OrmaDatabase();
export default db;
