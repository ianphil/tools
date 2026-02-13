# AI Notes — Log

## 2026-02-13
- x2gist: Playwright-cli accessibility snapshots are YAML-like trees where `generic [ref=eN]: text` lines contain content, `heading "title" [level=2]` are section headings, and `group "N replies..."` marks engagement boundaries
- x2gist: The PLAYWRIGHT_MCP_EXTENSION_TOKEN env var bypasses the manual connection approval dialog when connecting playwright-cli to an existing Edge browser session via the extension
- x2gist: oEmbed and syndication APIs were evaluated as extraction methods but proved too limited — Playwright browser automation with a logged-in session is the approach that works for full content including articles
- x2gist: The dot-source guard pattern (`$MyInvocation.InvocationName -ne '.'`) lets Pester tests import functions without running main logic
