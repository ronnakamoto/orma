import React, { useState, useRef, useEffect } from 'react';
import { vectorService } from '../../services/vectorService';
import { motion, AnimatePresence } from 'framer-motion';

const Chat = ({ projectId, projectName, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    inputRef.current?.focus();
  }, [messages]);

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
    
    // Function to insert citations into the message content
    const formatMessageWithCitations = (content, sources) => {
      if (!sources || sources.length === 0) return content;
      
      let formattedContent = content;
      sources.forEach((source, idx) => {
        const citation = `[Memory ${source.id}]`;
        const citationTag = `[${idx + 1}]`;
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
        className={`message ${isUser ? 'user' : 'assistant'}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div 
          className="message-content"
          dangerouslySetInnerHTML={{
            __html: isUser ? message.content : formatMessageWithCitations(message.content, message.sources)
          }}
        />
        {!isUser && message.sources && message.sources.length > 0 && (
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
        {isLoading && (
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
          className="send-button"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          →
        </button>
      </div>
    </div>
  );
};

export default Chat;
