# Claude Instructions for tools.ianp.io

This repo follows the "HTML Tools" pattern popularized by Simon Willison.

## The Pattern

**Single-file, no-build, no-account, personal utilities.**

### Core Tenets

| Principle | Reasoning |
|-----------|-----------|
| **Single HTML file** | Copy/paste from LLM response to working tool. Zero friction. |
| **No build step** | No React, no webpack, no npm. Just open the file. |
| **No user accounts** | localStorage for state, external services (Gists) for persistence |
| **CDN dependencies** | Load from jsdelivr/cdnjs if needed, but fewer = better |
| **GitHub Pages hosting** | Paste HTML, get permanent URL in seconds |

### The Mindset

1. **Optimize for iteration speed** - Small, readable code that LLMs can understand and modify quickly
2. **Copy/paste as primary I/O** - Input: paste text. Output: copy button. Works everywhere.
3. **Personal tools, shared publicly** - Scratch your own itch, others might find it useful
4. **Portability over polish** - A working tool beats a "proper" app that never ships
5. **Self-host over platforms** - Don't depend on someone else's sandbox

### Why It Works

- LLMs can generate complete working tools in one response
- No npm, no webpack, no "environment setup"
- Distribute by sharing a URL or pasting the file
- Debug by reading the source (it's all right there)
- Modify by asking an LLM to edit it

## When Building Tools

- Prompt "no react" - skip frameworks with build steps
- Inline CSS and JS in the HTML file
- Use `<script type="module">` for modern JS features
- Add "Copy to clipboard" buttons for outputs
- Keep it under a few hundred lines if possible
- Load libraries from CDN only when genuinely needed

## File Structure

```
tools/
├── *.html              # Individual tools (one file each)
├── auth.js             # Shared OAuth module (exception: reusable across tools)
├── auth-complete.html  # OAuth callback handler
├── CLAUDE.md           # This file
├── README.md           # Tool index
└── backlog/
    └── plans/          # Implementation plans
```

## References

- [Useful patterns for building HTML tools](https://simonwillison.net/2025/Dec/10/html-tools/) - Simon Willison's detailed writeup
- [tools.simonwillison.net](https://tools.simonwillison.net/) - Simon's collection (150+ tools)
- [simonw/tools on GitHub](https://github.com/simonw/tools) - Source repo
