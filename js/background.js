// background.js - Background script for the extension

// Store collected data
let collectedData = {
  urls: [],
  pages: [],
  status: 'idle'
};

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getState') {
    // Return current state to popup
    sendResponse(collectedData);
  } else if (request.action === 'resetState') {
    // Reset collected data
    collectedData = {
      urls: [],
      pages: [],
      status: 'idle'
    };
    sendResponse({ success: true });
  } else if (request.action === 'setUrls') {
    // Set URLs to process
    collectedData.urls = request.urls;
    collectedData.status = 'ready';
    sendResponse({ success: true });
  } else if (request.action === 'addPage') {
    // Add processed page data
    collectedData.pages.push(request.pageData);
    sendResponse({ success: true });
  } else if (request.action === 'updateStatus') {
    // Update processing status
    collectedData.status = request.status;
    sendResponse({ success: true });
  }
  
  // Return true to indicate async response
  return true;
});
