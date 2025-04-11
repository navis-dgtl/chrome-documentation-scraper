// jszip-integration.js - Integration with JSZip library for file compression

/**
 * Create a ZIP file from markdown files
 * @param {Array} pages - Array of page objects with markdown content
 * @param {Object} options - ZIP creation options
 * @returns {Promise<Blob>} - Promise resolving to ZIP file blob
 */
function createMarkdownZip(pages, options = {}) {
  return new Promise((resolve, reject) => {
    if (!pages || pages.length === 0) {
      reject(new Error('No pages to include in ZIP file'));
      return;
    }
    
    // Create a new ZIP file
    const zip = new JSZip();
    
    // Add each page as a markdown file
    pages.forEach((page, index) => {
      // Create filename from title or URL
      const title = page.title || `Page ${index + 1}`;
      const filename = sanitizeFilename(`${index + 1}-${title}`) + '.md';
      
      // Get markdown content
      let markdown = page.markdown;
      
      // Apply markdown enhancements if utils are available
      if (options.enhanceMarkdown && typeof enhanceMarkdown === 'function') {
        markdown = enhanceMarkdown(markdown, {
          addFrontmatter: options.addFrontmatter !== false,
          addTableOfContents: options.addTableOfContents === true,
          formatCodeBlocks: options.formatCodeBlocks !== false,
          fixRelativeLinks: options.fixRelativeLinks !== false,
          addSectionAnchors: options.addSectionAnchors === true,
          metadata: page.metadata || {},
          baseUrl: page.url // Pass the page URL as baseUrl for fixing relative links
        });
      }
      
      // Add file to ZIP
      zip.file(filename, markdown);
    });
    
    // Create index file if requested
    if (options.createIndex) {
      let indexContent = '# AI Knowledge Base Index\n\n';
      indexContent += 'This knowledge base contains the following documents:\n\n';
      
      pages.forEach((page, index) => {
        const title = page.title || `Page ${index + 1}`;
        const filename = sanitizeFilename(`${index + 1}-${title}`) + '.md';
        indexContent += `${index + 1}. [${title}](${filename}) - [Original Source](${page.url})\n`;
      });
      
      zip.file('00-index.md', indexContent);
    }
    
    // Add README file
    const readmeContent = createReadmeContent(pages, options);
    zip.file('README.md', readmeContent);
    
    // Generate ZIP file
    zip.generateAsync({ type: 'blob' })
      .then(resolve)
      .catch(reject);
  });
}

/**
 * Create README content for the ZIP file
 * @param {Array} pages - Array of page objects
 * @param {Object} options - Options
 * @returns {string} - README content
 */
function createReadmeContent(pages, options) {
  const timestamp = new Date().toISOString();
  const sourceUrls = pages.map(page => page.url).filter(Boolean);
  const uniqueDomains = [...new Set(sourceUrls.map(url => {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return null;
    }
  }).filter(Boolean))];
  
  let content = '# AI Knowledge Base\n\n';
  content += `This knowledge base was created on ${timestamp} using the AI Knowledge Base Extractor Chrome Extension.\n\n`;
  
  content += '## Contents\n\n';
  content += `This archive contains ${pages.length} markdown files extracted from ${uniqueDomains.length} domain(s).\n\n`;
  
  if (uniqueDomains.length > 0) {
    content += 'Source domains:\n';
    uniqueDomains.forEach(domain => {
      content += `- ${domain}\n`;
    });
    content += '\n';
  }
  
  content += '## Usage\n\n';
  content += 'These markdown files can be used as a knowledge base for AI assistants like Claude, ChatGPT, or other LLMs. ';
  content += 'You can upload them directly to AI tools that support document upload, or use them with tools like Retrieval-Augmented Generation (RAG) systems.\n\n';
  
  content += '## File Structure\n\n';
  content += '- `00-index.md`: Index of all documents with links (if enabled)\n';
  content += '- `XX-Title.md`: Individual documents extracted from web pages\n';
  
  return content;
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

/**
 * Download a blob as a file
 * @param {Blob} blob - File blob
 * @param {string} filename - Filename
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
