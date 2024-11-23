// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'injectContext') {
    const textarea = document.querySelector('#prompt-textarea');
    if (textarea) {
      textarea.value = request.context;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      
      // Find and click the submit button
      const submitButton = textarea.parentElement.querySelector('button[data-testid="send-button"]');
      if (submitButton && !submitButton.disabled) {
        submitButton.click();
      }
      
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Textarea not found' });
    }
  }
  return true; // Required for async response
});
