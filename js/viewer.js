// viewer.js - display markdown content from background storage

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const index = parseInt(params.get('id'), 10);
  if (isNaN(index)) {
    document.getElementById('content').textContent = 'Invalid preview index';
    return;
  }

  chrome.runtime.sendMessage({ action: 'getPage', index }, (response) => {
    if (response && response.page) {
      const html = marked.parse(response.page.markdown || '');
      document.getElementById('content').innerHTML = html;
    } else {
      document.getElementById('content').textContent = 'Page not found';
    }
  });
});
