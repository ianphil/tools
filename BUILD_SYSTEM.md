# Tools Index Page Build System

This document explains how to replicate the simonw/tools index page generation system for your own tools repository.

## Overview

The build system generates a static website from a collection of HTML tool files. It:
1. Extracts metadata from git commit history
2. Converts a `README.md` to an `index.html` with injected "recently added/updated" sections
3. Generates supporting pages (colophon, by-month archive)
4. Injects a common footer into all tool pages

## Architecture

```
Build Pipeline Flow:
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│ gather_links.py │────▶│ gathered_links.json │────▶│ build_*.py     │
│                 │     │ tools.json         │     │                │
└─────────────────┘     └──────────────────┘     └────────────────┘
        │                                                │
        ▼                                                ▼
   Git history                                   index.html
   HTML files                                    colophon.html
   .docs.md files                                by-month.html
                                                 dates.json
```

## Required Files

### 1. `gather_links.py` - Metadata Extraction

This is the foundation of the build system. It:
- Scans all `*.html` files in the repository
- Extracts git commit history for each file (hash, date, message)
- Extracts URLs from commit messages (useful for linking to LLM transcripts)
- Extracts `<title>` from HTML files
- Extracts descriptions from corresponding `.docs.md` files
- Outputs two JSON files:
  - `gathered_links.json`: Full commit history and URLs per page
  - `tools.json`: Tool metadata (slug, title, description, created/updated dates, URL)

**Key functions:**
- `get_file_commit_details(file_path)`: Uses `git log` to get commit history
- `extract_description(docs_path)`: Reads first paragraph from `.docs.md` file
- `extract_title(html_path)`: Extracts `<title>` tag content

### 2. `build_index.py` - Main Index Page

Converts `README.md` to `index.html` and injects dynamic content:
- Parses README.md using Python `markdown` library
- Loads `tools.json` to find recently added/updated tools
- Injects a "Recently added" / "Recently updated" section between HTML comment markers
- Wraps content in a styled HTML template

**README.md marker format:**
```markdown
<!-- recently starts -->
<!-- recently stops -->
```

The script replaces content between these markers with the recent tools section.

### 3. `build_dates.py` - Date Index

Creates `dates.json` mapping each HTML file to its most recent commit date:
```json
{
  "tool-name.html": "2024-12-01",
  "another-tool.html": "2024-11-15"
}
```

Used by `footer.js` to display "Updated YYYY-MM-DD" on each tool page.

### 4. `build_colophon.py` - Development History Page

Generates `colophon.html` showing:
- All tools sorted by most recent commit
- Full commit history per tool (in collapsible `<details>`)
- Links to LLM transcripts (extracted from commit messages)
- Descriptions from `.docs.md` files

### 5. `build_by_month.py` - Archive Page

Generates `by-month.html` grouping tools by creation month:
- Tools sorted chronologically within each month
- Links to tool and its colophon entry
- Shows tool description summary

### 6. `build.sh` - Master Build Script

```bash
#!/bin/bash
set -e

# Ensure full git history (for CI environments)
if [ -f .git/shallow ]; then
    git fetch --unshallow
fi

echo "=== Building tools site ==="

# Step 1: Gather metadata
python gather_links.py

# Step 2: Build supporting pages
python build_colophon.py
python build_dates.py

# Step 3: Build index
python build_index.py

# Step 4: Build archive
python build_by_month.py

# Step 5: Inject footer into HTML files
FOOTER_HASH=$(git log -1 --format="%H" -- footer.js)
FOOTER_SHORT_HASH=$(echo "$FOOTER_HASH" | cut -c1-8)

for file in *.html; do
  if [ -f "$file" ] && [ "$file" != "index.html" ]; then
    if ! grep -q 'src="footer.js' "$file"; then
      # Inject footer.js before closing </body>
      sed -i "s|</body>|<script src=\"footer.js?${FOOTER_SHORT_HASH}\"></script>\n</body>|" "$file"
    fi
  fi
done

echo "=== Build complete! ==="
```

### 7. `footer.js` - Common Footer

Injected into each tool page to provide:
- Navigation links (Home, About, Source, Changes)
- Auto-detection of page background color for contrast
- Fetches `dates.json` to show last updated date

### 8. `homepage-search.js` - Search Functionality

Adds a search box to the index page:
- Loads `tools.json` for tool metadata
- Fuzzy search across title, description, slug
- Keyboard navigation (arrow keys, Enter, /)
- Prioritizes recently visited tools (via localStorage analytics)

Include in README.md:
```markdown
<script type="module" src="homepage-search.js" data-tool-search></script>
```

## File Structure

```
tools/
├── build.sh                 # Master build script
├── gather_links.py          # Metadata extraction
├── build_index.py           # Index page generator
├── build_dates.py           # Date index generator
├── build_colophon.py        # Colophon page generator
├── build_by_month.py        # Archive page generator
├── footer.js                # Common footer script
├── homepage-search.js       # Search functionality
├── README.md                # Source for index.html
├── _config.yml              # GitHub Pages config
│
├── tool-name.html           # Individual tool files
├── tool-name.docs.md        # Tool description (optional)
│
├── gathered_links.json      # Generated: full commit data
├── tools.json               # Generated: tool metadata
├── dates.json               # Generated: update dates
├── index.html               # Generated: main page
├── colophon.html            # Generated: dev history
└── by-month.html            # Generated: archive
```

## Minimal Implementation

For a simpler setup, you only need:

1. **`gather_links.py`** - Extract metadata
2. **`build_index.py`** - Generate index
3. **`README.md`** - With marker comments

### Simplified `build_index.py`:

```python
#!/usr/bin/env python3
import json
import markdown
from pathlib import Path

README_PATH = Path("README.md")
TOOLS_JSON_PATH = Path("tools.json")
OUTPUT_PATH = Path("index.html")

def build_index():
    # Convert README to HTML
    md_content = README_PATH.read_text("utf-8")
    body_html = markdown.Markdown(extensions=["extra"]).convert(md_content)

    # Load tools and find recent ones
    if TOOLS_JSON_PATH.exists():
        tools = json.loads(TOOLS_JSON_PATH.read_text("utf-8"))
        recent = sorted(tools, key=lambda t: t.get("created", ""), reverse=True)[:5]

        # Build recent section HTML
        recent_html = "<h2>Recently Added</h2><ul>"
        for tool in recent:
            recent_html += f'<li><a href="{tool["url"]}">{tool["slug"]}</a></li>'
        recent_html += "</ul>"

        # Inject between markers
        if "<!-- recently starts -->" in body_html:
            start = body_html.find("<!-- recently starts -->")
            end = body_html.find("<!-- recently stops -->")
            body_html = (
                body_html[:start + len("<!-- recently starts -->")] +
                recent_html +
                body_html[end:]
            )

    # Write HTML
    html = f"""<!DOCTYPE html>
<html><head><title>My Tools</title></head>
<body>{body_html}</body></html>"""

    OUTPUT_PATH.write_text(html, "utf-8")

if __name__ == "__main__":
    build_index()
```

## Dependencies

```bash
pip install markdown
```

## GitHub Actions Deployment

Create `.github/workflows/build.yml`:

```yaml
name: Build and Deploy

on:
  push:
    branches: [master]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for git dates

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - run: pip install markdown

      - run: ./build.sh

      - uses: actions/upload-pages-artifact@v3
        with:
          path: .

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

## Key Concepts

### Git-Based Metadata
The system relies heavily on git commit history:
- **Created date**: Oldest commit touching the file
- **Updated date**: Most recent commit
- **Transcripts**: URLs in commit messages link to LLM conversations

### Documentation Files (`.docs.md`)
Optional markdown files providing tool descriptions:
- Named `{tool-slug}.docs.md`
- First paragraph used as description in search/listings
- Full content shown on colophon page

### Comment Markers
README.md uses HTML comments to mark injection points:
```markdown
<!-- recently starts -->
<!-- recently stops -->
```

This allows the static README to work on GitHub while the built index.html has dynamic content.

## Customization Points

1. **Styling**: Edit CSS in `build_index.py` and `build_colophon.py`
2. **Recent count**: Change `limit=5` in `build_index.py`
3. **Search behavior**: Modify `homepage-search.js` ranking algorithm
4. **Footer links**: Edit `footer.js` template
5. **GitHub URLs**: Update repository paths in build scripts

## Quick Start for Your Repo

1. Copy the build scripts to your repo
2. Create a `README.md` with the marker comments
3. Add your HTML tools
4. Run `./build.sh`
5. Push to GitHub with the Actions workflow

The system will automatically generate your index page with recently added tools, a searchable interface, and development history tracking.
