# Chrome Extension Testing Guide

## Manual Testing Steps

1. **Load the extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the extension directory
   - Verify the extension icon appears in the toolbar

2. **Test URL Collection**
   - Navigate to a documentation website (e.g., https://docs.crawl4ai.com/)
   - Click the extension icon to open the popup
   - Select "Collect all links on page" and click "Scan Page"
   - Verify links are collected and displayed in the status
   - Test URL filters by entering include/exclude patterns

3. **Test Manual URL Entry**
   - Select "Specify URLs manually" option
   - Enter several URLs (one per line)
   - Click "Scan Page" and verify they are collected

4. **Test Content Extraction**
   - After collecting URLs, click "Extract Content"
   - Verify the progress bar and status updates
   - Wait for all pages to be processed

5. **Test ZIP Download**
   - After extraction, click "Download ZIP"
   - Verify the ZIP file is downloaded
   - Extract the ZIP and check that markdown files are properly formatted
   - Verify index file is created if option is selected

6. **Test Options**
   - Try different combinations of content options (headings, images, links, code blocks)
   - Try different output options (filename, index, frontmatter, table of contents)
   - Verify options affect the generated markdown files

## Known Limitations

- The extension requires permission to access all websites to extract content
- Large websites with many pages may take significant time to process
- Some websites may block automated access or have complex JavaScript rendering
- Image references in markdown may not work if images are not publicly accessible
