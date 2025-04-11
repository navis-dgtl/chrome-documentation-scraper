// markdown-utils.js - Utilities for markdown processing and enhancement

/**
 * Enhance markdown content with additional formatting and features
 * @param {string} markdown - Original markdown content
 * @param {Object} options - Enhancement options
 * @returns {string} - Enhanced markdown content
 */
function enhanceMarkdown(markdown, options = {}) {
  let enhancedMarkdown = markdown;
  
  // Add frontmatter if requested
  if (options.addFrontmatter) {
    enhancedMarkdown = addFrontmatter(enhancedMarkdown, options.metadata);
  }
  
  // Add table of contents if requested
  if (options.addTableOfContents) {
    enhancedMarkdown = addTableOfContents(enhancedMarkdown);
  }
  
  // Format code blocks with proper syntax highlighting hints
  if (options.formatCodeBlocks) {
    enhancedMarkdown = formatCodeBlocks(enhancedMarkdown);
  }
  
  // Fix relative links if requested
  if (options.fixRelativeLinks) {
    enhancedMarkdown = fixRelativeLinks(enhancedMarkdown, options.baseUrl || options.metadata?.url || '');
  }
  
  // Add section anchors if requested
  if (options.addSectionAnchors) {
    enhancedMarkdown = addSectionAnchors(enhancedMarkdown);
  }
  
  return enhancedMarkdown;
}

/**
 * Add YAML frontmatter to markdown content
 * @param {string} markdown - Original markdown content
 * @param {Object} metadata - Metadata to include in frontmatter
 * @returns {string} - Markdown with frontmatter
 */
function addFrontmatter(markdown, metadata = {}) {
  const frontmatter = [
    '---',
    `title: "${escapeYaml(metadata.title || '')}"`,
    `url: "${escapeYaml(metadata.url || '')}"`,
    `date: "${metadata.timestamp || new Date().toISOString()}"`,
    `source: "${escapeYaml(metadata.domain || '')}"`,
    '---',
    '',
    markdown
  ].join('\n');
  
  return frontmatter;
}

/**
 * Escape special characters in YAML strings
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeYaml(str) {
  return str.replace(/"/g, '\\"');
}

/**
 * Add table of contents to markdown content
 * @param {string} markdown - Original markdown content
 * @returns {string} - Markdown with table of contents
 */
function addTableOfContents(markdown) {
  // Extract headings
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings = [];
  let match;
  
  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const anchor = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    
    headings.push({
      level,
      text,
      anchor
    });
  }
  
  // Generate table of contents
  if (headings.length === 0) {
    return markdown;
  }
  
  let toc = '## Table of Contents\n\n';
  
  headings.forEach(heading => {
    // Skip level 1 (title)
    if (heading.level === 1) {
      return;
    }
    
    const indent = '  '.repeat(heading.level - 2);
    toc += `${indent}- [${heading.text}](#${heading.anchor})\n`;
  });
  
  // Find position to insert TOC (after first heading)
  const firstHeadingMatch = /^#\s+.+$/m.exec(markdown);
  
  if (firstHeadingMatch) {
    const insertPosition = firstHeadingMatch.index + firstHeadingMatch[0].length;
    return markdown.slice(0, insertPosition) + '\n\n' + toc + '\n' + markdown.slice(insertPosition);
  } else {
    return toc + '\n\n' + markdown;
  }
}

/**
 * Format code blocks with proper syntax highlighting hints
 * @param {string} markdown - Original markdown content
 * @returns {string} - Markdown with formatted code blocks
 */
function formatCodeBlocks(markdown) {
  // Detect language in code blocks without language specified
  return markdown.replace(/```(\s*\n[\s\S]+?```)/g, (match, codeContent) => {
    // Try to detect language based on content
    const language = detectCodeLanguage(codeContent);
    return '```' + language + codeContent;
  });
}

/**
 * Detect programming language from code content
 * @param {string} code - Code content
 * @returns {string} - Detected language or empty string
 */
function detectCodeLanguage(code) {
  // Simple language detection based on keywords and syntax
  if (/\b(function|const|let|var|return|if|else|for|while)\b/.test(code) && 
      /[{};]/.test(code)) {
    return 'javascript';
  } else if (/\b(def|class|import|from|if|else|for|while|try|except)\b/.test(code) && 
            /:\s*$/.test(code)) {
    return 'python';
  } else if (/\b(public|private|class|void|static|final|import|package)\b/.test(code) && 
            /{|}/.test(code)) {
    return 'java';
  } else if (/<\/?[a-z][\s\S]*>/i.test(code)) {
    return 'html';
  } else if (/\b(SELECT|FROM|WHERE|JOIN|GROUP BY|ORDER BY)\b/i.test(code)) {
    return 'sql';
  } else if (/\b(namespace|using|class|public|private|void|int|string)\b/.test(code) && 
            /{|}/.test(code)) {
    return 'csharp';
  } else if (/\b(fn|let|mut|struct|impl|pub|use|match)\b/.test(code) && 
            /{|}/.test(code)) {
    return 'rust';
  }
  
  return '';
}

/**
 * Fix relative links in markdown content
 * @param {string} markdown - Original markdown content
 * @param {string} baseUrl - Base URL for resolving relative links
 * @returns {string} - Markdown with fixed links
 */
function fixRelativeLinks(markdown, baseUrl) {
  // Fix relative links in markdown
  return markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('#')) {
      return match;
    }
    
    try {
      const absoluteUrl = new URL(url, baseUrl).href;
      return `[${text}](${absoluteUrl})`;
    } catch (e) {
      return match;
    }
  });
}

/**
 * Add section anchors to headings
 * @param {string} markdown - Original markdown content
 * @returns {string} - Markdown with section anchors
 */
function addSectionAnchors(markdown) {
  return markdown.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, text) => {
    const anchor = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `${hashes} ${text} <a id="${anchor}"></a>`;
  });
}

/**
 * Clean and normalize markdown content
 * @param {string} markdown - Original markdown content
 * @returns {string} - Cleaned markdown content
 */
function cleanMarkdown(markdown) {
  let cleanedMarkdown = markdown;
  
  // Remove duplicate blank lines
  cleanedMarkdown = cleanedMarkdown.replace(/\n{3,}/g, '\n\n');
  
  // Fix list item spacing
  cleanedMarkdown = cleanedMarkdown.replace(/^(\s*[-*+].*)\n(?!\s*[-*+]|\s*$|\s*[1-9][0-9]*\.)/gm, '$1\n\n');
  
  // Fix heading spacing
  cleanedMarkdown = cleanedMarkdown.replace(/^(#{1,6}.*)\n(?!$|#{1,6})/gm, '$1\n\n');
  
  // Fix code block spacing
  cleanedMarkdown = cleanedMarkdown.replace(/(```.*\n[\s\S]*?```)\n(?!$|```)/g, '$1\n\n');
  
  return cleanedMarkdown;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    enhanceMarkdown,
    addFrontmatter,
    addTableOfContents,
    formatCodeBlocks,
    fixRelativeLinks,
    addSectionAnchors,
    cleanMarkdown
  };
}
