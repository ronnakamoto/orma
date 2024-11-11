import { generateText, streamText } from 'ai';
import { chromeai } from 'chrome-ai';

export class OrmaAI {
  constructor(db) {
    this.db = db;
    this.model = chromeai('text', {
      temperature: 0.7
    });
  }

  async generateSummary(projectId) {
    const memories = await this.db.getProjectMemories(projectId);
    const context = memories.map(m => m.content).join('\n\n');
    
    const prompt = `Please provide a concise summary of the following content:\n\n${context}`;
    
    const { text } = await generateText({
      model: this.model,
      prompt
    });
    
    return text;
  }

  async enhancePrompt(originalPrompt, projectId) {
    const memories = await this.db.searchSimilarMemories(originalPrompt);
    const context = memories.map(m => m.content).join('\n\n');
    
    return `Context from your saved memories:\n\n${context}\n\nOriginal prompt:\n${originalPrompt}`;
  }
}