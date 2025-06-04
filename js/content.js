// content.js - Content script that runs in the context of web pages

// Debug flag for verbose logging. Enable while developing.
const DEBUG = false;

function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

/**
 * Extract content from the current page and convert to markdown
 * @param {Object} options - Extraction options
 * @returns {Object} - Extracted content in markdown format and metadata
 */
function extractContent(options) {
  const {
    includeHeadings = true,
    includeImages = true,
    includeLinks = true,
    includeCodeBlocks = true,
    baseUrl = window.location.href, // Use provided baseUrl or default to current URL
    selectorsToRemove = []
  } = options || {};

  // Get page metadata
  const metadata = {
    title: document.title,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    domain: window.location.hostname
  };

  // Clone the body to work with
  const bodyClone = document.body.cloneNode(true);
  
  // Remove unwanted elements
  const elementsToRemove = [
    'script', 'style', 'iframe', 'noscript', 'svg',
    'nav', 'footer', 'aside', 'form', 'button',
    '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
    '[role="form"]', '[role="contentinfo"]', '[aria-hidden="true"]',
    '.cookie-banner', '.ad', '.advertisement', '.popup', '.modal',
    '#cookie-consent', '#newsletter-signup', '.sidebar'
  ];
  const allSelectors = elementsToRemove.concat(
    Array.isArray(selectorsToRemove) ? selectorsToRemove : []
  );

  allSelectors.forEach(selector => {
    const elements = bodyClone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  // Extract main content
  let mainContent = null;
  
  // Try to find main content area
  const contentSelectors = [
    'main', 
    '[role="main"]', 
    'article', 
    '.content', 
    '.main-content', 
    '.article-content',
    '#content', 
    '#main-content'
  ];
  
  for (const selector of contentSelectors) {
    const element = bodyClone.querySelector(selector);
    if (element) {
      mainContent = element;
      break;
    }
  }
  
  // If no main content found, use body
  if (!mainContent) {
    mainContent = bodyClone;
  }

  // Convert HTML to markdown
  let markdown = '';
  
  // Add title
  markdown += `# ${document.title}\n\n`;
  markdown += `*Source: [${metadata.url}](${metadata.url})*\n\n`;
  
  // Process content
  markdown += processNode(mainContent, {
    includeHeadings,
    includeImages,
    includeLinks,
    includeCodeBlocks
  });
  
  return {
    markdown,
    metadata
  };
}

/**
 * Process a DOM node and its children to convert to markdown
 * @param {Node} node - DOM node to process
 * @param {Object} options - Processing options
 * @returns {string} - Markdown content
 */
function processNode(node, options) {
  if (!node) return '';
  
  let markdown = '';
  
  // Process node based on type
  if (node.nodeType === Node.TEXT_NODE) {
    // Text node
    const text = node.textContent.trim();
    if (text) {
      markdown += text + ' ';
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    // Element node
    const tagName = node.tagName.toLowerCase();
    
    // Handle different element types
    switch (tagName) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        if (options.includeHeadings) {
          const level = parseInt(tagName.charAt(1));
          const headingText = node.textContent.trim();
          markdown += `\n${'#'.repeat(level)} ${headingText}\n\n`;
        }
        break;
        
      case 'p':
        const paragraphText = processChildNodes(node, options);
        if (paragraphText.trim()) {
          markdown += paragraphText + '\n\n';
        }
        break;
        
      case 'ul':
      case 'ol':
        markdown += '\n';
        for (const li of node.children) {
          if (li.tagName.toLowerCase() === 'li') {
            const prefix = tagName === 'ul' ? '- ' : '1. ';
            const listItemText = processChildNodes(li, options);
            markdown += `${prefix}${listItemText}\n`;
          }
        }
        markdown += '\n';
        break;
        
      case 'img':
        if (options.includeImages) {
          const alt = node.getAttribute('alt') || 'image';
          const src = node.getAttribute('src') || '';
          if (src) {
            const absoluteSrc = new URL(src, window.location.href).href;
            markdown += `![${alt}](${absoluteSrc})\n\n`;
          }
        }
        break;
        
      case 'a':
        if (options.includeLinks) {
          const href = node.getAttribute('href');
          const linkText = node.textContent.trim();
          if (href && linkText) {
            const absoluteHref = new URL(href, window.location.href).href;
            markdown += `[${linkText}](${absoluteHref})`;
          } else {
            markdown += processChildNodes(node, options);
          }
        } else {
          markdown += processChildNodes(node, options);
        }
        break;
        
      case 'code':
        if (options.includeCodeBlocks) {
          const code = node.textContent.trim();
          const parent = node.parentNode;
          if (parent && parent.tagName.toLowerCase() === 'pre') {
            // Code block
            const language = node.className.replace('language-', '').trim() || '';
            markdown += `\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
          } else {
            // Inline code
            markdown += `\`${code}\``;
          }
        } else {
          markdown += node.textContent.trim();
        }
        break;
        
      case 'pre':
        // Skip pre processing if it contains a code element (handled by code case)
        if (!node.querySelector('code')) {
          if (options.includeCodeBlocks) {
            const preText = node.textContent.trim();
            markdown += `\n\`\`\`\n${preText}\n\`\`\`\n\n`;
          }
        }
        break;
        
      case 'blockquote':
        const quoteText = processChildNodes(node, options);
        const quoteParagraphs = quoteText.trim().split('\n\n');
        markdown += '\n';
        quoteParagraphs.forEach(paragraph => {
          if (paragraph.trim()) {
            markdown += `> ${paragraph.trim()}\n`;
          }
        });
        markdown += '\n';
        break;
        
      case 'table':
        markdown += processTable(node) + '\n\n';
        break;
        
      case 'br':
        markdown += '\n';
        break;
        
      case 'strong':
      case 'b':
        markdown += `**${processChildNodes(node, options)}**`;
        break;
        
      case 'em':
      case 'i':
        markdown += `*${processChildNodes(node, options)}*`;
        break;
        
      case 'hr':
        markdown += '\n---\n\n';
        break;
        
      default:
        // Process children for other elements
        markdown += processChildNodes(node, options);
    }
  }
  
  return markdown;
}

/**
 * Process child nodes of a DOM element
 * @param {Element} element - Parent element
 * @param {Object} options - Processing options
 * @returns {string} - Markdown content
 */
function processChildNodes(element, options) {
  let markdown = '';
  
  for (const child of element.childNodes) {
    markdown += processNode(child, options);
  }
  
  return markdown;
}

/**
 * Process a table element to markdown
 * @param {Element} tableElement - Table DOM element
 * @returns {string} - Markdown table
 */
function processTable(tableElement) {
  let markdown = '';
  const rows = tableElement.querySelectorAll('tr');
  
  if (rows.length === 0) return '';
  
  // Process header row
  const headerRow = rows[0];
  const headerCells = headerRow.querySelectorAll('th');
  
  if (headerCells.length > 0) {
    // Table has header cells
    markdown += '| ';
    headerCells.forEach(cell => {
      markdown += cell.textContent.trim() + ' | ';
    });
    markdown += '\n| ';
    
    // Add separator row
    headerCells.forEach(() => {
      markdown += '--- | ';
    });
    markdown += '\n';
    
    // Process data rows starting from index 1
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.querySelectorAll('td');
      
      if (cells.length > 0) {
        markdown += '| ';
        cells.forEach(cell => {
          markdown += cell.textContent.trim() + ' | ';
        });
        markdown += '\n';
      }
    }
  } else {
    // No header cells, treat first row as regular data
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      
      if (cells.length > 0) {
        markdown += '| ';
        cells.forEach(cell => {
          markdown += cell.textContent.trim() + ' | ';
        });
        markdown += '\n';
      }
    }
  }
  
  return markdown;
}

/**
 * Collect all links from the current page
 * @param {Object} options - Collection options
 * @returns {Array} - Array of link objects with url and text
 */
function collectLinks(options = {}) {
  const { includePattern, excludePattern } = options;
  
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map(link => {
      const href = link.getAttribute('href');
      if (!href) return null;
      
      // Convert to absolute URL
      const absoluteUrl = new URL(href, window.location.href).href;
      
      return {
        url: absoluteUrl,
        text: link.textContent.trim() || absoluteUrl
      };
    })
    .filter(link => link !== null);
  
  // Apply filters if provided
  let filteredLinks = links;

  if (includePattern) {
    let includeRegex;
    try {
      includeRegex = new RegExp(includePattern);
    } catch (e) {
      throw new Error(`Invalid include pattern: ${e.message}`);
    }
    filteredLinks = filteredLinks.filter(link => includeRegex.test(link.url));
  }

  if (excludePattern) {
    let excludeRegex;
    try {
      excludeRegex = new RegExp(excludePattern);
    } catch (e) {
      throw new Error(`Invalid exclude pattern: ${e.message}`);
    }
    filteredLinks = filteredLinks.filter(link => !excludeRegex.test(link.url));
  }
  
  // Filter out duplicates
  const uniqueUrls = new Set();
  const uniqueLinks = [];
  
  for (const link of filteredLinks) {
    if (!uniqueUrls.has(link.url)) {
      uniqueUrls.add(link.url);
      uniqueLinks.push(link);
    }
  }
  
  return uniqueLinks;
}

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('Content script received message:', request.action);
  
  try {
    if (request.action === 'extractContent') {
      const result = extractContent(request.options);
      debugLog('Extracted content:', result ? 'Success' : 'Failed');
      sendResponse(result);
    } else if (request.action === 'collectLinks') {
      const links = collectLinks(request.options);
      debugLog('Collected links:', links.length);
      sendResponse({ links });
    }
  } catch (error) {
    console.error('Error in content script:', error);
    sendResponse({ error: error.message });
  }
  
  // Return true to indicate async response
  return true;
});

// Log that content script is loaded
debugLog('Navis.ai Knowledge Builder content script loaded at', new Date().toISOString());
