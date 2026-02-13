# x2gist — CLI Tool PRD

## Problem

X/Twitter posts are ephemeral and hard to reference, archive, or share outside the platform. Public APIs (oEmbed, syndication) are limited — they can't access articles, threads behind auth walls, or rich content. But a logged-in browser session already has everything. We use **Playwright** to connect to an existing Edge session, capture the rendered page, and extract the content.

## Solution

A PowerShell CLI that takes an X post URL, connects to a running Edge browser via `playwright-cli` and its browser extension, captures an accessibility tree snapshot of the page, parses it into markdown, and uploads it as a GitHub Gist.

```powershell
.\x2gist.ps1 https://x.com/arscontexta/status/2013045749580259680
# => https://gist.github.com/abc123
```

## How It Works

### Step 1: Connect to Edge via Playwright Extension

The script uses `playwright-cli` configured with `--browser=msedge --extension` to connect to an already-running Edge browser session. A `PLAYWRIGHT_MCP_EXTENSION_TOKEN` (from `.env` or environment) bypasses the manual connection approval dialog.

This gives access to the browser's existing login cookies — no X/Twitter API auth needed.

### Step 2: Navigate and Snapshot

`playwright-cli open <url>` navigates the browser to the tweet. After a 5-second wait for JS rendering, `playwright-cli snapshot` captures the page's **accessibility tree** — a structured YAML representation of the DOM.

### Step 3: Parse the Accessibility Snapshot → Markdown

The snapshot contains structured elements like:
- `generic [ref=eN]: <text>` — paragraph text
- `heading "<title>" [level=2]` — section headings
- `code [ref=eN]: <code>` — code blocks
- `link "@handle"` — author handle
- `time [ref=eN]: <date>` — post timestamp
- `group "N replies, N reposts, N likes"` — engagement stats (used as content boundary marker)

The parser:
1. Finds the first engagement group to mark content start
2. Extracts text, headings, and code blocks
3. Filters noise (UI chrome like "Log in", "Don't miss", numeric counts)
4. Stops at the bottom engagement section or "Read N replies" button

### Step 4: Format as Markdown

```markdown
# @handle — Post

> Tweet body text goes here, preserving line breaks
> and any inline content.

**Original:** [View on X](https://x.com/handle/status/12345)
**Posted:** 7:28 PM · Jan 18, 2026
**Archived:** 2025-02-13T12:00:00Z
```

### Step 5: Create Gist via GitHub CLI

Uses `gh gist create` to upload the markdown. The user needs `gh` installed and authenticated.

```powershell
gh gist create --public --desc "X post by @handle" post.md
```

### Step 6: Cleanup

Always runs (via `finally` block): stops the Playwright session and removes the `.playwright-cli/` snapshot directory.

## CLI Interface

```
x2gist <url> [options]

Arguments:
  url                  X/Twitter post URL

Options:
  -Private             Create a private gist (default: public)
  -Stdout              Print output to stdout instead of creating gist
  -Copy                Copy gist URL to clipboard after creation
  -Help, -h            Show help
```

## Examples

```powershell
# Basic usage — creates public gist, prints URL
.\x2gist.ps1 https://x.com/arscontexta/status/2013045749580259680

# Private gist, copy URL to clipboard
.\x2gist.ps1 https://x.com/user/status/12345 -Private -Copy

# Just preview the markdown, don't create gist
.\x2gist.ps1 https://x.com/user/status/12345 -Stdout
```

## Dependencies

- **playwright-cli** — `npm i -g @anthropic-ai/playwright-cli`
- **Microsoft Edge** — running with the Playwright MCP browser extension installed
- **PLAYWRIGHT_MCP_EXTENSION_TOKEN** — set in environment or `.env` file (bypasses connection approval)
- **gh** (GitHub CLI) — for gist creation, must be installed and authenticated

## Architecture

```
┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌─────────┐
│ x2gist   │────>│playwright │────>│ Edge Browser │────>│ X.com   │
│ (ps1)    │     │   -cli    │     │ (logged in)  │     │         │
└──────────┘     └───────────┘     └──────────────┘     └─────────┘
     │                │
     │  1. Load token from .env
     │  2. Config: msedge + extension
     │  3. Open tweet URL
     │  4. Wait 5s for render
     │  5. Capture accessibility snapshot
     │  6. Parse YAML → markdown
     │  7. Create gist via gh CLI
     │  8. Cleanup snapshot artifacts
```

## Limitations

- Requires Edge running with the Playwright extension — not headless
- 5-second wait is a rough heuristic; slow pages may not fully render
- Snapshot parsing relies on X's current accessibility tree structure — may break if X changes their markup
- Only captures single posts (no thread unrolling)
- Images and media are not archived, only text content

## Future Enhancements

- Thread unrolling (navigate reply chain)
- Image/media download and inclusion
- Batch mode: read URLs from stdin
- Configurable render wait time
- Local archive mode (save to directory instead of gist)