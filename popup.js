// Improved popup.js with icon support and extraction control

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlCollectionRadios = document.querySelectorAll('input[name="url-collection"]');
  const manualUrlsContainer = document.getElementById('manual-urls-container');
  const manualUrlsTextarea = document.getElementById('manual-urls');
  const collectedUrlsContainer = document.getElementById('collected-urls-container');
  const urlListElement = document.getElementById('url-list');
  const clearUrlsButton = document.getElementById('clear-urls');
  const includePatternInput = document.getElementById('include-pattern');
  const excludePatternInput = document.getElementById('exclude-pattern');
  const scanPageButton = document.getElementById('scan-page');
  const extractContentButton = document.getElementById('extract-content');
  const downloadZipButton = document.getElementById('download-zip');
  const statusSection = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  const progressBar = document.getElementById('progress-bar');
  const outputFilenameInput = document.getElementById('output-filename');
  const timeoutInput = document.getElementById('tab-load-timeout');
  const createIndexCheckbox = document.getElementById('create-index');
  const includeHeadingsCheckbox = document.getElementById('include-headings');
  const includeImagesCheckbox = document.getElementById('include-images');
  const includeLinksCheckbox = document.getElementById('include-links');
  const includeCodeBlocksCheckbox = document.getElementById('include-code-blocks');
  const removeSelectorsInput = document.getElementById('remove-selectors');
  const darkModeToggle = document.getElementById('enable-dark-mode');
  
  // Extraction control elements
  const extractionControls = document.getElementById('extraction-controls');
  const pauseExtractionButton = document.getElementById('pause-extraction');
  const resumeExtractionButton = document.getElementById('resume-extraction');
  const stopExtractionButton = document.getElementById('stop-extraction');
  
  // Section headers for collapsible sections
  const sectionHeaders = document.querySelectorAll('.section-header');
  
  // State
  let collectedUrls = [];
  let processedPages = [];
  let currentUrlIndex = 0;
  let extractionPaused = false;
  let extractionActive = false;
  let extractionOptions = {};
  let resumePromptShown = false;
  
  // Initialize UI and collapsible sections
  initializeUI();
  setupCollapsibleSections();
  setupExtractionControlListeners();
  initializeDarkMode();
  
  /**
   * Initialize collapsible sections
   */
  function setupCollapsibleSections() {
    sectionHeaders.forEach(header => {
      // Make sure sections start expanded by default
      const section = header.closest('.section');
      const content = section.querySelector('.section-content');
      const chevron = header.querySelector('.icon-chevron');
      
      // Ensure content is visible initially
      content.classList.remove('hidden');
      header.classList.remove('collapsed');
      chevron.style.transform = 'rotate(0deg)';
      
      // Add click listener for toggling
      header.addEventListener('click', () => {
        // Toggle collapse state
        if (content.classList.contains('hidden')) {
          // Expand
          content.classList.remove('hidden');
          header.classList.remove('collapsed');
          chevron.style.transform = 'rotate(0deg)';
        } else {
          // Collapse
          content.classList.add('hidden');
          header.classList.add('collapsed');
          chevron.style.transform = 'rotate(-90deg)';
        }
      });
    });
  }
  
  /**
   * Setup event listeners for extraction control buttons
   */
  function setupExtractionControlListeners() {
    pauseExtractionButton.addEventListener('click', handlePauseExtraction);
    resumeExtractionButton.addEventListener('click', handleResumeExtraction);
    stopExtractionButton.addEventListener('click', handleStopExtraction);
  }
  
  // Event Listeners
  urlCollectionRadios.forEach(radio => {
    radio.addEventListener('change', handleUrlCollectionMethodChange);
  });
  
  scanPageButton.addEventListener('click', handleScanPage);
  extractContentButton.addEventListener('click', handleExtractContent);
  downloadZipButton.addEventListener('click', handleDownloadZip);
  clearUrlsButton.addEventListener('click', handleClearUrls);
  timeoutInput.addEventListener('change', handleTimeoutChange);
  darkModeToggle.addEventListener('change', handleDarkModeToggle);
  
  /**
   * Initialize UI state
   */
  function initializeUI() {
    // Get current state from background script
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      if (response) {
        collectedUrls = response.urls || [];
        processedPages = response.pages || [];
        
        // Check extraction status
        if (response.extractionState) {
          extractionActive = response.extractionState.active;
          extractionPaused = response.extractionState.paused;
          currentUrlIndex = response.extractionState.currentIndex;

          // Update UI based on extraction state
          if (extractionActive) {
            extractionControls.classList.remove('hidden');

            if (extractionPaused) {
              pauseExtractionButton.classList.add('hidden');
              resumeExtractionButton.classList.remove('hidden');
            } else {
              pauseExtractionButton.classList.remove('hidden');
              resumeExtractionButton.classList.add('hidden');
            }

            // Show progress
            const progress = Math.round((currentUrlIndex / collectedUrls.length) * 100);
            showProgressBar(progress);

            if (extractionPaused) {
              updateStatus(`Paused at ${currentUrlIndex}/${collectedUrls.length} URLs`);
            }

            if (!resumePromptShown && extractionPaused && currentUrlIndex < collectedUrls.length) {
              resumePromptShown = true;
              if (confirm(`Resume previous extraction from URL ${currentUrlIndex + 1} of ${collectedUrls.length}?`)) {
                handleResumeExtraction();
              } else {
                chrome.runtime.sendMessage({ action: 'resetState' }, () => {
                  collectedUrls = [];
                  processedPages = [];
                  currentUrlIndex = 0;
                  extractionActive = false;
                  extractionPaused = false;
                  renderUrlList();
                  showProgressBar(0);
                });
              }
            }
          }
        }
        
        // Update UI based on state
        if (collectedUrls.length > 0) {
          extractContentButton.disabled = false;
          updateStatus(`${collectedUrls.length} URLs collected and ready for extraction`);
          
          // Render the collected URLs list
          renderUrlList();
        }
        
        if (processedPages.length > 0) {
          downloadZipButton.disabled = false;
          updateStatus(`${processedPages.length} pages processed and ready for download`);
        }
      }
    });
    
    // Listen for state updates from background script
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'stateUpdate') {
        const { collectedData, extractionState } = message.data;
        
        // Update local state
        collectedUrls = collectedData.urls || [];
        processedPages = collectedData.pages || [];
        
        // Update extraction state
        extractionActive = extractionState.active;
        extractionPaused = extractionState.paused;
        currentUrlIndex = extractionState.currentIndex;
        
        // Update UI
        if (collectedUrls.length > 0) {
          renderUrlList();
        }
        
        // Update controls
        if (extractionActive) {
          extractionControls.classList.remove('hidden');
          
          if (extractionPaused) {
            pauseExtractionButton.classList.add('hidden');
            resumeExtractionButton.classList.remove('hidden');
          } else {
            pauseExtractionButton.classList.remove('hidden');
            resumeExtractionButton.classList.add('hidden');
          }
          
          // Show progress
          const progress = Math.round((currentUrlIndex / extractionState.totalUrls) * 100);
          showProgressBar(progress);
          updateStatus(`Processing ${currentUrlIndex}/${extractionState.totalUrls} URLs (${progress}%)`);
        } else {
          // Hide controls if extraction is complete
          if (collectedData.status === 'completed' || collectedData.status === 'stopped') {
            extractionControls.classList.add('hidden');
            
            if (processedPages.length > 0) {
              downloadZipButton.disabled = false;
              updateStatus(`${processedPages.length} pages processed and ready for download`);
            }
          }
        }
      }
    });

    // Load current timeout value
    chrome.runtime.sendMessage({ action: 'getTimeout' }, (res) => {
      if (res && res.timeout) {
        timeoutInput.value = res.timeout;
      }
    });

    // Load saved selectors to remove
    chrome.storage.local.get('removeSelectors', (res) => {
      if (res.removeSelectors) {
        removeSelectorsInput.value = res.removeSelectors;
      }
    });
  }
  
  /**
   * Render the list of collected URLs
   */
  function renderUrlList() {
    if (collectedUrls.length > 0) {
      // Clear the current list
      urlListElement.innerHTML = '';
      
      // Show the container
      collectedUrlsContainer.classList.remove('hidden');
      
      // Add each URL to the list
      collectedUrls.forEach((urlItem, index) => {
        const urlElement = document.createElement('div');
        urlElement.className = 'url-item';
        
        const urlText = document.createElement('div');
        urlText.className = 'url-text';
        urlText.title = urlItem.url; // Show full URL on hover
        urlText.textContent = urlItem.text || getUrlDomain(urlItem.url);
        
        const removeButton = document.createElement('button');
        removeButton.className = 'url-remove';
        removeButton.innerHTML = '&times;'; // × symbol
        removeButton.title = 'Remove this URL';
        removeButton.dataset.index = index;
        removeButton.addEventListener('click', handleRemoveUrl);
        
        urlElement.appendChild(urlText);
        urlElement.appendChild(removeButton);
        urlListElement.appendChild(urlElement);
      });
    } else {
      // Hide the container if no URLs
      collectedUrlsContainer.classList.add('hidden');
    }

    // Enable/disable extract button based on list state
    extractContentButton.disabled = collectedUrls.length === 0;
  }
  
  /**
   * Handle removing a URL from the collection
   * @param {Event} event - Click event
   */
  function handleRemoveUrl(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10);
    
    if (!isNaN(index) && index >= 0 && index < collectedUrls.length) {
      // Remove the URL from the array
      const removedUrl = collectedUrls.splice(index, 1)[0];
      
      // Update the UI
      renderUrlList();
      
      // Update the status
      updateStatus(`Removed "${removedUrl.text || getUrlDomain(removedUrl.url)}" from scan list`);
      
      // Update the background script
      chrome.runtime.sendMessage({
        action: 'setUrls',
        urls: collectedUrls
      });
      
      // Update extract button state
      extractContentButton.disabled = collectedUrls.length === 0;
    }
  }

  /**
   * Handle clearing all collected URLs
   */
  function handleClearUrls() {
    collectedUrls = [];
    renderUrlList();

    chrome.runtime.sendMessage({
      action: 'setUrls',
      urls: []
    });

    updateStatus('URL list cleared');
  }
  
  /**
   * Handle URL collection method change
   */
  function handleUrlCollectionMethodChange() {
    const selectedValue = document.querySelector('input[name="url-collection"]:checked').value;
    
    if (selectedValue === 'selected') {
      manualUrlsContainer.classList.remove('hidden');
    } else {
      manualUrlsContainer.classList.add('hidden');
    }
  }
  
  /**
   * Handle scan page button click
   */
  function handleScanPage() {
    const selectedMethod = document.querySelector('input[name="url-collection"]:checked').value;
    
    if (selectedMethod === 'all') {
      // Get all links from current page
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        
        updateStatus('Scanning page for links...');
        showProgressBar(10);
        
        // Get filter options
        const options = {
          includePattern: includePatternInput.value.trim(),
          excludePattern: excludePatternInput.value.trim()
        };
        
      // Ensure content script is injected before sending message
      try {
        chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          files: ['js/content.js']
        }).then(() => {
          // Content script is now injected, send message
          updateStatus('Content script injected, collecting links...');
          
          // Send message to content script to collect links
          chrome.tabs.sendMessage(
            currentTab.id,
            { action: 'collectLinks', options },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError);
                updateStatus('Error: ' + chrome.runtime.lastError.message);
                return;
              }
              
              if (response && response.error) {
                updateStatus('Error: ' + response.error);
              } else if (response && response.links) {
                collectedUrls = response.links;
                
                // Store URLs in background script
                chrome.runtime.sendMessage({
                  action: 'setUrls',
                  urls: collectedUrls
                });
                
                showProgressBar(100);
                updateStatus(`Collected ${collectedUrls.length} links from the page`);
                
                // Enable extract button
                extractContentButton.disabled = false;
                
                // Render the URL list
                renderUrlList();
              } else {
                updateStatus('Error: Could not collect links from the page');
              }
            }
          );
        }).catch(error => {
          console.error('Error injecting content script:', error);
          updateStatus('Error injecting content script: ' + error.message);
        });
      } catch (error) {
        console.error('Error sending message:', error);
        updateStatus('Error: ' + error.message);
      }
      });
    } else {
      // Use manually entered URLs
      const manualUrls = manualUrlsTextarea.value.trim().split('\n')
        .filter(url => url.trim() !== '')
        .map(url => {
          return {
            url: url.trim(),
            text: url.trim()
          };
        });
      
      if (manualUrls.length > 0) {
        collectedUrls = manualUrls;
        
        // Store URLs in background script
        chrome.runtime.sendMessage({
          action: 'setUrls',
          urls: collectedUrls
        });
        
        updateStatus(`Added ${collectedUrls.length} URLs manually`);
        
        // Enable extract button
        extractContentButton.disabled = false;
        
        // Render the URL list
        renderUrlList();
      } else {
        updateStatus('Error: No URLs entered');
      }
    }
  }
  
  /**
   * Handle extract content button click
   */
  function handleExtractContent() {
    if (collectedUrls.length === 0) {
      updateStatus('No URLs to process');
      return;
    }

    // Get content options
    const options = {
      includeHeadings: includeHeadingsCheckbox.checked,
      includeImages: includeImagesCheckbox.checked,
      includeLinks: includeLinksCheckbox.checked,
      includeCodeBlocks: includeCodeBlocksCheckbox.checked,
      selectorsToRemove: removeSelectorsInput.value
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
    };

    // Persist selectors across sessions
    chrome.storage.local.set({ removeSelectors: removeSelectorsInput.value.trim() });
    
    // Show extraction controls
    extractionControls.classList.remove('hidden');
    pauseExtractionButton.classList.remove('hidden');
    resumeExtractionButton.classList.add('hidden');
    
    // Set UI state
    extractionActive = true;
    extractionPaused = false;
    
    updateStatus(`Starting extraction of ${collectedUrls.length} pages...`);
    showProgressBar(0);
    
    // Send message to background script to start extraction
    chrome.runtime.sendMessage({
      action: 'startExtraction',
      options: options
    }, (response) => {
      if (!response.success) {
        updateStatus(`Error: ${response.message || 'Unknown error'}`);
        extractionControls.classList.add('hidden');
        extractionActive = false;
      }
    });
  }
  
  /**
   * Handle pause extraction button click
   */
  function handlePauseExtraction() {
    chrome.runtime.sendMessage({
      action: 'pauseExtraction'
    }, (response) => {
      if (response.success) {
        extractionPaused = true;
        
        // Update UI
        pauseExtractionButton.classList.add('hidden');
        resumeExtractionButton.classList.remove('hidden');
        
        updateStatus('Extraction paused');
      } else {
        updateStatus(`Error: ${response.message || 'Could not pause extraction'}`);
      }
    });
  }
  
  /**
   * Handle resume extraction button click
   */
  function handleResumeExtraction() {
    chrome.runtime.sendMessage({
      action: 'resumeExtraction'
    }, (response) => {
      if (response.success) {
        extractionPaused = false;
        
        // Update UI
        pauseExtractionButton.classList.remove('hidden');
        resumeExtractionButton.classList.add('hidden');
        
        updateStatus('Resuming extraction...');
      } else {
        updateStatus(`Error: ${response.message || 'Could not resume extraction'}`);
      }
    });
  }
  
  /**
   * Handle stop extraction button click
   */
  function handleStopExtraction() {
    chrome.runtime.sendMessage({
      action: 'stopExtraction'
    }, (response) => {
      if (response.success) {
        extractionActive = false;
        extractionPaused = false;
        
        // Hide extraction controls
        extractionControls.classList.add('hidden');
        
        updateStatus('Extraction stopped');
        
        // Enable download button if we have any processed pages
        if (processedPages.length > 0) {
          downloadZipButton.disabled = false;
        }
      } else {
        updateStatus(`Error: ${response.message || 'Could not stop extraction'}`);
      }
    });
  }
  
  /**
   * Handle download zip button click
   */
  function handleDownloadZip() {
    if (processedPages.length === 0) {
      updateStatus('No pages to download');
      return;
    }
    
    updateStatus('Creating ZIP file...');
    showProgressBar(50);
    
    // Get output filename
    const outputFilename = outputFilenameInput.value.trim() || 'extracted-content';
    
    // Get output options
    const options = {
      createIndex: createIndexCheckbox.checked,
      addFrontmatter: document.getElementById('add-frontmatter').checked,
      addTableOfContents: document.getElementById('add-table-of-contents').checked,
      formatCodeBlocks: true,
      fixRelativeLinks: true,
      enhanceMarkdown: true
    };
    
    // Create ZIP file using the integration module
    createMarkdownZip(processedPages, options)
      .then((blob) => {
        // Download the ZIP file
        downloadBlob(blob, `${outputFilename}.zip`);
        
        showProgressBar(100);
        updateStatus(`Downloaded ${processedPages.length} pages as ${outputFilename}.zip`);
      })
      .catch((error) => {
        console.error('Error creating ZIP file', error);
        updateStatus('Error creating ZIP file');
      });
  }

  /**
   * Handle timeout input change
   */
  function handleTimeoutChange() {
    const value = parseInt(timeoutInput.value, 10);
    if (!isNaN(value) && value > 0) {
      chrome.runtime.sendMessage({ action: 'setTimeout', timeout: value });
    } else {
      updateStatus('Invalid timeout value');
    }
  }

  /**
   * Initialize dark mode based on stored preference
   */
  function initializeDarkMode() {
    chrome.storage.local.get('darkModeEnabled', (data) => {
      let enabled = data.darkModeEnabled;
      if (enabled === undefined) {
        enabled = window.matchMedia('(prefers-color-scheme: dark)').matches;
        chrome.storage.local.set({ darkModeEnabled: enabled });
      }
      darkModeToggle.checked = !!enabled;
      if (enabled) {
        document.body.classList.add('dark-mode');
      }
    });
  }

  /**
   * Handle dark mode toggle changes
   */
  function handleDarkModeToggle() {
    const enabled = darkModeToggle.checked;
    if (enabled) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    chrome.storage.local.set({ darkModeEnabled: enabled });
  }
  
  /**
   * Update status text and show status section
   * @param {string} message - Status message
   */
  function updateStatus(message) {
    statusSection.classList.remove('hidden');
    statusText.textContent = message;
  }
  
  /**
   * Show progress bar with specified percentage
   * @param {number} percent - Progress percentage (0-100)
   */
  function showProgressBar(percent) {
    progressBar.style.width = `${percent}%`;
  }
  
  /**
   * Extract domain name from URL for display purposes
   * @param {string} url - URL to extract domain from
   * @returns {string} - Domain name
   */
  function getUrlDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return url;
    }
  }
  
});
