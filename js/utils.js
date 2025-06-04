// utils.js - Generic utility functions

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

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sanitizeFilename };
}
