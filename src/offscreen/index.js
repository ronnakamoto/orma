import { chromeai } from 'chrome-ai';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';

console.log('Orma AI Worker initialized');

const model = chromeai('text', {
  temperature: 0.7,
  topK: 5
});

async function enhanceMemory(content, projectContext = '') {
  try {
    const { text } = await generateText({
      model,
      prompt: `Enhance this memory with additional context and insights. Preserve the original meaning while adding helpful structure and connections.
              
              Project Context: ${projectContext}
              Original Content: ${content}
              
              Output the enhanced memory in a clear format that will be valuable for future reference.`
    });
    
    return text;
  } catch (error) {
    console.error('Error enhancing memory:', error);
    return content;
  }
}

async function calculateImportance(content, existingMemories) {
  try {
    const { object } = await generateObject({
      model,
      schema: z.object({
        score: z.number().min(1).max(10),
        reasoning: z.array(z.string())
      }),
      prompt: `Analyze this new memory and calculate its importance score (1-10) based on:
              - Uniqueness compared to existing memories
              - Information density and value
              - Potential future relevance
              - Connections to other memories

              New Memory:
              ${content}

              Existing Memories:
              ${existingMemories.map(m => m.content).slice(0, 5).join('\n\n')}
              
              Provide a score and explain your reasoning.`
    });

    return {
      score: Math.round(object.score),
      reasoning: object.reasoning
    };
  } catch (error) {
    console.error('Error calculating importance:', error);
    const contentWords = content.toLowerCase().split(/\s+/);
    let uniqueScore = 1;

    for (const memory of existingMemories) {
      const memoryWords = memory.content.toLowerCase().split(/\s+/);
      const overlap = contentWords.filter(word => memoryWords.includes(word)).length;
      const overlapRatio = overlap / contentWords.length;
      uniqueScore = Math.min(uniqueScore, 1 - overlapRatio);
    }

    const lengthScore = Math.min(contentWords.length / 100, 1);
    return {
      score: Math.ceil((uniqueScore * 0.7 + lengthScore * 0.3) * 10),
      reasoning: ['Score calculated based on content uniqueness and length']
    };
  }
}

async function compressMemories(memories) {
  try {
    const { object } = await generateObject({
      model,
      schema: z.object({
        summary: z.string(),
        key_points: z.array(z.string()),
        relationships: z.array(z.object({
          point: z.string(),
          connected_to: z.array(z.string())
        }))
      }),
      prompt: `Analyze and compress these related memories while preserving key information and relationships:
              ${memories.map(m => m.content).join('\n\n===\n\n')}
              Create a structured summary that captures the essential information, key points, and relationships between ideas.`
    });

    return `COMPRESSED MEMORY
Summary: ${object.summary}

Key Points:
${object.key_points.map(point => `- ${point}`).join('\n')}

Relationships:
${object.relationships.map(rel => 
  `- ${rel.point}\n  Connected to:\n${rel.connected_to.map(c => `    * ${c}`).join('\n')}`
).join('\n')}`;
  } catch (error) {
    console.error('Error compressing memories:', error);
    return memories.map(m => m.content).join('\n\n---\n\n');
  }
}

async function generateRootMemory(memories) {
  try {
    const { object } = await generateObject({
      model,
      schema: z.object({
        overview: z.string(),
        main_themes: z.array(z.object({
          theme: z.string(),
          description: z.string(),
          related_memories: z.array(z.string())
        })),
        insights: z.array(z.string())
      }),
      prompt: `Create a comprehensive root memory from these individual memories by identifying main themes and drawing insights:
              ${memories.map(m => m.content).join('\n\n===\n\n')}
              Synthesize the information into a structured format that captures key themes, patterns, and relationships.`
    });

    return `ROOT MEMORY

Overview:
${object.overview}

Main Themes:
${object.main_themes.map(theme => 
  `## ${theme.theme}
${theme.description}
Related memories:
${theme.related_memories.map(m => `- ${m}`).join('\n')}`
).join('\n\n')}

Key Insights:
${object.insights.map(insight => `* ${insight}`).join('\n')}`;
  } catch (error) {
    console.error('Error generating root memory:', error);
    return memories
      .sort((a, b) => b.importance - a.importance)
      .map(m => m.content)
      .join('\n\n===\n\n');
  }
}

// Handle messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AI_OPERATION') {
    (async () => {
      try {
        let result;
        switch (message.operation) {
          case 'enhanceMemory':
            result = await enhanceMemory(message.data.content, message.data.projectContext);
            break;
          case 'calculateImportance':
            result = await calculateImportance(message.data.content, message.data.existingMemories);
            break;
          case 'compressMemories':
            result = await compressMemories(message.data.memories);
            break;
          case 'generateRootMemory':
            result = await generateRootMemory(message.data.memories);
            break;
          default:
            throw new Error('Unknown operation');
        }
        sendResponse(result);
      } catch (error) {
        console.error('Error in AI operation:', error);
        sendResponse({ error: error.message });
      }
    })();
    return true; // Keep the message channel open for the async response
  }
});