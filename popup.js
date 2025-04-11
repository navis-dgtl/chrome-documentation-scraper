// Improved popup.js with icon support

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
  
  // Section headers for collapsible sections
  const sectionHeaders = document.querySelectorAll('.section-header');
  
  // State
  let collectedUrls = [];
  let processedPages = [];
  
  // Initialize UI and collapsible sections
  initializeUI();
  setupCollapsibleSections();
  
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
        
        // Send message to content script to collect links
        chrome.tabs.sendMessage(
          currentTab.id,
          { action: 'collectLinks', options },
          (response) => {
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
    
    // Reset processed pages
    processedPages = [];
    chrome.runtime.sendMessage({ action: 'resetState' });
    
    // Get content options
    const options = {
      includeHeadings: includeHeadingsCheckbox.checked,
      includeImages: includeImagesCheckbox.checked,
      includeLinks: includeLinksCheckbox.checked,
      includeCodeBlocks: includeCodeBlocksCheckbox.checked
    };
    
    updateStatus(`Starting extraction of ${collectedUrls.length} pages...`);
    showProgressBar(0);
    
    // Update status in background script
    chrome.runtime.sendMessage({
      action: 'updateStatus',
      status: 'processing'
    });
    
    // Process URLs sequentially
    processNextUrl(0, options);
  }
  
  /**
   * Process URLs one by one
   * @param {number} index - Current URL index
   * @param {Object} options - Content extraction options
   */
  function processNextUrl(index, options) {
    if (index >= collectedUrls.length) {
      // All URLs processed
      updateStatus(`Completed processing ${processedPages.length} pages`);
      showProgressBar(100);
      
      // Enable download button
      downloadZipButton.disabled = false;
      
      // Update status in background script
      chrome.runtime.sendMessage({
        action: 'updateStatus',
        status: 'completed'
      });
      
      return;
    }
    
    const currentUrl = collectedUrls[index].url;
    const progress = Math.round((index / collectedUrls.length) * 100);
    
    updateStatus(`Processing ${index + 1}/${collectedUrls.length}: ${getUrlDomain(currentUrl)}`);
    showProgressBar(progress);
    
    // Open URL in a new tab
    chrome.tabs.create({ url: currentUrl, active: false }, (tab) => {
      // Wait for page to load with an increasing timeout
      const loadTimeout = 3000; // 3 seconds base loading time
      
      // Listen for tab updates to ensure the page is fully loaded
      const tabUpdateListener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          // Remove the listener once the page is loaded
          chrome.tabs.onUpdated.removeListener(tabUpdateListener);
          
          // Small additional delay to ensure scripts are initialized
          setTimeout(() => {
            // Extract content from the page
            chrome.tabs.sendMessage(
              tab.id,
              { 
                action: 'extractContent', 
                options: {
                  ...options,
                  baseUrl: currentUrl // Pass the current URL as baseUrl
                }
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error('Error communicating with content script:', chrome.runtime.lastError);
                  
                  // Close the tab and continue
                  chrome.tabs.remove(tab.id, () => {
                    processNextUrl(index + 1, options);
                  });
                  return;
                }
                
                if (response && response.markdown) {
                  // Add to processed pages
                  processedPages.push({
                    url: currentUrl,
                    title: response.metadata.title,
                    markdown: response.markdown,
                    metadata: response.metadata
                  });
                  
                  // Store in background script
                  chrome.runtime.sendMessage({
                    action: 'addPage',
                    pageData: {
                      url: currentUrl,
                      title: response.metadata.title,
                      markdown: response.markdown,
                      metadata: response.metadata
                    }
                  });
                  
                  // Close the tab
                  chrome.tabs.remove(tab.id, () => {
                    // Process next URL
                    processNextUrl(index + 1, options);
                  });
                } else {
                  console.error('Error extracting content from', currentUrl);
                  
                  // Close the tab and continue
                  chrome.tabs.remove(tab.id, () => {
                    processNextUrl(index + 1, options);
                  });
                }
              }
            );
          }, 500); // Short delay after page load complete
        }
      };
      
      // Add the listener for tab updates
      chrome.tabs.onUpdated.addListener(tabUpdateListener);
      
      // Failsafe timeout in case the tab never fully loads
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
        
        // Try extraction anyway or skip to next URL
        chrome.tabs.sendMessage(
          tab.id,
          { 
            action: 'extractContent', 
            options: {
              ...options,
              baseUrl: currentUrl
            }
          },
          (response) => {
            if (response && response.markdown) {
              processedPages.push({
                url: currentUrl,
                title: response.metadata.title,
                markdown: response.markdown,
                metadata: response.metadata
              });
              
              chrome.runtime.sendMessage({
                action: 'addPage',
                pageData: {
                  url: currentUrl,
                  title: response.metadata.title,
                  markdown: response.markdown,
                  metadata: response.metadata
                }
              });
            }
            
            // Close the tab and continue
            chrome.tabs.remove(tab.id, () => {
              processNextUrl(index + 1, options);
            });
          }
        );
      }, loadTimeout + 5000); // Failsafe timeout after normal loading time
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
