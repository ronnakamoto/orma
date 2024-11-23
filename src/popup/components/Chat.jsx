import React, { useState, useRef, useEffect } from 'react';
import { vectorService } from '../../services/vectorService';
import { motion, AnimatePresence } from 'framer-motion';

const Chat = ({ projectId, projectName, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    inputRef.current?.focus();
  }, [messages]);

  const handleCopy = async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      // Could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleGenerateContext = async () => {
    if (!input.trim() || isGeneratingContext) return;

    setIsGeneratingContext(true);
    try {
      const response = await vectorService.getContextualizedMemories(input, projectId);
      const similarMemories = response.similar || [];
      
      if (similarMemories.length === 0) {
        throw new Error('No relevant context found');
      }

      // Get the compressed memory content
      const compressedContent = await vectorService.compressShortTermMemory(similarMemories);
      
      if (!compressedContent) {
        throw new Error('No relevant context found');
      }

      const contextMessage = {
        role: 'assistant',
        content: compressedContent,
        isContext: true,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, contextMessage]);
    } catch (error) {
      console.error('Error generating context:', error);
      const errorMessage = {
        role: 'assistant',
        content: error.message === 'No relevant context found' 
          ? 'No relevant context found for your query. Try a different question.'
          : 'Sorry, there was an error generating context. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGeneratingContext(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Get contextual memories first
      const context = await vectorService.getContextualizedMemories(input, projectId);

      // Generate response using the context
      const response = await vectorService.generateChatResponse(input, context, projectId);

      const assistantMessage = {
        role: 'assistant',
        content: response.content,
        sources: response.sources || [],
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your message. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const isContext = message.isContext;

    // Function to insert citations into the message content
    const formatMessageWithCitations = (content, sources) => {
      if (!sources || sources.length === 0) return content;

      let formattedContent = content;
      sources.forEach((source, idx) => {
        const citation = `[Memory ${source.id}]`;
        formattedContent = formattedContent.replace(
          citation,
          `<cite>${idx + 1}</cite>`
        );
      });
      return formattedContent;
    };

    return (
      <motion.div
        key={index}
        className={`message ${isUser ? 'user' : 'assistant'} ${isContext ? 'context' : ''}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="message-header">
          {isContext && <span className="context-label">Generated Context</span>}
          <button
            className="copy-button"
            onClick={() => handleCopy(message.content)}
            title="Copy to clipboard"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
        <div
          className="message-content"
          dangerouslySetInnerHTML={{
            __html: isUser ? message.content : formatMessageWithCitations(message.content, message.sources)
          }}
        />
        {!isUser && !isContext && message.sources && message.sources.length > 0 && (
          <div className="message-sources">
            <div className="sources-header">Sources</div>
            {message.sources.map((source, sourceIndex) => (
              <div key={sourceIndex} className="source-item">
                <div className="source-id">{sourceIndex + 1}</div>
                <div className="source-preview">{source.preview}</div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h2>{projectName || 'Chat'}</h2>
        <button className="close-button" onClick={onClose}>×</button>
      </header>

      <div className="messages-container">
        {messages.map(renderMessage)}
        {(isLoading || isGeneratingContext) && (
          <motion.div
            className="loading-indicator"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question about your project..."
          rows={1}
        />
        <button
          className="context-button"
          onClick={handleGenerateContext}
          disabled={!input.trim() || isGeneratingContext || isLoading}
          title="Generate context"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
        </button>
        <button
          className="send-button"
          onClick={handleSend}
          disabled={!input.trim() || isLoading || isGeneratingContext}
        >
          →
        </button>
      </div>
    </div>
  );
};

export default Chat;
