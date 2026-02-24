// utils.js - Shared utility functions

/**
 * Sanitize a string for use as a filename.
 * Removes invalid characters and limits length.
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 120);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sanitizeFilename };
}
