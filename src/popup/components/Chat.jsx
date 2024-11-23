import React, { useState, useRef, useEffect } from 'react';
import { vectorService } from '../../services/vectorService';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

// Custom components for ReactMarkdown
const MarkdownComponents = {
  // Handle code blocks and inline code
  code: ({ node, inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : 'text';
    
    return !inline ? (
      <div className="code-block-wrapper">
        <div className="language-indicator">
          <span>{language}</span>
        </div>
        <div className="code-content">
          <SyntaxHighlighter
            style={tomorrow}
            language={language}
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: '12px',
              background: 'transparent',
              fontSize: '12px',
              lineHeight: '1.5'
            }}
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        </div>
      </div>
    ) : (
      <code className="inline-code">
        {children}
      </code>
    );
  },
  
  // Enhanced paragraph with proper text wrapping
  p: ({ children }) => (
    <p className={`text-current leading-relaxed mb-4 whitespace-pre-wrap break-words`}>
      {children}
    </p>
  ),

  // Enhanced lists with proper indentation and wrapping
  ul: ({ children }) => (
    <ul className="space-y-2 mb-4 pl-2">
      {children}
    </ul>
  ),

  li: ({ children }) => (
    <li className="flex items-start gap-2 group break-words text-current">
      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-40 group-hover:opacity-60 transition-opacity" />
      <span className="flex-1 -mt-0.5 whitespace-pre-wrap">{children}</span>
    </li>
  ),

  // Enhanced blockquotes with proper text wrapping
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-current border-opacity-20 pl-4 my-4 italic text-current text-opacity-90 whitespace-pre-wrap break-words">
      {children}
    </blockquote>
  ),

  // Enhanced headings with proper wrapping
  h1: ({ children }) => (
    <h1 className="text-xl font-bold mb-4 break-words text-current">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold mb-3 break-words text-current">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-bold mb-2 break-words text-current">{children}</h3>
  ),
};

const Message = ({ message, onInjectContext }) => {
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Remove memory citations from content
  const cleanContent = message.content.replace(/\[Memory \d+\]:\s*/g, '');

  return (
    <div className={`message ${message.role}`}>
      <div className="message-header">
        {message.isContext && <div className="context-label">Generated Context</div>}
        <div className="message-actions">
          <button 
            className="action-button"
            onClick={() => copyToClipboard(message.content)}
            title="Copy to clipboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          </button>
        </div>
      </div>
      <div className="message-content-wrapper">
        <div className="message-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={MarkdownComponents}
          >
            {cleanContent}
          </ReactMarkdown>
        </div>
      </div>
      {!message.isContext && message.sources && message.sources.length > 0 && (
        <div className="message-sources">
          <div className="sources-header">Sources:</div>
          <div className="sources-list">
            {message.sources.map((source, index) => (
              <div key={index} className="source-item">
                <span className="source-number">[{index + 1}]</span>
                <span className="source-text">{source.preview}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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

  /* Temporarily disabled ChatGPT context injection */
  // const handleInjectContext = async (context) => {
  //   try {
  //     // Get the current active tab
  //     const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
  //     // Check if we're on a ChatGPT domain
  //     const isChatGPT = tab.url.match(/https:\/\/(chat\.openai\.com|chatgpt\.com)/);
  //     if (!isChatGPT) {
  //       console.error('Not on ChatGPT website');
  //       return;
  //     }

  //     // Send message to content script
  //     const response = await chrome.tabs.sendMessage(tab.id, {
  //       action: 'injectContext',
  //       context
  //     });

  //     if (!response?.success) {
  //       console.error('Failed to inject context:', response?.error);
  //     }
  //   } catch (error) {
  //     console.error('Failed to inject context:', error);
  //   }
  // };

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

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h2>{projectName || 'Chat'}</h2>
        <button className="close-button" onClick={onClose}>×</button>
      </header>

      <div className="messages-container">
        {messages.map((message, index) => (
          <Message 
            key={index} 
            message={message} 
            // Temporarily disabled ChatGPT context injection
            // onInjectContext={handleInjectContext}
          />
        ))}
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
