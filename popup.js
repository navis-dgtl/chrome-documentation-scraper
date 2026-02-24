// popup.js - UI controller for the Knowledge Builder extension

document.addEventListener('DOMContentLoaded', () => {
  // ─── DOM References ────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    // Tabs
    tabs: $$('.tab'),
    panels: $$('.panel'),
    // Mode toggle
    modeBtns: $$('.mode-btn'),
    modeContents: $$('.mode-content'),
    // Collect
    includePattern: $('#include-pattern'),
    excludePattern: $('#exclude-pattern'),
    scanPageBtn: $('#scan-page'),
    manualUrls: $('#manual-urls'),
    addManualBtn: $('#add-manual-urls'),
    urlListSection: $('#url-list-section'),
    urlList: $('#url-list'),
    urlCount: $('#url-count'),
    clearUrlsBtn: $('#clear-urls'),
    // Options
    includeHeadings: $('#include-headings'),
    includeImages: $('#include-images'),
    includeLinks: $('#include-links'),
    includeCodeBlocks: $('#include-code-blocks'),
    removeSelectors: $('#remove-selectors'),
    tabLoadTimeout: $('#tab-load-timeout'),
    createIndex: $('#create-index'),
    addFrontmatter: $('#add-frontmatter'),
    addToc: $('#add-table-of-contents'),
    // Export
    outputFilename: $('#output-filename'),
    extractBtn: $('#extract-content'),
    downloadBtn: $('#download-zip'),
    extractionControls: $('#extraction-controls'),
    pauseBtn: $('#pause-btn'),
    resumeBtn: $('#resume-btn'),
    stopBtn: $('#stop-btn'),
    // Status
    statusBar: $('#status-bar'),
    progressFill: $('#progress-fill'),
    statusText: $('#status-text'),
    // Theme
    themeToggle: $('#theme-toggle'),
  };

  // ─── State ─────────────────────────────────────────────────────
  let collectedUrls = [];
  let processedPages = [];
  let extractionActive = false;
  let extractionPaused = false;
  let currentUrlIndex = 0;

  // ─── Tab Navigation ────────────────────────────────────────────
  els.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      els.tabs.forEach(t => t.classList.toggle('tab--active', t === tab));
      els.panels.forEach(p => p.classList.toggle('panel--active', p.id === `panel-${target}`));
    });
  });

  // ─── Mode Toggle (Scan / Manual) ──────────────────────────────
  els.modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      els.modeBtns.forEach(b => b.classList.toggle('mode-btn--active', b === btn));
      els.modeContents.forEach(c => c.classList.toggle('mode-content--active', c.id === `mode-${mode}`));
    });
  });

  // ─── Theme Toggle ─────────────────────────────────────────────
  initTheme();
  els.themeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    chrome.storage.local.set({ theme: isLight ? 'light' : 'dark' });
  });

  function initTheme() {
    chrome.storage.local.get('theme', (data) => {
      if (data.theme === 'light') {
        document.body.classList.add('light-theme');
      } else if (data.theme === undefined) {
        // Default to dark
        chrome.storage.local.set({ theme: 'dark' });
      }
    });
  }

  // ─── Initialize from Background State ─────────────────────────
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (!response) return;
    collectedUrls = response.urls || [];
    processedPages = response.pages || [];

    if (response.extractionState) {
      extractionActive = response.extractionState.active;
      extractionPaused = response.extractionState.paused;
      currentUrlIndex = response.extractionState.currentIndex;

      if (extractionActive) {
        showExtractionUI();
        const progress = collectedUrls.length
          ? Math.round((currentUrlIndex / collectedUrls.length) * 100)
          : 0;
        setProgress(progress);

        if (extractionPaused) {
          els.pauseBtn.classList.add('hidden');
          els.resumeBtn.classList.remove('hidden');
          setStatus(`Paused at ${currentUrlIndex}/${collectedUrls.length}`);

          if (currentUrlIndex < collectedUrls.length) {
            if (confirm(`Resume extraction from page ${currentUrlIndex + 1} of ${collectedUrls.length}?`)) {
              chrome.runtime.sendMessage({ action: 'resumeExtraction' });
            } else {
              chrome.runtime.sendMessage({ action: 'resetState' }, () => {
                collectedUrls = [];
                processedPages = [];
                extractionActive = false;
                extractionPaused = false;
                renderUrlList();
                hideExtractionUI();
              });
            }
          }
        }
      }
    }

    if (collectedUrls.length > 0) {
      els.extractBtn.disabled = false;
      renderUrlList();
      setStatus(`${collectedUrls.length} URLs ready`);
    }

    if (processedPages.length > 0) {
      els.downloadBtn.disabled = false;
      setStatus(`${processedPages.length} pages ready for download`);
    }
  });

  // Load saved settings
  chrome.runtime.sendMessage({ action: 'getTimeout' }, (res) => {
    if (res && res.timeout) els.tabLoadTimeout.value = res.timeout;
  });
  chrome.storage.local.get('removeSelectors', (res) => {
    if (res.removeSelectors) els.removeSelectors.value = res.removeSelectors;
  });

  // ─── Listen for Background State Updates ──────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action !== 'stateUpdate') return;
    const { collectedData, extractionState } = message.data;

    collectedUrls = collectedData.urls || [];
    processedPages = collectedData.pages || [];
    extractionActive = extractionState.active;
    extractionPaused = extractionState.paused;
    currentUrlIndex = extractionState.currentIndex;

    renderUrlList();

    if (extractionActive) {
      showExtractionUI();
      els.pauseBtn.classList.toggle('hidden', extractionPaused);
      els.resumeBtn.classList.toggle('hidden', !extractionPaused);

      const progress = extractionState.totalUrls
        ? Math.round((currentUrlIndex / extractionState.totalUrls) * 100)
        : 0;
      setProgress(progress);
      setStatus(`Processing ${currentUrlIndex}/${extractionState.totalUrls} (${progress}%)`);
    } else if (collectedData.status === 'completed' || collectedData.status === 'stopped') {
      hideExtractionUI();
      if (processedPages.length > 0) {
        els.downloadBtn.disabled = false;
        // Switch to export tab
        switchTab('export');

        const errCount = (extractionState.errors || []).length;
        let msg = `${processedPages.length} pages extracted`;
        if (errCount > 0) msg += ` (${errCount} errors)`;
        setStatus(msg);
        setProgress(100);
      }
    }
  });

  // ─── Scan Page ────────────────────────────────────────────────
  els.scanPageBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;

      setStatus('Scanning page for links...');
      setProgress(10);
      els.scanPageBtn.classList.add('btn--loading');

      const options = {
        includePattern: els.includePattern.value.trim(),
        excludePattern: els.excludePattern.value.trim(),
      };

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['js/content.js'],
      }).then(() => {
        chrome.tabs.sendMessage(tab.id, { action: 'collectLinks', options }, (response) => {
          els.scanPageBtn.classList.remove('btn--loading');

          if (chrome.runtime.lastError) {
            setStatus('Error: ' + chrome.runtime.lastError.message);
            return;
          }
          if (response && response.error) {
            setStatus('Error: ' + response.error);
            return;
          }
          if (response && response.links) {
            collectedUrls = response.links;
            chrome.runtime.sendMessage({ action: 'setUrls', urls: collectedUrls });
            setProgress(100);
            setStatus(`Found ${collectedUrls.length} links`);
            els.extractBtn.disabled = false;
            renderUrlList();
          } else {
            setStatus('No links found on this page');
          }
        });
      }).catch(err => {
        els.scanPageBtn.classList.remove('btn--loading');
        setStatus('Error: ' + err.message);
      });
    });
  });

  // ─── Add Manual URLs ──────────────────────────────────────────
  els.addManualBtn.addEventListener('click', () => {
    const urls = els.manualUrls.value.trim().split('\n')
      .map(u => u.trim())
      .filter(u => u && (u.startsWith('http://') || u.startsWith('https://')));

    if (urls.length === 0) {
      setStatus('Enter valid URLs (must start with http:// or https://)');
      return;
    }

    const newLinks = urls.map(url => ({ url, text: url }));

    // Merge with existing, dedup
    const existing = new Set(collectedUrls.map(u => u.url));
    newLinks.forEach(link => {
      if (!existing.has(link.url)) {
        collectedUrls.push(link);
        existing.add(link.url);
      }
    });

    chrome.runtime.sendMessage({ action: 'setUrls', urls: collectedUrls });
    setStatus(`${collectedUrls.length} URLs total`);
    els.extractBtn.disabled = false;
    renderUrlList();
    els.manualUrls.value = '';
  });

  // ─── Clear URLs ───────────────────────────────────────────────
  els.clearUrlsBtn.addEventListener('click', () => {
    collectedUrls = [];
    chrome.runtime.sendMessage({ action: 'setUrls', urls: [] });
    renderUrlList();
    els.extractBtn.disabled = true;
    setStatus('URLs cleared');
  });

  // ─── Extract Content ──────────────────────────────────────────
  els.extractBtn.addEventListener('click', () => {
    if (collectedUrls.length === 0) return;

    const options = {
      includeHeadings: els.includeHeadings.checked,
      includeImages: els.includeImages.checked,
      includeLinks: els.includeLinks.checked,
      includeCodeBlocks: els.includeCodeBlocks.checked,
      selectorsToRemove: els.removeSelectors.value.split(',').map(s => s.trim()).filter(Boolean),
    };

    chrome.storage.local.set({ removeSelectors: els.removeSelectors.value.trim() });

    // Switch to export tab to show progress
    switchTab('export');
    showExtractionUI();
    setStatus(`Starting extraction of ${collectedUrls.length} pages...`);
    setProgress(0);

    chrome.runtime.sendMessage({ action: 'startExtraction', options }, (response) => {
      if (!response || !response.success) {
        setStatus(`Error: ${response?.message || 'Unknown error'}`);
        hideExtractionUI();
      }
    });
  });

  // ─── Extraction Controls ──────────────────────────────────────
  els.pauseBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'pauseExtraction' }, (res) => {
      if (res && res.success) {
        els.pauseBtn.classList.add('hidden');
        els.resumeBtn.classList.remove('hidden');
        setStatus('Paused');
      }
    });
  });

  els.resumeBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'resumeExtraction' }, (res) => {
      if (res && res.success) {
        els.pauseBtn.classList.remove('hidden');
        els.resumeBtn.classList.add('hidden');
        setStatus('Resuming...');
      }
    });
  });

  els.stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopExtraction' }, (res) => {
      if (res && res.success) {
        hideExtractionUI();
        setStatus('Extraction stopped');
        if (processedPages.length > 0) {
          els.downloadBtn.disabled = false;
        }
      }
    });
  });

  // ─── Download ZIP ─────────────────────────────────────────────
  els.downloadBtn.addEventListener('click', () => {
    if (processedPages.length === 0) {
      setStatus('No pages to download');
      return;
    }

    setStatus('Creating ZIP...');
    setProgress(50);
    els.downloadBtn.classList.add('btn--loading');

    const filename = els.outputFilename.value.trim() || 'knowledge-base';
    const options = {
      createIndex: els.createIndex.checked,
      addFrontmatter: els.addFrontmatter.checked,
      addTableOfContents: els.addToc.checked,
      formatCodeBlocks: true,
      fixRelativeLinks: true,
      enhanceMarkdown: true,
    };

    createMarkdownZip(processedPages, options)
      .then(blob => {
        downloadBlob(blob, `${filename}.zip`);
        setProgress(100);
        setStatus(`Downloaded ${processedPages.length} pages`);
        els.downloadBtn.classList.remove('btn--loading');

        chrome.runtime.sendMessage({ action: 'clearPages' });
        processedPages = [];
        els.downloadBtn.disabled = true;
        renderUrlList();
      })
      .catch(err => {
        console.error('ZIP error:', err);
        setStatus('Error creating ZIP');
        els.downloadBtn.classList.remove('btn--loading');
      });
  });

  // ─── Timeout Change ───────────────────────────────────────────
  els.tabLoadTimeout.addEventListener('change', () => {
    const val = parseInt(els.tabLoadTimeout.value, 10);
    if (!isNaN(val) && val >= 3000) {
      chrome.runtime.sendMessage({ action: 'setTimeout', timeout: val });
    }
  });

  // ─── URL List Rendering ───────────────────────────────────────
  function renderUrlList() {
    if (collectedUrls.length === 0) {
      els.urlListSection.classList.add('hidden');
      return;
    }

    els.urlListSection.classList.remove('hidden');
    els.urlCount.textContent = collectedUrls.length;
    els.urlList.innerHTML = '';

    collectedUrls.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'url-item';

      const text = document.createElement('span');
      text.className = 'url-item__text';
      text.textContent = item.text || item.url;
      text.title = item.url;

      const actions = document.createElement('div');
      actions.className = 'url-item__actions';

      // Preview button if already extracted
      const pageIdx = processedPages.findIndex(p => p.url === item.url);
      if (pageIdx !== -1) {
        const previewBtn = document.createElement('button');
        previewBtn.className = 'url-item__btn url-item__btn--preview';
        previewBtn.textContent = 'preview';
        previewBtn.addEventListener('click', () => {
          chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?id=${pageIdx}`) });
        });
        actions.appendChild(previewBtn);
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'url-item__btn url-item__btn--remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', () => {
        collectedUrls.splice(index, 1);
        chrome.runtime.sendMessage({ action: 'setUrls', urls: collectedUrls });
        renderUrlList();
        els.extractBtn.disabled = collectedUrls.length === 0;
      });
      actions.appendChild(removeBtn);

      row.appendChild(text);
      row.appendChild(actions);
      els.urlList.appendChild(row);
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function setStatus(msg) {
    els.statusBar.classList.remove('hidden');
    els.statusText.textContent = msg;
  }

  function setProgress(pct) {
    els.progressFill.style.width = `${pct}%`;
  }

  function showExtractionUI() {
    extractionActive = true;
    els.extractionControls.classList.remove('hidden');
    els.pauseBtn.classList.remove('hidden');
    els.resumeBtn.classList.add('hidden');
    els.extractBtn.disabled = true;
    document.body.classList.add('extracting');
  }

  function hideExtractionUI() {
    extractionActive = false;
    els.extractionControls.classList.add('hidden');
    els.extractBtn.disabled = collectedUrls.length === 0;
    document.body.classList.remove('extracting');
  }

  function switchTab(tabName) {
    els.tabs.forEach(t => t.classList.toggle('tab--active', t.dataset.tab === tabName));
    els.panels.forEach(p => p.classList.toggle('panel--active', p.id === `panel-${tabName}`));
  }
});
