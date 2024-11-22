import OpenAI from 'openai';
import db from './db';

class VectorService {
  constructor() {
    this.dimensions = 1536; // OpenAI ada-002 embedding dimensions
    this.similarityThreshold = 0.75;
    this.openai = null;
  }

  async initialize(apiKey) {
    if (!apiKey) {
      const setting = await db.getSetting('openai_api_key');
      apiKey = setting?.value;
    }
    
    if (!apiKey) {
      throw new Error('OpenAI API key not found');
    }

    this.openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });
  }

  // Generate embeddings for text content
  async generateEmbedding(text) {
    if (!this.openai) {
      throw new Error('Vector service not initialized');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  // Calculate cosine similarity between two vectors
  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // Find similar memories using vector similarity
  async findSimilarMemories(content, projectId, limit = 5) {
    if (!this.openai) {
      throw new Error('Vector service not initialized');
    }

    try {
      const queryEmbedding = await this.generateEmbedding(content);
      const memories = await db.getAllMemories(projectId);
      
      const memoriesWithEmbeddings = await Promise.all(
        memories.map(async (memory) => {
          let embedding = memory.metadata?.embedding;
          if (!embedding) {
            embedding = await this.generateEmbedding(memory.content);
            await db.updateMemory(memory.id, {
              ...memory,
              metadata: {
                ...memory.metadata,
                embedding
              }
            });
          }
          return { ...memory, embedding };
        })
      );

      const memoriesWithSimilarity = memoriesWithEmbeddings.map(memory => ({
        ...memory,
        similarity: this.cosineSimilarity(queryEmbedding, memory.embedding)
      }));

      return memoriesWithSimilarity
        .filter(m => m.similarity >= this.similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      console.error('Error finding similar memories:', error);
      throw error;
    }
  }

  // Build knowledge graph connections based on vector similarity
  async buildGraphConnections(projectId) {
    if (!this.openai) {
      throw new Error('Vector service not initialized');
    }

    try {
      const memories = await db.getAllMemories(projectId);
      const connections = [];

      // First, ensure all memories have embeddings
      for (let i = 0; i < memories.length; i++) {
        let memory = memories[i];
        if (!memory.metadata) {
          memory.metadata = {};
        }
        
        if (!memory.metadata.embedding) {
          const embedding = await this.generateEmbedding(memory.content);
          memory.metadata.embedding = embedding;
          await db.updateMemory(memory.id, memory);
          memories[i] = memory; // Update the memory in our array
        }
      }

      // Then build connections
      for (let i = 0; i < memories.length; i++) {
        const memory = memories[i];
        
        for (let j = i + 1; j < memories.length; j++) {
          const otherMemory = memories[j];
          
          if (!memory.metadata?.embedding || !otherMemory.metadata?.embedding) {
            console.warn('Missing embedding for memory:', memory.id, otherMemory.id);
            continue;
          }

          const similarity = this.cosineSimilarity(
            memory.metadata.embedding,
            otherMemory.metadata.embedding
          );

          if (similarity >= this.similarityThreshold) {
            connections.push({
              sourceId: memory.id,
              targetId: otherMemory.id,
              weight: similarity,
              type: 'semantic'
            });
          }
        }
      }

      if (connections.length > 0) {
        await db.updateGraphConnections(projectId, connections);
      }
      return connections;
    } catch (error) {
      console.error('Error building graph connections:', error);
      throw new Error(`Failed to build graph connections: ${error.message}`);
    }
  }

  // Get contextualized memories for a query
  async getContextualizedMemories(query, projectId) {
    if (!this.openai) {
      throw new Error('Vector service not initialized');
    }

    try {
      const similarMemories = await this.findSimilarMemories(query, projectId);
      const graphConnections = await db.getGraphConnections(projectId);
      
      const connectedMemoryIds = new Set();
      similarMemories.forEach(memory => {
        graphConnections
          .filter(conn => conn.sourceId === memory.id || conn.targetId === memory.id)
          .forEach(conn => {
            connectedMemoryIds.add(conn.sourceId);
            connectedMemoryIds.add(conn.targetId);
          });
      });

      const allMemories = await db.getAllMemories(projectId);
      const connectedMemories = allMemories.filter(m => 
        connectedMemoryIds.has(m.id) && 
        !similarMemories.find(sm => sm.id === m.id)
      );

      return {
        similar: similarMemories,
        connected: connectedMemories
      };
    } catch (error) {
      console.error('Error getting contextualized memories:', error);
      throw error;
    }
  }
}

export const vectorService = new VectorService();
