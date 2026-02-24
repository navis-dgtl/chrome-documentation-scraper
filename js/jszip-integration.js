// jszip-integration.js - ZIP file creation and download

/**
 * Create a ZIP archive from extracted pages.
 * @param {Array} pages - Array of { url, title, markdown, metadata }
 * @param {Object} options
 * @returns {Promise<Blob>}
 */
function createMarkdownZip(pages, options = {}) {
  return new Promise((resolve, reject) => {
    if (!pages || pages.length === 0) {
      reject(new Error('No pages to include'));
      return;
    }

    const zip = new JSZip();

    pages.forEach((page, index) => {
      const title = page.title || `Page ${index + 1}`;
      const filename = sanitizeFilename(`${String(index + 1).padStart(3, '0')}-${title}`) + '.md';

      let markdown = page.markdown || '';

      if (options.enhanceMarkdown && typeof enhanceMarkdown === 'function') {
        markdown = enhanceMarkdown(markdown, {
          addFrontmatter: options.addFrontmatter !== false,
          addTableOfContents: options.addTableOfContents === true,
          formatCodeBlocks: options.formatCodeBlocks !== false,
          fixRelativeLinks: options.fixRelativeLinks !== false,
          metadata: page.metadata || {},
          baseUrl: page.url,
        });
      }

      zip.file(filename, markdown);
    });

    // Index file
    if (options.createIndex) {
      let index = '# Knowledge Base Index\n\n';
      index += `> Generated on ${new Date().toISOString()}\n\n`;
      index += `| # | Title | Source |\n`;
      index += `| --- | --- | --- |\n`;
      pages.forEach((page, i) => {
        const title = page.title || `Page ${i + 1}`;
        const filename = sanitizeFilename(`${String(i + 1).padStart(3, '0')}-${title}`) + '.md';
        index += `| ${i + 1} | [${title}](${filename}) | [Link](${page.url}) |\n`;
      });
      zip.file('000-index.md', index);
    }

    // README
    zip.file('README.md', createReadme(pages));

    zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      .then(resolve)
      .catch(reject);
  });
}

function createReadme(pages) {
  const domains = [...new Set(pages.map(p => {
    try { return new URL(p.url).hostname; } catch { return null; }
  }).filter(Boolean))];

  let md = '# Knowledge Base\n\n';
  md += `This archive contains **${pages.length}** markdown files extracted from **${domains.length}** domain(s).\n\n`;
  md += `Generated on: ${new Date().toISOString()}\n\n`;

  if (domains.length > 0) {
    md += '## Sources\n\n';
    domains.forEach(d => { md += `- ${d}\n`; });
    md += '\n';
  }

  md += '## Usage\n\n';
  md += 'These files can be used as context for AI assistants (Claude, ChatGPT, etc.), ';
  md += 'uploaded to RAG systems, or used as reference documentation.\n\n';
  md += '## Structure\n\n';
  md += '- `000-index.md` - Table of contents with links to all documents\n';
  md += '- `NNN-Title.md` - Individual extracted pages\n';

  return md;
}

/**
 * Trigger a blob download.
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
