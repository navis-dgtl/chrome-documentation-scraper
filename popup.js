// Improved popup.js with icon support and extraction control

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlCollectionRadios = document.querySelectorAll('input[name="url-collection"]');
  const manualUrlsContainer = document.getElementById('manual-urls-container');
  const manualUrlsTextarea = document.getElementById('manual-urls');
  const includePatternInput = document.getElementById('include-pattern');
  const excludePatternInput = document.getElementById('exclude-pattern');
  const scanPageButton = document.getElementById('scan-page');
  const extractContentButton = document.getElementById('extract-content');
  const downloadZipButton = document.getElementById('download-zip');
  const statusSection = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  const progressBar = document.getElementById('progress-bar');
  const outputFilenameInput = document.getElementById('output-filename');
  const createIndexCheckbox = document.getElementById('create-index');
  const includeHeadingsCheckbox = document.getElementById('include-headings');
  const includeImagesCheckbox = document.getElementById('include-images');
  const includeLinksCheckbox = document.getElementById('include-links');
  const includeCodeBlocksCheckbox = document.getElementById('include-code-blocks');
  
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
  
  // Initialize UI and collapsible sections
  initializeUI();
  setupCollapsibleSections();
  setupExtractionControlListeners();
  
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
  
  /**
   * Initialize UI state
   */
  function initializeUI() {
    // Get current state from background script
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      if (response) {
        collectedUrls = response.urls || [];
        processedPages = response.pages || [];
        
        // Update UI based on state
        if (collectedUrls.length > 0) {
          extractContentButton.disabled = false;
          updateStatus(`${collectedUrls.length} URLs collected and ready for extraction`);
        }
        
        if (processedPages.length > 0) {
          downloadZipButton.disabled = false;
          updateStatus(`${processedPages.length} pages processed and ready for download`);
        }
      }
    });
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
              
              if (response && response.links) {
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
    
    // Reset processed pages if starting fresh
    if (!extractionActive) {
      processedPages = [];
      chrome.runtime.sendMessage({ action: 'resetState' });
      
      // Get content options and store them for pause/resume functionality
      extractionOptions = {
        includeHeadings: includeHeadingsCheckbox.checked,
        includeImages: includeImagesCheckbox.checked,
        includeLinks: includeLinksCheckbox.checked,
        includeCodeBlocks: includeCodeBlocksCheckbox.checked
      };
      
      currentUrlIndex = 0;
      extractionActive = true;
      extractionPaused = false;
      
      // Show extraction controls
      extractionControls.classList.remove('hidden');
      pauseExtractionButton.classList.remove('hidden');
      resumeExtractionButton.classList.add('hidden');
    }
    
    updateStatus(`Starting extraction of ${collectedUrls.length} pages...`);
    showProgressBar(0);
    
    // Update status in background script
    chrome.runtime.sendMessage({
      action: 'updateStatus',
      status: 'processing'
    });
    
    // Process URLs sequentially
    processNextUrl(currentUrlIndex, extractionOptions);
  }
  
  /**
   * Handle pause extraction button click
   */
  function handlePauseExtraction() {
    if (extractionActive && !extractionPaused) {
      extractionPaused = true;
      updateStatus(`Extraction paused at ${currentUrlIndex}/${collectedUrls.length} URLs`);
      
      // Update UI
      pauseExtractionButton.classList.add('hidden');
      resumeExtractionButton.classList.remove('hidden');
    }
  }
  
  /**
   * Handle resume extraction button click
   */
  function handleResumeExtraction() {
    if (extractionActive && extractionPaused) {
      extractionPaused = false;
      updateStatus(`Resuming extraction from ${currentUrlIndex}/${collectedUrls.length} URLs`);
      
      // Update UI
      pauseExtractionButton.classList.remove('hidden');
      resumeExtractionButton.classList.add('hidden');
      
      // Continue processing from where we left off
      processNextUrl(currentUrlIndex, extractionOptions);
    }
  }
  
  /**
   * Handle stop extraction button click
   */
  function handleStopExtraction() {
    if (extractionActive) {
      extractionActive = false;
      extractionPaused = false;
      
      updateStatus(`Stopped extraction at ${currentUrlIndex}/${collectedUrls.length} URLs. ${processedPages.length} pages processed.`);
      
      // Hide extraction controls
      extractionControls.classList.add('hidden');
      
      // Enable download button if we have any processed pages
      if (processedPages.length > 0) {
        downloadZipButton.disabled = false;
      }
      
      // Update status in background script
      chrome.runtime.sendMessage({
        action: 'updateStatus',
        status: 'stopped'
      });
    }
  }
  
  // Sequential processing of URLs
  let isProcessing = false;

  /**
   * Process URLs strictly one at a time
   * @param {number} startIndex - Starting URL index (only used when first called)
   * @param {Object} options - Content extraction options
   */
  function processNextUrl(startIndex, options) {
    // If already processing, don't start another process
    if (isProcessing) {
      return;
    }

    // Handle extraction completion
    if (startIndex >= collectedUrls.length) {
      // All URLs processed
      updateStatus(`Completed processing ${processedPages.length} pages`);
      showProgressBar(100);
      
      // Enable download button
      downloadZipButton.disabled = false;
      
      // Hide extraction controls
      extractionControls.classList.add('hidden');
      extractionActive = false;
      
      // Update status in background script
      chrome.runtime.sendMessage({
        action: 'updateStatus',
        status: 'completed'
      });
      
      return;
    }
    
    // If extraction is paused, don't process
    if (extractionPaused) {
      return;
    }

    // Set processing flag to prevent concurrent processing
    isProcessing = true;
    
    // Update current index for pause/resume functionality
    currentUrlIndex = startIndex;
    
    const currentUrl = collectedUrls[startIndex].url;
    
    // Only update the progress when actually starting to process a URL
    // Calculate progress based on completed URLs, not the index we're about to process
    const progress = Math.round((startIndex / collectedUrls.length) * 100);
    
    updateStatus(`Processing ${startIndex + 1}/${collectedUrls.length}: ${getUrlDomain(currentUrl)}`);
    showProgressBar(progress);
    
    try {
      // Open URL in a new tab
      chrome.tabs.create({ url: currentUrl, active: false }, (tab) => {
        if (!tab || !tab.id) {
          console.error('Failed to create tab');
          finishProcessingUrl(startIndex, null, options);
          return;
        }
        
        const tabId = tab.id;
        let tabProcessed = false;
        let tabUpdateListenerRemoved = false;
        
        // Listen for tab updates to ensure the page is fully loaded
        const tabUpdateListener = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete' && !tabProcessed) {
            // Set flag to prevent multiple processing of the same tab
            tabProcessed = true;
            
            // Prevent multiple executions on the same tab
            if (tabUpdateListenerRemoved) return;
            
            tabUpdateListenerRemoved = true;
            chrome.tabs.onUpdated.removeListener(tabUpdateListener);
            
            // Process the tab content
            processTabContent(tabId, currentUrl, startIndex, options);
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
          
          console.log(`Tab load timeout for ${currentUrl}, trying to process anyway`);
          tabProcessed = true;
          
          // Try to process anyway or skip
          processTabContent(tabId, currentUrl, startIndex, options);
        }, 8000); // 8 second timeout
      });
    } catch (error) {
      console.error('Error creating tab:', error);
      finishProcessingUrl(startIndex, null, options);
    }
  }
  
  /**
   * Process the content of a tab
   * @param {number} tabId - Tab ID
   * @param {string} url - URL being processed
   * @param {number} index - Current URL index
   * @param {Object} options - Extraction options
   */
  function processTabContent(tabId, url, index, options) {
    try {
      // Inject content script
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
              ...options,
              baseUrl: url
            }
          },
          (response) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              console.error('Error communicating with content script:', lastError);
              finishProcessingUrl(index, tabId, options);
              return;
            }
            
            if (response && response.markdown) {
              // Add to processed pages
              processedPages.push({
                url: url,
                title: response.metadata.title,
                markdown: response.markdown,
                metadata: response.metadata
              });
              
              // Store in background script
              chrome.runtime.sendMessage({
                action: 'addPage',
                pageData: {
                  url: url,
                  title: response.metadata.title,
                  markdown: response.markdown,
                  metadata: response.metadata
                }
              });
            }
            
            finishProcessingUrl(index, tabId, options);
          }
        );
      }).catch(error => {
        console.error('Error injecting content script:', error);
        finishProcessingUrl(index, tabId, options);
      });
    } catch (error) {
      console.error('Error processing tab content:', error);
      finishProcessingUrl(index, tabId, options);
    }
  }
  
  /**
   * Finish processing the current URL and move to the next
   * @param {number} currentIndex - Current URL index
   * @param {number|null} tabId - Tab ID to close, or null if already closed
   * @param {Object} options - Extraction options
   */
  function finishProcessingUrl(currentIndex, tabId, options) {
    try {
      // Only try to close the tab if we have a valid ID
      if (tabId !== null) {
        try {
          chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
              // Tab doesn't exist, just continue
              console.log('Tab already closed:', chrome.runtime.lastError.message);
              continueToNextUrl(currentIndex, options);
            } else if (tab) {
              // Tab exists, try to close it
              chrome.tabs.remove(tabId, () => {
                if (chrome.runtime.lastError) {
                  console.log('Error closing tab:', chrome.runtime.lastError.message);
                }
                continueToNextUrl(currentIndex, options);
              });
            }
          });
        } catch (error) {
          console.error('Error checking tab:', error);
          continueToNextUrl(currentIndex, options);
        }
      } else {
        continueToNextUrl(currentIndex, options);
      }
    } catch (error) {
      console.error('Error in finishProcessingUrl:', error);
      isProcessing = false;
      
      // Make sure we continue to the next URL even if there's an error
      continueToNextUrl(currentIndex, options);
    }
  }
  
  /**
   * Continue to the next URL in the sequence
   * @param {number} currentIndex - Current URL index
   * @param {Object} options - Extraction options
   */
  function continueToNextUrl(currentIndex, options) {
    // Update progress after processing is complete
    const nextIndex = currentIndex + 1;
    const progress = Math.round((nextIndex / collectedUrls.length) * 100);
    
    // Make sure progress doesn't exceed 100%
    if (progress <= 100) {
      showProgressBar(progress);
    }
    
    // Update the status text to show we've completed processing this URL
    if (nextIndex < collectedUrls.length) {
      updateStatus(`Completed ${nextIndex}/${collectedUrls.length} pages`);
    }
    
    // Reset processing flag to allow next URL
    isProcessing = false;
    
    // If not paused and still active, process the next URL
    if (!extractionPaused && extractionActive) {
      // Use setTimeout to ensure we're not in the same call stack
      // This prevents multiple concurrent tab opening
      setTimeout(() => {
        processNextUrl(nextIndex, options);
      }, 500);
    }
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
  
  /**
   * Sanitize filename to remove invalid characters
   * @param {string} filename - Original filename
   * @returns {string} - Sanitized filename
   */
  function sanitizeFilename(filename) {
    return filename
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '-')
      .substring(0, 100); // Limit length
  }
});
