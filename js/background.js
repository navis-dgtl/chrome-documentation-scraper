// background.js - Background script for the extension

// Debug flag for verbose logging. Set to true during development.
const DEBUG = false;

function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

// Store collected data
let collectedData = {
  urls: [],
  pages: [],
  status: 'idle'
};

// Extraction state
let extractionState = {
  active: false,
  paused: false,
  currentIndex: 0,
  options: {},
  currentTab: null,
  isProcessing: false
};

// Load stored state from chrome.storage
function initializeFromStorage() {
  chrome.storage.local.get(['collectedData', 'extractionState'], (result) => {
    if (result.collectedData) {
      collectedData = result.collectedData;
      // If extension was processing, mark as paused
      if (collectedData.status === 'processing') {
        collectedData.status = 'paused';
      }
    }

    if (result.extractionState) {
      extractionState = {
        ...extractionState,
        ...result.extractionState,
        currentTab: null,
        isProcessing: false,
      };

      // Ensure extraction is paused on restart if it was active
      if (extractionState.active && !extractionState.paused) {
        extractionState.paused = true;
        collectedData.status = 'paused';
      }
    }

    updateBadge();
  });
}

// Initialize from storage when the background script loads
initializeFromStorage();

// Default timeout for page loading (in milliseconds)
const DEFAULT_TIMEOUT = 8000;
// Current timeout value, loaded from config or storage
let tabLoadTimeout = DEFAULT_TIMEOUT;

// Load timeout from config.json and storage
fetch(chrome.runtime.getURL('config.json'))
  .then((res) => res.json())
  .then((cfg) => {
    if (typeof cfg.tabLoadTimeout === 'number') {
      tabLoadTimeout = cfg.tabLoadTimeout;
    }
    chrome.storage.local.get('tabLoadTimeout', (result) => {
      if (typeof result.tabLoadTimeout === 'number') {
        tabLoadTimeout = result.tabLoadTimeout;
      }
    });
  })
  .catch(() => {
    chrome.storage.local.get('tabLoadTimeout', (result) => {
      if (typeof result.tabLoadTimeout === 'number') {
        tabLoadTimeout = result.tabLoadTimeout;
      }
    });
  });

// Set badge color based on status
function updateBadge() {
  let color, text;
  
  switch (collectedData.status) {
    case 'processing':
      color = '#4285F4'; // Blue
      text = `${Math.round((extractionState.currentIndex / collectedData.urls.length) * 100)}%`;
      break;
    case 'paused':
      color = '#FBBC05'; // Yellow
      text = 'PAUSE';
      break;
    case 'completed':
      color = '#34A853'; // Green
      text = 'DONE';
      break;
    case 'ready':
      color = '#4285F4'; // Blue
      text = 'READY';
      break;
    case 'error':
      color = '#EA4335'; // Red
      text = 'ERR';
      break;
    default:
      color = '#757575'; // Gray
      text = '';
  }
  
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
}

// Process URLs strictly one at a time
function processNextUrl() {
  // If already processing, don't start another process
  if (extractionState.isProcessing) {
    return;
  }

  // Handle extraction completion
  if (extractionState.currentIndex >= collectedData.urls.length) {
    // All URLs processed
    collectedData.status = 'completed';
    extractionState.active = false;
    updateBadge();
    
    // Send notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: 'Extraction Completed',
      message: `Successfully processed ${collectedData.pages.length} pages`
    });
    
    // Broadcast state update
    broadcastState();
    return;
  }
  
  // If extraction is paused, don't process
  if (extractionState.paused) {
    return;
  }

  // Set processing flag to prevent concurrent processing
  extractionState.isProcessing = true;
  
  const currentUrl = collectedData.urls[extractionState.currentIndex].url;
  
  // Set status to processing if not already
  if (collectedData.status !== 'processing') {
    collectedData.status = 'processing';
    broadcastState();
  }
  
  updateBadge();
  
  try {
    // Open URL in a new tab
    chrome.tabs.create({ url: currentUrl, active: false }, (tab) => {
      if (!tab || !tab.id) {
        console.error('Failed to create tab');
        finishProcessingUrl(null);
        return;
      }
      
      extractionState.currentTab = tab.id;
      let tabProcessed = false;
      let tabUpdateListenerRemoved = false;
      
      // Listen for tab updates to ensure the page is fully loaded
      const tabUpdateListener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tab.id && changeInfo.status === 'complete' && !tabProcessed) {
          // Set flag to prevent multiple processing of the same tab
          tabProcessed = true;
          
          // Prevent multiple executions on the same tab
          if (tabUpdateListenerRemoved) return;
          
          tabUpdateListenerRemoved = true;
          chrome.tabs.onUpdated.removeListener(tabUpdateListener);
          
          // Process the tab content
          processTabContent(tab.id, currentUrl);
        }
      };
      
      // Add the listener for tab updates
      chrome.tabs.onUpdated.addListener(tabUpdateListener);
      
      // Failsafe timeout in case the tab never fully loads
      setTimeout(() => {
        if (tabProcessed) return;
        
        // If not already removed
        if (!tabUpdateListenerRemoved) {
          tabUpdateListenerRemoved = true;
          chrome.tabs.onUpdated.removeListener(tabUpdateListener);
        }
        
        debugLog(`Tab load timeout for ${currentUrl}, trying to process anyway`);
        tabProcessed = true;
        
        // Try to process anyway or skip
        processTabContent(tab.id, currentUrl);
      }, tabLoadTimeout); // Timeout configurable
    });
  } catch (error) {
    console.error('Error creating tab:', error);
    finishProcessingUrl(null);
  }
}

// Process the content of a tab
function processTabContent(tabId, url) {
  try {
    // Inject content script if needed
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['js/content.js']
    }).then(() => {
      // Extract content
      chrome.tabs.sendMessage(
        tabId,
        { 
          action: 'extractContent', 
          options: {
            ...extractionState.options,
            baseUrl: url
          }
        },
        (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error('Error communicating with content script:', lastError);
            finishProcessingUrl(tabId);
            return;
          }
          
          if (response && response.markdown) {
            // Add to processed pages
            collectedData.pages.push({
              url: url,
              title: response.metadata.title,
              markdown: response.markdown,
              metadata: response.metadata
            });
          }
          
          finishProcessingUrl(tabId);
        }
      );
    }).catch(error => {
      console.error('Error injecting content script:', error);
      finishProcessingUrl(tabId);
    });
  } catch (error) {
    console.error('Error processing tab content:', error);
    finishProcessingUrl(tabId);
  }
}

// Finish processing the current URL and move to the next
function finishProcessingUrl(tabId) {
  try {
    // Only try to close the tab if we have a valid ID
    if (tabId !== null) {
      try {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            // Tab doesn't exist, just continue
            debugLog('Tab already closed:', chrome.runtime.lastError.message);
            continueToNextUrl();
          } else if (tab) {
            // Tab exists, try to close it
            chrome.tabs.remove(tabId, () => {
              if (chrome.runtime.lastError) {
                debugLog('Error closing tab:', chrome.runtime.lastError.message);
              }
              continueToNextUrl();
            });
          }
        });
      } catch (error) {
        console.error('Error checking tab:', error);
        continueToNextUrl();
      }
    } else {
      continueToNextUrl();
    }
  } catch (error) {
    console.error('Error in finishProcessingUrl:', error);
    extractionState.isProcessing = false;
    
    // Make sure we continue to the next URL even if there's an error
    continueToNextUrl();
  }
}

// Continue to the next URL in the sequence
function continueToNextUrl() {
  // Increment index for next URL
  extractionState.currentIndex++;
  
  // Reset processing flag to allow next URL
  extractionState.isProcessing = false;
  extractionState.currentTab = null;
  
  // Broadcast state update to any open popups
  broadcastState();
  
  // Update badge
  updateBadge();
  
  // If not paused and still active, process the next URL
  if (!extractionState.paused && extractionState.active) {
    // Use setTimeout to ensure we're not in the same call stack
    // This prevents multiple concurrent tab opening
    setTimeout(() => {
      processNextUrl();
    }, 500);
  }
}

// Broadcast current state to any open popups
function broadcastState() {
  chrome.runtime.sendMessage({
    action: 'stateUpdate',
    data: {
      collectedData,
      extractionState: {
        active: extractionState.active,
        paused: extractionState.paused,
        currentIndex: extractionState.currentIndex,
        totalUrls: collectedData.urls.length
      }
    }
  });
}

// Update timeout value and persist to storage
function updateTimeout(value) {
  if (typeof value === 'number' && value > 0) {
    tabLoadTimeout = value;
    chrome.storage.local.set({ tabLoadTimeout: value });
    return { success: true };
  }
  return { success: false, message: 'Invalid timeout value' };
}

// Control functions
function startExtraction(options) {
  if (collectedData.urls.length === 0) {
    return { success: false, message: 'No URLs to process' };
  }
  
  if (!extractionState.active) {
    // Reset pages if starting fresh
    collectedData.pages = [];
    
    // Store options for extraction
    extractionState.options = {
      ...(options || {}),
      selectorsToRemove: Array.isArray(options?.selectorsToRemove)
        ? options.selectorsToRemove
        : []
    };
    
    // Set extraction state
    extractionState.active = true;
    extractionState.paused = false;
    extractionState.currentIndex = 0;
    extractionState.isProcessing = false;
    
    // Update status
    collectedData.status = 'processing';
    updateBadge();
    
    // Start processing
    processNextUrl();
    
    return { success: true };
  }
  
  return { success: false, message: 'Extraction already active' };
}

function pauseExtraction() {
  if (extractionState.active && !extractionState.paused) {
    extractionState.paused = true;
    collectedData.status = 'paused';
    updateBadge();
    broadcastState();
    return { success: true };
  }
  
  return { success: false, message: 'Cannot pause: extraction not active or already paused' };
}

function resumeExtraction() {
  if (extractionState.active && extractionState.paused) {
    extractionState.paused = false;
    collectedData.status = 'processing';
    updateBadge();
    broadcastState();
    
    // Continue processing
    processNextUrl();
    
    return { success: true };
  }
  
  return { success: false, message: 'Cannot resume: extraction not active or not paused' };
}

function stopExtraction() {
  if (extractionState.active) {
    extractionState.active = false;
    extractionState.paused = false;
    
    // If there's a current tab, try to close it
    if (extractionState.currentTab) {
      try {
        chrome.tabs.remove(extractionState.currentTab, () => {
          if (chrome.runtime.lastError) {
            debugLog('Error closing tab:', chrome.runtime.lastError.message);
          }
        });
      } catch (error) {
        console.error('Error closing tab:', error);
      }
    }
    
    // Update status
    if (extractionState.currentIndex > 0) {
      collectedData.status = 'stopped';
    } else {
      collectedData.status = 'ready';
    }
    
    updateBadge();
    broadcastState();
    
    return { success: true };
  }
  
  return { success: false, message: 'Cannot stop: extraction not active' };
}

// Initialize badge
updateBadge();

// Handle Chrome startup - re-initialize state
chrome.runtime.onStartup.addListener(() => {
  initializeFromStorage();
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getState') {
    // Return current state to popup
    sendResponse({
      ...collectedData,
      extractionState: {
        active: extractionState.active,
        paused: extractionState.paused,
        currentIndex: extractionState.currentIndex,
        totalUrls: collectedData.urls.length
      }
    });
  } else if (request.action === 'resetState') {
    // Reset collected data
    collectedData = {
      urls: [],
      pages: [],
      status: 'idle'
    };
    
    // Reset extraction state
    extractionState = {
      active: false,
      paused: false,
      currentIndex: 0,
      options: {},
      currentTab: null,
      isProcessing: false
    };

    // Clear stored data
    chrome.storage.local.remove(['collectedData', 'extractionState']);

    updateBadge();
    sendResponse({ success: true });
  } else if (request.action === 'setUrls') {
    // Set URLs to process
    collectedData.urls = request.urls;
    collectedData.status = 'ready';
    updateBadge();
    sendResponse({ success: true });
  } else if (request.action === 'addPage') {
    // Add processed page data
    collectedData.pages.push(request.pageData);
    sendResponse({ success: true });
  } else if (request.action === 'updateStatus') {
    // Update processing status
    collectedData.status = request.status;
    updateBadge();
    sendResponse({ success: true });
  } else if (request.action === 'startExtraction') {
    // Start background extraction process
    const result = startExtraction(request.options);
    sendResponse(result);
  } else if (request.action === 'pauseExtraction') {
    // Pause background extraction process
    const result = pauseExtraction();
    sendResponse(result);
  } else if (request.action === 'resumeExtraction') {
    // Resume background extraction process
    const result = resumeExtraction();
    sendResponse(result);
  } else if (request.action === 'stopExtraction') {
    // Stop background extraction process
    const result = stopExtraction();
    sendResponse(result);
  } else if (request.action === 'getTimeout') {
    // Return current timeout value
    sendResponse({ timeout: tabLoadTimeout });
  } else if (request.action === 'setTimeout') {
    // Update timeout value
    const result = updateTimeout(request.timeout);
    sendResponse(result);
  }
  
  // Return true to indicate async response
  return true;
});

// Persist data to storage periodically
setInterval(() => {
  if (
    collectedData.urls.length > 0 ||
    collectedData.pages.length > 0 ||
    extractionState.active
  ) {
    chrome.storage.local.set({ collectedData, extractionState });
  }
}, 10000); // Every 10 seconds
