// popup.js - Script for the extension popup

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
  
  // State
  let collectedUrls = [];
  let processedPages = [];
  
  // Initialize UI
  initializeUI();
  
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
    
    // Truncate the URL for display to avoid UI width issues
    const urlForDisplay = currentUrl.length > 30 
      ? currentUrl.substring(0, 27) + '...' 
      : currentUrl;
    
    updateStatus(`Processing ${index + 1}/${collectedUrls.length}: ${urlForDisplay}`);
    showProgressBar(progress);
    
    // Open URL in a new tab
    chrome.tabs.create({ url: currentUrl, active: false }, (tab) => {
      // Wait for page to load
      setTimeout(() => {
        // Extract content from the page
        chrome.tabs.sendMessage(
          tab.id,
          { action: 'extractContent', options },
          (response) => {
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
      }, 3000); // Wait 3 seconds for page to load
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
    const outputFilename = outputFilenameInput.value.trim() || 'ai-knowledge-base';
    
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
    
    // If message contains a URL, add title attribute for tooltip on hover
    if (message.includes('http')) {
      const urlMatch = message.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch && urlMatch[1]) {
        statusText.setAttribute('title', urlMatch[1]);
      }
    }
  }
  
  /**
   * Show progress bar with specified percentage
   * @param {number} percent - Progress percentage (0-100)
   */
  function showProgressBar(percent) {
    progressBar.style.width = `${percent}%`;
  }
  
});
