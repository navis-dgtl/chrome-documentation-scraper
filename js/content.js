// content.js - Content script for extracting links and content from web pages
// Handles SPA frameworks (Next.js, Nuxt, React Router, etc.) with dynamic content detection

// Top-level guard using var (safe to re-declare unlike const/let)
// This prevents errors when the script is injected multiple times
var __navisGuard = window.__navisContentScriptLoaded;
if (!__navisGuard) {
window.__navisContentScriptLoaded = true;

(() => {
  var DEBUG = false;
  function debugLog(...args) {
    if (DEBUG) console.log('[Navis]', ...args);
  }

  // ─── SPA Detection ───────────────────────────────────────────────
  function detectSPAFramework() {
    const indicators = {
      nextjs: !!document.querySelector('#__next') || !!document.querySelector('script#__NEXT_DATA__'),
      nuxt: !!document.querySelector('#__nuxt') || !!document.querySelector('#__NUXT_DATA__'),
      gatsby: !!document.querySelector('#___gatsby'),
      react: !!document.querySelector('[data-reactroot]') || !!document.querySelector('#root'),
      vue: !!document.querySelector('#app[data-v-app]') || !!document.querySelector('[data-v-]'),
      angular: !!document.querySelector('[ng-version]') || !!document.querySelector('app-root'),
      svelte: !!document.querySelector('[class*="svelte-"]'),
      docusaurus: !!document.querySelector('#__docusaurus'),
      gitbook: !!document.querySelector('.gitbook-root'),
      mkdocs: !!document.querySelector('[data-md-component]'),
      nextra: !!document.querySelector('script#__NEXT_DATA__') && !!document.querySelector('nav'),
    };
    const detected = Object.entries(indicators).filter(([, v]) => v).map(([k]) => k);
    debugLog('Detected frameworks:', detected);
    return detected;
  }

  // ─── Wait for Dynamic Content ────────────────────────────────────
  // Waits for the page to stabilize (no new DOM mutations for a period)
  function waitForDynamicContent(timeoutMs = 5000, stabilityMs = 800) {
    return new Promise((resolve) => {
      const frameworks = detectSPAFramework();

      // For static sites, resolve quickly
      if (frameworks.length === 0 && document.readyState === 'complete') {
        setTimeout(resolve, 300);
        return;
      }

      let stabilityTimer = null;
      let resolved = false;

      const observer = new MutationObserver(() => {
        if (resolved) return;
        clearTimeout(stabilityTimer);
        stabilityTimer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            observer.disconnect();
            resolve();
          }
        }, stabilityMs);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
      });

      // Start the stability timer immediately in case no mutations happen
      stabilityTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve();
        }
      }, stabilityMs);

      // Hard timeout as fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve();
        }
      }, timeoutMs);
    });
  }

  // ─── Extract Next.js Route Data ──────────────────────────────────
  function extractNextjsRoutes() {
    const links = [];
    try {
      const nextDataEl = document.querySelector('script#__NEXT_DATA__');
      if (nextDataEl) {
        const data = JSON.parse(nextDataEl.textContent);
        // Some Next.js sites expose page routes in __NEXT_DATA__
        if (data.props?.pageProps?.pages) {
          const pages = data.props.pageProps.pages;
          if (Array.isArray(pages)) {
            pages.forEach(page => {
              if (typeof page === 'string') {
                const url = new URL(page, window.location.origin).href;
                links.push({ url, text: page });
              } else if (page.route || page.path || page.href) {
                const path = page.route || page.path || page.href;
                const url = new URL(path, window.location.origin).href;
                links.push({ url, text: page.title || path });
              }
            });
          }
        }
        // Check for sitemap-like data in various locations
        if (data.props?.pageProps?.sidebarRoutes || data.props?.pageProps?.routes) {
          const routes = data.props.pageProps.sidebarRoutes || data.props.pageProps.routes;
          extractRoutesRecursive(routes, links);
        }
      }
    } catch (e) {
      debugLog('Error extracting Next.js routes:', e);
    }
    return links;
  }

  function extractRoutesRecursive(routes, links) {
    if (!routes) return;
    const items = Array.isArray(routes) ? routes : [routes];
    items.forEach(route => {
      if (route.route || route.path || route.href) {
        const path = route.route || route.path || route.href;
        try {
          const url = new URL(path, window.location.origin).href;
          links.push({ url, text: route.title || route.name || path });
        } catch (e) { /* skip invalid URLs */ }
      }
      if (route.children) extractRoutesRecursive(route.children, links);
      if (route.routes) extractRoutesRecursive(route.routes, links);
      if (route.pages) extractRoutesRecursive(route.pages, links);
    });
  }

  // ─── Collect Links ───────────────────────────────────────────────
  // Collects all links from the page, including dynamically rendered ones
  async function collectLinks(options = {}) {
    const { includePattern, excludePattern } = options;

    // Wait for dynamic content to render
    await waitForDynamicContent();

    const linkMap = new Map(); // url -> { url, text }

    // 1. Collect standard anchor links from the FULL document (don't filter out nav/sidebar)
    document.querySelectorAll('a[href]').forEach(anchor => {
      try {
        const href = anchor.getAttribute('href');
        if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        const url = new URL(href, window.location.href).href;
        // Skip fragment-only links to the same page
        if (url.split('#')[0] === window.location.href.split('#')[0] && href.startsWith('#')) return;
        const text = anchor.textContent.trim() || anchor.getAttribute('aria-label') || url;
        if (!linkMap.has(url)) {
          linkMap.set(url, { url, text: text.substring(0, 200) });
        }
      } catch (e) { /* skip invalid URLs */ }
    });

    // 2. Try to extract routes from Next.js data
    const nextjsLinks = extractNextjsRoutes();
    nextjsLinks.forEach(link => {
      if (!linkMap.has(link.url)) {
        linkMap.set(link.url, link);
      }
    });

    // 3. Look for sitemap links in meta tags or link elements
    document.querySelectorAll('link[rel="sitemap"], link[rel="alternate"]').forEach(el => {
      try {
        const href = el.getAttribute('href');
        if (href) {
          const url = new URL(href, window.location.href).href;
          if (!linkMap.has(url)) {
            linkMap.set(url, { url, text: el.getAttribute('title') || url });
          }
        }
      } catch (e) { /* skip */ }
    });

    // Convert to array and apply filters
    let links = Array.from(linkMap.values());

    // Filter: only http/https links
    links = links.filter(link => link.url.startsWith('http://') || link.url.startsWith('https://'));

    // Apply include pattern
    if (includePattern) {
      try {
        const re = new RegExp(includePattern);
        links = links.filter(link => re.test(link.url));
      } catch (e) {
        throw new Error(`Invalid include pattern: ${e.message}`);
      }
    }

    // Apply exclude pattern
    if (excludePattern) {
      try {
        const re = new RegExp(excludePattern);
        links = links.filter(link => !re.test(link.url));
      } catch (e) {
        throw new Error(`Invalid exclude pattern: ${e.message}`);
      }
    }

    // Remove duplicates (normalize trailing slashes for comparison)
    const seen = new Set();
    const unique = [];
    for (const link of links) {
      const normalized = link.url.replace(/\/$/, '');
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(link);
      }
    }

    debugLog(`Collected ${unique.length} unique links`);
    return unique;
  }

  // ─── Content Extraction ──────────────────────────────────────────

  // Elements to remove for content extraction (NOT for link collection)
  const NOISE_SELECTORS = [
    'script', 'style', 'noscript', 'iframe',
    'header:not(article header)', 'footer:not(article footer)',
    '[role="banner"]', '[role="contentinfo"]',
    '[aria-hidden="true"]',
    '.cookie-banner', '.cookie-consent', '#cookie-consent',
    '.ad', '.ads', '.advertisement', '.adsbygoogle',
    '.popup', '.modal', '.overlay',
    '#newsletter-signup', '.newsletter',
    '.social-share', '.share-buttons',
    '.comments', '#comments', '.disqus',
    '.related-posts', '.recommended',
  ];

  // Content area selectors, in priority order
  const CONTENT_SELECTORS = [
    'article',
    '[role="main"]',
    'main',
    '.markdown-body',        // GitHub-style
    '.prose',                // Tailwind prose
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.page-content',
    '.doc-content',
    '.docs-content',
    '#content',
    '#main-content',
    '.main-content',
    // Nextra / Next.js doc frameworks
    '.nextra-content',
    'div.nx-w-full',
    // Docusaurus
    '.theme-doc-markdown',
    '.markdown',
    // GitBook
    '.page-inner',
    // MkDocs
    '.md-content',
    // ReadTheDocs
    '.rst-content',
    '[itemprop="articleBody"]',
  ];

  async function extractContent(options = {}) {
    const {
      includeHeadings = true,
      includeImages = true,
      includeLinks = true,
      includeCodeBlocks = true,
      selectorsToRemove = [],
    } = options;

    // Wait for dynamic content
    await waitForDynamicContent();

    // Get metadata
    const metadata = {
      title: getPageTitle(),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      domain: window.location.hostname,
      description: getMetaContent('description') || getMetaContent('og:description') || '',
      author: getMetaContent('author') || '',
    };

    // Clone the body
    const bodyClone = document.body.cloneNode(true);

    // Remove noise elements
    const allSelectors = [...NOISE_SELECTORS, ...selectorsToRemove.filter(s => s)];
    allSelectors.forEach(selector => {
      try {
        bodyClone.querySelectorAll(selector).forEach(el => el.remove());
      } catch (e) { /* invalid selector, skip */ }
    });

    // Find the main content area
    let mainContent = null;
    for (const selector of CONTENT_SELECTORS) {
      try {
        const el = bodyClone.querySelector(selector);
        if (el && el.textContent.trim().length > 100) {
          mainContent = el;
          break;
        }
      } catch (e) { /* skip */ }
    }

    // Fallback: find the element with the most text content
    if (!mainContent) {
      mainContent = findLargestContentBlock(bodyClone) || bodyClone;
    }

    // Remove nav elements from within the content area (sidebars inside main, etc.)
    mainContent.querySelectorAll('nav, .sidebar, .toc, .table-of-contents, [role="navigation"]').forEach(el => {
      // Only remove if it's small relative to main content (likely navigation, not content)
      if (el.textContent.length < mainContent.textContent.length * 0.3) {
        el.remove();
      }
    });

    // Convert to markdown
    const mdOptions = { includeHeadings, includeImages, includeLinks, includeCodeBlocks };
    let markdown = `# ${metadata.title}\n\n`;
    markdown += `*Source: [${metadata.url}](${metadata.url})*\n\n`;
    markdown += nodeToMarkdown(mainContent, mdOptions).trim();

    // Clean up the markdown
    markdown = cleanMarkdownOutput(markdown);

    return { markdown, metadata };
  }

  function getPageTitle() {
    // Try multiple sources for a good title
    const ogTitle = getMetaContent('og:title');
    const twitterTitle = getMetaContent('twitter:title');
    const h1 = document.querySelector('h1');
    return ogTitle || twitterTitle || document.title || (h1 && h1.textContent.trim()) || 'Untitled';
  }

  function getMetaContent(name) {
    const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return el ? el.getAttribute('content') : '';
  }

  function findLargestContentBlock(root) {
    let best = null;
    let bestLength = 0;
    const candidates = root.querySelectorAll('div, section, article, main');
    candidates.forEach(el => {
      const text = el.textContent.trim();
      // Must have substantial text and not be the entire body
      if (text.length > bestLength && text.length > 200 && el !== root) {
        // Check that it's not just a wrapper of other large blocks
        const childTexts = Array.from(el.children).map(c => c.textContent.trim().length);
        const maxChildText = Math.max(0, ...childTexts);
        // If the largest child has almost all the text, prefer the child
        if (maxChildText < text.length * 0.9) {
          best = el;
          bestLength = text.length;
        }
      }
    });
    return best;
  }

  // ─── HTML to Markdown Conversion ─────────────────────────────────

  function nodeToMarkdown(node, options, context = {}) {
    if (!node) return '';

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!text.trim()) return '';
      // Preserve single spaces between inline elements
      return text.replace(/\s+/g, ' ');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const style = node.getAttribute('style') || '';

    // Skip hidden elements
    if (style.includes('display:none') || style.includes('display: none') ||
        style.includes('visibility:hidden') || style.includes('visibility: hidden') ||
        node.getAttribute('hidden') !== null) {
      return '';
    }

    switch (tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        if (!options.includeHeadings) return '';
        const level = parseInt(tag[1]);
        const text = getInlineText(node, options);
        if (!text.trim()) return '';
        return `\n\n${'#'.repeat(level)} ${text.trim()}\n\n`;
      }

      case 'p': {
        const text = childrenToMarkdown(node, options, context);
        if (!text.trim()) return '';
        return `\n\n${text.trim()}\n\n`;
      }

      case 'br':
        return '\n';

      case 'hr':
        return '\n\n---\n\n';

      case 'strong': case 'b': {
        const text = childrenToMarkdown(node, options, context);
        return text.trim() ? `**${text.trim()}**` : '';
      }

      case 'em': case 'i': {
        const text = childrenToMarkdown(node, options, context);
        return text.trim() ? `*${text.trim()}*` : '';
      }

      case 'del': case 's': case 'strike': {
        const text = childrenToMarkdown(node, options, context);
        return text.trim() ? `~~${text.trim()}~~` : '';
      }

      case 'mark': {
        const text = childrenToMarkdown(node, options, context);
        return text.trim() ? `==${text.trim()}==` : '';
      }

      case 'sup': {
        const text = childrenToMarkdown(node, options, context);
        return text.trim() ? `<sup>${text.trim()}</sup>` : '';
      }

      case 'sub': {
        const text = childrenToMarkdown(node, options, context);
        return text.trim() ? `<sub>${text.trim()}</sub>` : '';
      }

      case 'a': {
        if (!options.includeLinks) {
          return childrenToMarkdown(node, options, context);
        }
        const href = node.getAttribute('href');
        const text = getInlineText(node, options);
        if (!text.trim() && !href) return '';
        if (!href || href === '#' || href.startsWith('javascript:')) {
          return text;
        }
        try {
          const url = new URL(href, window.location.href).href;
          return `[${text.trim() || url}](${url})`;
        } catch {
          return text;
        }
      }

      case 'img': {
        if (!options.includeImages) return '';
        const alt = node.getAttribute('alt') || 'image';
        const src = node.getAttribute('src') || node.getAttribute('data-src') || '';
        if (!src) return '';
        try {
          const url = new URL(src, window.location.href).href;
          return `\n\n![${alt}](${url})\n\n`;
        } catch {
          return '';
        }
      }

      case 'picture': case 'figure': {
        const img = node.querySelector('img');
        const caption = node.querySelector('figcaption');
        let md = img ? nodeToMarkdown(img, options, context) : '';
        if (caption) {
          const capText = getInlineText(caption, options);
          if (capText.trim()) md += `\n*${capText.trim()}*\n`;
        }
        return md;
      }

      case 'ul': {
        const items = [];
        for (const child of node.children) {
          if (child.tagName.toLowerCase() === 'li') {
            const text = childrenToMarkdown(child, options, { ...context, listDepth: (context.listDepth || 0) + 1 });
            const indent = '  '.repeat(context.listDepth || 0);
            items.push(`${indent}- ${text.trim()}`);
          }
        }
        return items.length ? `\n\n${items.join('\n')}\n\n` : '';
      }

      case 'ol': {
        const items = [];
        let num = parseInt(node.getAttribute('start')) || 1;
        for (const child of node.children) {
          if (child.tagName.toLowerCase() === 'li') {
            const text = childrenToMarkdown(child, options, { ...context, listDepth: (context.listDepth || 0) + 1 });
            const indent = '  '.repeat(context.listDepth || 0);
            items.push(`${indent}${num}. ${text.trim()}`);
            num++;
          }
        }
        return items.length ? `\n\n${items.join('\n')}\n\n` : '';
      }

      case 'pre': {
        if (!options.includeCodeBlocks) return '';
        const codeEl = node.querySelector('code');
        const code = (codeEl || node).textContent;
        if (!code.trim()) return '';
        let lang = '';
        if (codeEl) {
          const cls = codeEl.className || '';
          const langMatch = cls.match(/(?:language|lang|highlight)-(\w+)/);
          if (langMatch) lang = langMatch[1];
        }
        // Also check parent's data attributes
        if (!lang) {
          const dataLang = node.getAttribute('data-language') || node.getAttribute('data-lang') || '';
          if (dataLang) lang = dataLang;
        }
        return `\n\n\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n\n`;
      }

      case 'code': {
        // If parent is <pre>, skip (handled by pre case)
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
          return '';
        }
        if (!options.includeCodeBlocks) return node.textContent;
        const code = node.textContent;
        if (!code.trim()) return '';
        // Use single backticks for inline code
        if (code.includes('`')) {
          return `\`\` ${code} \`\``;
        }
        return `\`${code}\``;
      }

      case 'blockquote': {
        const text = childrenToMarkdown(node, options, context);
        if (!text.trim()) return '';
        const lines = text.trim().split('\n');
        return '\n\n' + lines.map(line => `> ${line}`).join('\n') + '\n\n';
      }

      case 'table':
        return '\n\n' + tableToMarkdown(node) + '\n\n';

      case 'details': {
        const summary = node.querySelector('summary');
        let md = '';
        if (summary) {
          md += `\n\n**${getInlineText(summary, options).trim()}**\n\n`;
        }
        for (const child of node.childNodes) {
          if (child !== summary) {
            md += nodeToMarkdown(child, options, context);
          }
        }
        return md;
      }

      case 'dl': {
        let md = '\n\n';
        for (const child of node.children) {
          if (child.tagName.toLowerCase() === 'dt') {
            md += `**${getInlineText(child, options).trim()}**\n`;
          } else if (child.tagName.toLowerCase() === 'dd') {
            md += `: ${childrenToMarkdown(child, options, context).trim()}\n\n`;
          }
        }
        return md;
      }

      case 'video': case 'audio': case 'canvas': case 'svg':
      case 'input': case 'select': case 'textarea': case 'button':
      case 'form':
        return '';

      default:
        return childrenToMarkdown(node, options, context);
    }
  }

  function childrenToMarkdown(element, options, context = {}) {
    let md = '';
    for (const child of element.childNodes) {
      md += nodeToMarkdown(child, options, context);
    }
    return md;
  }

  function getInlineText(element, options) {
    // Get text content while respecting inline formatting
    let text = '';
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent.replace(/\s+/g, ' ');
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'code' && options.includeCodeBlocks) {
          text += `\`${child.textContent}\``;
        } else if (tag === 'strong' || tag === 'b') {
          text += `**${getInlineText(child, options).trim()}**`;
        } else if (tag === 'em' || tag === 'i') {
          text += `*${getInlineText(child, options).trim()}*`;
        } else if (tag === 'a' && options.includeLinks) {
          const href = child.getAttribute('href');
          const linkText = getInlineText(child, options).trim();
          if (href && linkText) {
            try {
              const url = new URL(href, window.location.href).href;
              text += `[${linkText}](${url})`;
            } catch {
              text += linkText;
            }
          } else {
            text += linkText;
          }
        } else {
          text += getInlineText(child, options);
        }
      }
    }
    return text;
  }

  function tableToMarkdown(table) {
    const rows = table.querySelectorAll('tr');
    if (rows.length === 0) return '';

    const matrix = [];
    let maxCols = 0;

    rows.forEach(row => {
      const cells = row.querySelectorAll('th, td');
      const rowData = [];
      cells.forEach(cell => {
        rowData.push(cell.textContent.trim().replace(/\|/g, '\\|').replace(/\n/g, ' '));
      });
      maxCols = Math.max(maxCols, rowData.length);
      matrix.push(rowData);
    });

    if (matrix.length === 0 || maxCols === 0) return '';

    // Pad rows to same length
    matrix.forEach(row => {
      while (row.length < maxCols) row.push('');
    });

    let md = '';
    // Header row
    md += '| ' + matrix[0].join(' | ') + ' |\n';
    md += '| ' + matrix[0].map(() => '---').join(' | ') + ' |\n';
    // Data rows
    for (let i = 1; i < matrix.length; i++) {
      md += '| ' + matrix[i].join(' | ') + ' |\n';
    }
    return md;
  }

  // ─── Markdown Cleanup ────────────────────────────────────────────

  function cleanMarkdownOutput(md) {
    // Collapse 3+ newlines into 2
    md = md.replace(/\n{3,}/g, '\n\n');
    // Remove trailing whitespace from lines
    md = md.replace(/[ \t]+$/gm, '');
    // Remove leading blank lines
    md = md.replace(/^\n+/, '');
    // Ensure single trailing newline
    md = md.trimEnd() + '\n';
    return md;
  }

  // ─── Message Handler ─────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    debugLog('Content script received:', request.action);

    if (request.action === 'collectLinks') {
      collectLinks(request.options)
        .then(links => sendResponse({ links }))
        .catch(error => sendResponse({ error: error.message }));
      return true; // async
    }

    if (request.action === 'extractContent') {
      extractContent(request.options)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ error: error.message }));
      return true; // async
    }

    if (request.action === 'ping') {
      sendResponse({ alive: true });
      return false;
    }
  });

  debugLog('Navis content script loaded');
})();
} // end guard
