# x2gist

Archive X/Twitter posts to GitHub Gists via the command line.

Connects to a logged-in Edge browser session via `playwright-cli` and its browser extension, captures an accessibility snapshot of the tweet page, parses it into markdown, and creates a GitHub Gist.

## Prerequisites

- [playwright-cli](https://www.npmjs.com/package/@anthropic-ai/playwright-cli) (`npm i -g @anthropic-ai/playwright-cli`)
- Microsoft Edge running with the [Playwright MCP browser extension](https://chromewebstore.google.com/detail/playwright-mcp/hbigcejhpbipddmkkbfnbecmgmkgeheb)
- `PLAYWRIGHT_MCP_EXTENSION_TOKEN` set in environment or `.env` file
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- PowerShell 7+

## Usage

```powershell
.\x2gist.ps1 <url> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `url` | X/Twitter post URL |

### Options

| Option | Description |
|--------|-------------|
| `-Private` | Create a private gist (default: public) |
| `-Stdout` | Print output to stdout instead of creating a gist |
| `-Copy` | Copy gist URL to clipboard after creation |
| `-Help` | Show help |

## Examples

```powershell
# Basic — creates public gist, prints URL
.\x2gist.ps1 https://x.com/user/status/12345

# Private gist, copy URL to clipboard
.\x2gist.ps1 https://x.com/user/status/12345 -Private -Copy

# Preview markdown without creating a gist
.\x2gist.ps1 https://x.com/user/status/12345 -Stdout
```

## Output Format

The default markdown output:

```markdown
# @handle — Post

> Tweet body text here

**Original:** [View on X](https://x.com/handle/status/12345)
**Posted:** 7:28 PM · Jan 18, 2026
**Archived:** 2026-02-13T12:00:00Z
```

## How It Works

1. Loads `PLAYWRIGHT_MCP_EXTENSION_TOKEN` from `.env` (if not already set)
2. Configures `playwright-cli` to connect to Edge via the browser extension
3. Navigates to the tweet URL and waits for rendering
4. Captures the page's accessibility tree as a YAML snapshot
5. Parses the snapshot to extract text, headings, code blocks, and metadata
6. Formats as markdown and creates a gist via `gh`

## Limitations

- Requires Edge running with the Playwright extension — not headless
- Only captures text content — images and media are not archived
- Only the single linked post is returned (no thread unrolling)
- Snapshot parsing depends on X's current accessibility tree structure

## Tests

```powershell
Install-Module Pester -Force -SkipPublisherCheck -MinimumVersion 5.0
Invoke-Pester .\x2gist.Tests.ps1
```
