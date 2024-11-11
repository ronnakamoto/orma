import React from 'react';
import { createRoot } from 'react-dom/client';
import EnhanceButton from './components/EnhanceButton';
import Notification from './components/Notification';

// Mark content script as loaded
window.ormaContentScriptLoaded = true;

// Create a container for notifications
const notificationContainer = document.createElement('div');
document.body.appendChild(notificationContainer);
const notificationRoot = createRoot(notificationContainer);

// Listen for notification messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_NOTIFICATION') {
    notificationRoot.render(
      <Notification message={message.message} />
    );
  }
});

// Only inject on ChatGPT or Claude
if (window.location.hostname.includes('chat.openai.com') || 
window.location.hostname.includes('chatgpt.com') ||
    window.location.hostname.includes('claude.ai')) {
  
  const textArea = document.querySelector('textarea');
  if (textArea) {
    const container = document.createElement('div');
    textArea.parentNode.insertBefore(container, textArea);
    
    createRoot(container).render(
      <EnhanceButton textArea={textArea} />
    );
  }
}