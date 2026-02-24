// background.js - Service worker for managing extraction state and tab orchestration

const DEBUG = false;
function debugLog(...args) {
  if (DEBUG) console.log('[Navis BG]', ...args);
}

// ─── State ─────────────────────────────────────────────────────────

let collectedData = {
  urls: [],
  pages: [],
  status: 'idle', // idle | ready | processing | paused | completed | stopped | error
};

let extractionState = {
  active: false,
  paused: false,
  currentIndex: 0,
  options: {},
  currentTabId: null,
  isProcessing: false,
  retryCount: 0,
  errors: [],
};

const DEFAULT_TIMEOUT = 15000; // 15s default for SPA sites
let tabLoadTimeout = DEFAULT_TIMEOUT;
const MAX_RETRIES = 2;
const DELAY_BETWEEN_PAGES = 800; // ms between page loads to be polite

// ─── Initialization ────────────────────────────────────────────────

function initializeFromStorage() {
  chrome.storage.local.get(['collectedData', 'extractionState', 'tabLoadTimeout'], (result) => {
    if (result.collectedData) {
      collectedData = result.collectedData;
      if (collectedData.status === 'processing') {
        collectedData.status = 'paused';
      }
    }
    if (result.extractionState) {
      extractionState = {
        ...extractionState,
        ...result.extractionState,
        currentTabId: null,
        isProcessing: false,
        retryCount: 0,
      };
      if (extractionState.active && !extractionState.paused) {
        extractionState.paused = true;
        collectedData.status = 'paused';
      }
    }
    if (typeof result.tabLoadTimeout === 'number') {
      tabLoadTimeout = result.tabLoadTimeout;
    }
    updateBadge();
  });
}

// Load config.json for default timeout
fetch(chrome.runtime.getURL('config.json'))
  .then(r => r.json())
  .then(cfg => {
    if (typeof cfg.tabLoadTimeout === 'number') {
      tabLoadTimeout = cfg.tabLoadTimeout;
    }
  })
  .catch(() => {});

initializeFromStorage();

chrome.runtime.onStartup.addListener(initializeFromStorage);

// ─── Badge ─────────────────────────────────────────────────────────

function updateBadge() {
  let color = '#757575';
  let text = '';

  switch (collectedData.status) {
    case 'processing':
      color = '#4285F4';
      text = collectedData.urls.length
        ? `${Math.round((extractionState.currentIndex / collectedData.urls.length) * 100)}%`
        : '...';
      break;
    case 'paused':
      color = '#FBBC05';
      text = 'PAUSE';
      break;
    case 'completed':
      color = '#34A853';
      text = 'DONE';
      break;
    case 'ready':
      color = '#4285F4';
      text = `${collectedData.urls.length}`;
      break;
    case 'error':
      color = '#EA4335';
      text = 'ERR';
      break;
    case 'stopped':
      color = '#FF6D01';
      text = 'STOP';
      break;
  }

  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
}

// ─── Extraction Orchestration ──────────────────────────────────────

function processNextUrl() {
  if (extractionState.isProcessing) return;
  if (extractionState.paused) return;

  // All done?
  if (extractionState.currentIndex >= collectedData.urls.length) {
    collectedData.status = 'completed';
    extractionState.active = false;
    extractionState.isProcessing = false;
    updateBadge();
    persistState();

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: 'Extraction Complete',
      message: `Processed ${collectedData.pages.length} of ${collectedData.urls.length} pages. ${extractionState.errors.length} errors.`,
    });

    broadcastState();
    return;
  }

  extractionState.isProcessing = true;
  const urlObj = collectedData.urls[extractionState.currentIndex];
  const currentUrl = urlObj.url;

  collectedData.status = 'processing';
  updateBadge();
  broadcastState();

  debugLog(`Processing [${extractionState.currentIndex + 1}/${collectedData.urls.length}]: ${currentUrl}`);

  // Create a tab for the URL
  chrome.tabs.create({ url: currentUrl, active: false }, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.id) {
      console.error('Failed to create tab:', chrome.runtime.lastError?.message);
      handleExtractionError(currentUrl, 'Failed to create tab');
      return;
    }

    extractionState.currentTabId = tab.id;
    let processed = false;
    let listenerRemoved = false;

    const onTabUpdated = (tabId, changeInfo) => {
      if (tabId !== tab.id || changeInfo.status !== 'complete' || processed) return;
      processed = true;

      if (!listenerRemoved) {
        listenerRemoved = true;
        chrome.tabs.onUpdated.removeListener(onTabUpdated);
      }

      // Give SPA frameworks extra time to hydrate
      setTimeout(() => {
        extractFromTab(tab.id, currentUrl);
      }, 1500);
    };

    chrome.tabs.onUpdated.addListener(onTabUpdated);

    // Fallback timeout
    setTimeout(() => {
      if (processed) return;
      processed = true;
      if (!listenerRemoved) {
        listenerRemoved = true;
        chrome.tabs.onUpdated.removeListener(onTabUpdated);
      }
      debugLog(`Timeout for ${currentUrl}, attempting extraction anyway`);
      extractFromTab(tab.id, currentUrl);
    }, tabLoadTimeout);
  });
}

function extractFromTab(tabId, url) {
  // First inject the content script
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['js/content.js'],
  }).then(() => {
    // Send extraction message
    chrome.tabs.sendMessage(
      tabId,
      {
        action: 'extractContent',
        options: {
          ...extractionState.options,
          baseUrl: url,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Content script error:', chrome.runtime.lastError.message);
          handleExtractionError(url, chrome.runtime.lastError.message, tabId);
          return;
        }

        if (response && response.error) {
          handleExtractionError(url, response.error, tabId);
          return;
        }

        if (response && response.markdown) {
          collectedData.pages.push({
            url,
            title: response.metadata?.title || url,
            markdown: response.markdown,
            metadata: response.metadata || {},
          });
          debugLog(`Extracted: ${response.metadata?.title || url}`);
        }

        finishCurrentUrl(tabId);
      }
    );
  }).catch((error) => {
    console.error('Script injection error:', error);
    handleExtractionError(url, error.message, tabId);
  });
}

function handleExtractionError(url, errorMsg, tabId = null) {
  if (extractionState.retryCount < MAX_RETRIES) {
    extractionState.retryCount++;
    debugLog(`Retrying ${url} (attempt ${extractionState.retryCount})`);
    // Close the failed tab before retrying
    if (tabId) closeTab(tabId);
    extractionState.isProcessing = false;
    setTimeout(() => processNextUrl(), 2000 * extractionState.retryCount);
    return;
  }

  // Max retries reached, log error and move on
  extractionState.errors.push({ url, error: errorMsg });
  debugLog(`Failed after retries: ${url} - ${errorMsg}`);
  finishCurrentUrl(tabId);
}

function finishCurrentUrl(tabId) {
  extractionState.retryCount = 0;

  if (tabId) {
    closeTab(tabId);
  }

  extractionState.currentIndex++;
  extractionState.isProcessing = false;
  extractionState.currentTabId = null;

  broadcastState();
  updateBadge();
  persistState();

  if (!extractionState.paused && extractionState.active) {
    setTimeout(processNextUrl, DELAY_BETWEEN_PAGES);
  }
}

function closeTab(tabId) {
  try {
    chrome.tabs.remove(tabId, () => {
      if (chrome.runtime.lastError) {
        debugLog('Tab already closed:', chrome.runtime.lastError.message);
      }
    });
  } catch (e) {
    debugLog('Error closing tab:', e.message);
  }
}

// ─── Control Functions ─────────────────────────────────────────────

function startExtraction(options) {
  if (collectedData.urls.length === 0) {
    return { success: false, message: 'No URLs to process' };
  }
  if (extractionState.active) {
    return { success: false, message: 'Extraction already active' };
  }

  collectedData.pages = [];
  extractionState = {
    active: true,
    paused: false,
    currentIndex: 0,
    options: {
      ...(options || {}),
      selectorsToRemove: Array.isArray(options?.selectorsToRemove)
        ? options.selectorsToRemove
        : [],
    },
    currentTabId: null,
    isProcessing: false,
    retryCount: 0,
    errors: [],
  };

  collectedData.status = 'processing';
  updateBadge();
  persistState();
  processNextUrl();
  return { success: true };
}

function pauseExtraction() {
  if (!extractionState.active || extractionState.paused) {
    return { success: false, message: 'Cannot pause' };
  }
  extractionState.paused = true;
  collectedData.status = 'paused';
  updateBadge();
  broadcastState();
  persistState();
  return { success: true };
}

function resumeExtraction() {
  if (!extractionState.active || !extractionState.paused) {
    return { success: false, message: 'Cannot resume' };
  }
  extractionState.paused = false;
  collectedData.status = 'processing';
  updateBadge();
  broadcastState();
  processNextUrl();
  return { success: true };
}

function stopExtraction() {
  if (!extractionState.active) {
    return { success: false, message: 'Not active' };
  }

  extractionState.active = false;
  extractionState.paused = false;

  if (extractionState.currentTabId) {
    closeTab(extractionState.currentTabId);
    extractionState.currentTabId = null;
  }

  collectedData.status = extractionState.currentIndex > 0 ? 'stopped' : 'ready';
  extractionState.isProcessing = false;
  updateBadge();
  broadcastState();
  persistState();
  return { success: true };
}

// ─── State Broadcasting & Persistence ──────────────────────────────

function broadcastState() {
  try {
    chrome.runtime.sendMessage({
      action: 'stateUpdate',
      data: {
        collectedData: {
          urls: collectedData.urls,
          pages: collectedData.pages,
          status: collectedData.status,
        },
        extractionState: {
          active: extractionState.active,
          paused: extractionState.paused,
          currentIndex: extractionState.currentIndex,
          totalUrls: collectedData.urls.length,
          errors: extractionState.errors,
        },
      },
    }).catch(() => {
      // No listener (popup closed), ignore
    });
  } catch (e) {
    // Ignore - popup may not be open
  }
}

function persistState() {
  chrome.storage.local.set({
    collectedData: {
      urls: collectedData.urls,
      pages: collectedData.pages,
      status: collectedData.status,
    },
    extractionState: {
      active: extractionState.active,
      paused: extractionState.paused,
      currentIndex: extractionState.currentIndex,
      options: extractionState.options,
      errors: extractionState.errors,
    },
  });
}

// Also persist periodically as a safety net
setInterval(() => {
  if (collectedData.urls.length > 0 || collectedData.pages.length > 0 || extractionState.active) {
    persistState();
  }
}, 15000);

// ─── Message Handler ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getState':
      sendResponse({
        ...collectedData,
        extractionState: {
          active: extractionState.active,
          paused: extractionState.paused,
          currentIndex: extractionState.currentIndex,
          totalUrls: collectedData.urls.length,
          errors: extractionState.errors || [],
        },
      });
      break;

    case 'resetState':
      collectedData = { urls: [], pages: [], status: 'idle' };
      extractionState = {
        active: false,
        paused: false,
        currentIndex: 0,
        options: {},
        currentTabId: null,
        isProcessing: false,
        retryCount: 0,
        errors: [],
      };
      chrome.storage.local.remove(['collectedData', 'extractionState']);
      updateBadge();
      sendResponse({ success: true });
      break;

    case 'setUrls':
      collectedData.urls = request.urls || [];
      collectedData.status = collectedData.urls.length > 0 ? 'ready' : 'idle';
      updateBadge();
      persistState();
      sendResponse({ success: true });
      break;

    case 'addPage':
      collectedData.pages.push(request.pageData);
      sendResponse({ success: true });
      break;

    case 'getPage': {
      const idx = parseInt(request.index, 10);
      if (!isNaN(idx) && idx >= 0 && idx < collectedData.pages.length) {
        sendResponse({ page: collectedData.pages[idx] });
      } else {
        sendResponse({});
      }
      break;
    }

    case 'clearPages':
      collectedData.pages = [];
      sendResponse({ success: true });
      break;

    case 'startExtraction':
      sendResponse(startExtraction(request.options));
      break;

    case 'pauseExtraction':
      sendResponse(pauseExtraction());
      break;

    case 'resumeExtraction':
      sendResponse(resumeExtraction());
      break;

    case 'stopExtraction':
      sendResponse(stopExtraction());
      break;

    case 'getTimeout':
      sendResponse({ timeout: tabLoadTimeout });
      break;

    case 'setTimeout': {
      const val = request.timeout;
      if (typeof val === 'number' && val > 0) {
        tabLoadTimeout = val;
        chrome.storage.local.set({ tabLoadTimeout: val });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, message: 'Invalid timeout' });
      }
      break;
    }

    default:
      sendResponse({ error: 'Unknown action' });
  }

  return true; // async
});

updateBadge();
