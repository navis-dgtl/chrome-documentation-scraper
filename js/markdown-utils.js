// markdown-utils.js - Markdown enhancement and post-processing utilities

/**
 * Enhance markdown content with frontmatter, TOC, and other features.
 * @param {string} markdown
 * @param {Object} options
 * @returns {string}
 */
function enhanceMarkdown(markdown, options = {}) {
  let md = markdown;

  if (options.addFrontmatter) {
    md = addFrontmatter(md, options.metadata);
  }
  if (options.addTableOfContents) {
    md = addTableOfContents(md);
  }
  if (options.formatCodeBlocks) {
    md = formatCodeBlocks(md);
  }
  if (options.fixRelativeLinks) {
    md = fixRelativeLinks(md, options.baseUrl || options.metadata?.url || '');
  }

  return md;
}

/**
 * Add YAML frontmatter.
 */
function addFrontmatter(markdown, metadata = {}) {
  const lines = [
    '---',
    `title: "${escapeYaml(metadata.title || '')}"`,
    `url: "${escapeYaml(metadata.url || '')}"`,
    `date: "${metadata.timestamp || new Date().toISOString()}"`,
    `source: "${escapeYaml(metadata.domain || '')}"`,
  ];
  if (metadata.description) {
    lines.push(`description: "${escapeYaml(metadata.description)}"`);
  }
  if (metadata.author) {
    lines.push(`author: "${escapeYaml(metadata.author)}"`);
  }
  lines.push('---', '', markdown);
  return lines.join('\n');
}

function escapeYaml(str) {
  return (str || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

/**
 * Generate a table of contents from headings.
 */
function addTableOfContents(markdown) {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings = [];
  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
      anchor: match[2].trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
    });
  }

  if (headings.length < 3) return markdown; // Skip TOC for short docs

  let toc = '## Table of Contents\n\n';
  headings.forEach(h => {
    if (h.level === 1) return; // Skip title
    const indent = '  '.repeat(h.level - 2);
    toc += `${indent}- [${h.text}](#${h.anchor})\n`;
  });

  // Insert after first heading
  const firstH = /^#\s+.+$/m.exec(markdown);
  if (firstH) {
    const pos = firstH.index + firstH[0].length;
    return markdown.slice(0, pos) + '\n\n' + toc + '\n' + markdown.slice(pos);
  }
  return toc + '\n\n' + markdown;
}

/**
 * Try to detect language for unlabeled code blocks.
 */
function formatCodeBlocks(markdown) {
  return markdown.replace(/```(\s*\n)([\s\S]*?)```/g, (match, ws, code) => {
    // Only detect if no language is specified (just whitespace after ```)
    if (ws.trim() === '') {
      const lang = detectLanguage(code);
      return '```' + lang + '\n' + code + '```';
    }
    return match;
  });
}

function detectLanguage(code) {
  if (/\b(function|const|let|var|=>|require\(|import\s+.*from)\b/.test(code) && /[{};]/.test(code)) return 'javascript';
  if (/\b(def |class |import |from .+ import|print\(|if .+:)\b/.test(code)) return 'python';
  if (/\b(public|private|class|void|static|System\.out)\b/.test(code) && /{|}/.test(code)) return 'java';
  if (/<\/?[a-z][^>]*>/i.test(code) && /<\/?(div|span|p|a|html|body|head)\b/i.test(code)) return 'html';
  if (/\b(SELECT|FROM|WHERE|JOIN|INSERT|UPDATE|DELETE)\b/i.test(code)) return 'sql';
  if (/\b(fn |let mut|struct |impl |pub fn|use |match )\b/.test(code)) return 'rust';
  if (/\b(func |package |import |fmt\.|go |defer )\b/.test(code)) return 'go';
  if (/^\s*[\w-]+\s*:\s*.+/m.test(code) && !/[{;}]/.test(code)) return 'yaml';
  if (/^\s*\{[\s\S]*"[\w]+"/.test(code)) return 'json';
  if (/^\s*\$\s+/.test(code) || /\b(echo|export|sudo|apt|npm|yarn|pip)\b/.test(code)) return 'bash';
  return '';
}

/**
 * Resolve relative links to absolute URLs.
 */
function fixRelativeLinks(markdown, baseUrl) {
  if (!baseUrl) return markdown;
  return markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('#') || url.startsWith('data:')) {
      return match;
    }
    try {
      return `[${text}](${new URL(url, baseUrl).href})`;
    } catch {
      return match;
    }
  });
}

/**
 * Clean and normalize markdown.
 */
function cleanMarkdown(markdown) {
  let md = markdown;
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.replace(/[ \t]+$/gm, '');
  md = md.trimEnd() + '\n';
  return md;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { enhanceMarkdown, addFrontmatter, addTableOfContents, formatCodeBlocks, fixRelativeLinks, cleanMarkdown };
}
