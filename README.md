# AI Knowledge Base Extractor

A Chrome Extension that makes it easy to extract and save web content as markdown files for AI knowledge bases.

## Features

- Extract content from web pages and convert to markdown format
- Collect URLs automatically from the current page or specify them manually
- Filter URLs using include/exclude patterns
- Customize content extraction options (headings, images, links, code blocks)
- Create a ZIP file with all extracted content
- Generate an index file for easy navigation
- Add YAML frontmatter with metadata
- Add table of contents to markdown files

## Installation

1. Download the extension ZIP file
2. Extract the ZIP file to a local directory
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the extracted directory
6. The extension icon should appear in your Chrome toolbar

## Usage

### Basic Usage

1. Navigate to a documentation website (e.g., https://docs.crawl4ai.com/)
2. Click the extension icon to open the popup
3. Click "Scan Page" to collect all links from the current page
4. Click "Extract Content" to process all collected URLs
5. Click "Download ZIP" to download all extracted content as markdown files

### Advanced Options

- **URL Collection**: Choose between collecting all links on the current page or specifying URLs manually
- **URL Filters**: Include or exclude URLs based on patterns (e.g., include "/docs/", exclude "/blog/")
- **Content Options**: Choose what elements to include in the markdown (headings, images, links, code blocks)
- **Output Options**: Customize the output filename, create an index file, add frontmatter, add table of contents

## Development

### Project Structure

- `manifest.json`: Extension configuration
- `popup.html`: Main extension popup interface
- `css/popup.css`: Styles for the popup
- `js/popup.js`: Main popup functionality
- `js/content.js`: Content script for extracting page content
- `js/background.js`: Background script for managing state
- `js/markdown-utils.js`: Utilities for markdown processing
- `js/jszip-integration.js`: Integration with JSZip for file compression
- `js/lib/jszip.min.js`: JSZip library for creating ZIP files
- `images/`: Extension icons

### Building from Source

1. Clone the repository
2. Install dependencies: `npm install`
3. Generate icons: `node generate-icons.js`
4. Load the extension in Chrome as described in the Installation section

## License

MIT License
