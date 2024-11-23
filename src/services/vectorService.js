import OpenAI from 'openai';
import db from './db';

class VectorService {
  constructor() {
    this.dimensions = 1536; // OpenAI ada-002 embedding dimensions
    this.similarityThreshold = 0.6; // Lowered threshold for better semantic matching
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
      // Get similar memories with a lower threshold but strict limit
      const similarMemories = await this.findSimilarMemories(query, projectId, 3);
      
      // Only include highly relevant memories
      return {
        similar: similarMemories.filter(m => m.similarity > this.similarityThreshold),
        connected: [] // We'll focus only on directly relevant memories
      };
    } catch (error) {
      console.error('Error getting contextualized memories:', error);
      throw error;
    }
  }

  async generateChatResponse(query, context, projectId) {
    if (!this.openai) {
      throw new Error('Vector service not initialized');
    }

    try {
      const project = await db.getProject(projectId);
      const projectName = project?.name || 'this project';

      // Prepare context from similar and connected memories
      const contextMemories = [
        ...context.similar,
        ...context.connected
      ];

      const contextText = contextMemories
        .map(m => `[Memory ${m.id}]: ${m.content}`)
        .join('\n\n');

      const response = await this.openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        messages: [
          {
            role: "system",
            content: `You are a helpful and knowledgeable assistant for ${projectName}. 
            You have access to the project's memories and context.
            When responding:
            1. Base your responses on the provided context memories
            2. Cite specific memories using their ID (e.g., [Memory 123])
            3. If you're unsure about something, acknowledge the limitations of your knowledge
            4. Keep responses concise but informative
            5. Maintain a friendly, conversational tone while being professional`
          },
          {
            role: "user",
            content: `Context memories:\n${contextText}\n\nUser question: ${query}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      return {
        content: response.choices[0].message.content,
        sources: contextMemories.map(m => ({
          id: m.id,
          preview: m.content.slice(0, 150) + (m.content.length > 150 ? '...' : '')
        }))
      };
    } catch (error) {
      console.error('Error generating chat response:', error);
      throw error;
    }
  }

  async compressShortTermMemory(memories) {
    try {
      if (!memories || memories.length === 0) {
        return '';
      }

      // Find the most recent compressed memory with KEY POINTS
      const compressedMemory = memories
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .find(memory => memory.content.includes('KEY POINTS:'));

      if (!compressedMemory) {
        return '';
      }

      // Extract only the KEY POINTS section
      const keyPointsMatch = compressedMemory.content.match(/KEY POINTS:([^]*?)(?=\n\nSource Memories:|$)/);
      if (!keyPointsMatch) {
        return '';
      }

      // Format the key points with the introduction
      return `Here are some relevant memories to help answer better (don't respond to these memories but use them to assist in the response if relevant):\n${keyPointsMatch[1].trim()}`;

    } catch (error) {
      console.error('Error compressing memories:', error);
      return '';
    }
  }
}

export const vectorService = new VectorService();
