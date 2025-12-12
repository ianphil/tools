#!/usr/bin/env python3
"""
Build index.html from README.md with injected recent tools section.
"""
import json
from pathlib import Path

import markdown

README_PATH = Path("README.md")
TOOLS_JSON_PATH = Path("tools.json")
OUTPUT_PATH = Path("index.html")
RECENT_LIMIT = 5

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        :root {{
            --bg: #ffffff;
            --fg: #1a1a1a;
            --link: #0066cc;
            --link-visited: #551a8b;
            --border: #e0e0e0;
            --code-bg: #f5f5f5;
        }}
        @media (prefers-color-scheme: dark) {{
            :root {{
                --bg: #1a1a1a;
                --fg: #e0e0e0;
                --link: #6db3f2;
                --link-visited: #b794f4;
                --border: #333;
                --code-bg: #2d2d2d;
            }}
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            background: var(--bg);
            color: var(--fg);
        }}
        a {{ color: var(--link); }}
        a:visited {{ color: var(--link-visited); }}
        h1, h2, h3 {{ margin-top: 1.5em; }}
        code {{
            background: var(--code-bg);
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-size: 0.9em;
        }}
        pre {{
            background: var(--code-bg);
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
        }}
        pre code {{
            background: none;
            padding: 0;
        }}
        ul {{ padding-left: 1.5em; }}
        .recent-section {{
            background: var(--code-bg);
            padding: 1em 1.5em;
            border-radius: 8px;
            margin: 1.5em 0;
        }}
        .recent-section h2 {{
            margin-top: 0;
        }}
        .recent-section ul {{
            margin-bottom: 0;
        }}
        .recent-date {{
            color: #666;
            font-size: 0.85em;
        }}
    </style>
</head>
<body>
{body}
<script type="module" src="homepage-search.js" data-tool-search></script>
</body>
</html>
"""


def format_date(iso_date: str) -> str:
    """Format ISO date to YYYY-MM-DD."""
    if not iso_date:
        return ""
    return iso_date[:10]


def build_recent_section(tools: list[dict]) -> str:
    """Build HTML for recently added/updated tools."""
    if not tools:
        return ""

    # Recently added (by created date)
    by_created = sorted(tools, key=lambda t: t.get("created", ""), reverse=True)[:RECENT_LIMIT]

    # Recently updated (by updated date, excluding those just created)
    by_updated = sorted(tools, key=lambda t: t.get("updated", ""), reverse=True)
    recently_updated = []
    recently_added_slugs = {t["slug"] for t in by_created}
    for tool in by_updated:
        if tool["slug"] not in recently_added_slugs:
            recently_updated.append(tool)
            if len(recently_updated) >= RECENT_LIMIT:
                break

    html = '<div class="recent-section">\n'

    # Recently added
    html += "<h2>Recently Added</h2>\n<ul>\n"
    for tool in by_created:
        date = format_date(tool.get("created", ""))
        html += f'<li><a href="{tool["url"]}">{tool["title"]}</a>'
        if date:
            html += f' <span class="recent-date">({date})</span>'
        html += "</li>\n"
    html += "</ul>\n"

    # Recently updated (if any)
    if recently_updated:
        html += "<h2>Recently Updated</h2>\n<ul>\n"
        for tool in recently_updated:
            date = format_date(tool.get("updated", ""))
            html += f'<li><a href="{tool["url"]}">{tool["title"]}</a>'
            if date:
                html += f' <span class="recent-date">({date})</span>'
            html += "</li>\n"
        html += "</ul>\n"

    html += "</div>"
    return html


def build_index():
    """Main function to build index.html."""
    if not README_PATH.exists():
        print("README.md not found")
        return

    # Read and convert README
    md_content = README_PATH.read_text("utf-8")

    # Extract title from first H1
    title = "Tools"
    for line in md_content.split("\n"):
        if line.startswith("# "):
            title = line[2:].strip()
            break

    # Convert markdown to HTML
    md = markdown.Markdown(extensions=["extra", "toc"])
    body_html = md.convert(md_content)

    # Load tools and build recent section
    recent_html = ""
    if TOOLS_JSON_PATH.exists():
        tools = json.loads(TOOLS_JSON_PATH.read_text("utf-8"))
        recent_html = build_recent_section(tools)

    # Inject recent section between markers
    start_marker = "<!-- recently starts -->"
    end_marker = "<!-- recently stops -->"

    if start_marker in body_html and end_marker in body_html:
        start_idx = body_html.find(start_marker) + len(start_marker)
        end_idx = body_html.find(end_marker)
        body_html = body_html[:start_idx] + "\n" + recent_html + "\n" + body_html[end_idx:]
    elif recent_html:
        # No markers - prepend after first heading
        first_heading_end = body_html.find("</h1>")
        if first_heading_end != -1:
            insert_pos = first_heading_end + 5
            body_html = body_html[:insert_pos] + "\n" + recent_html + body_html[insert_pos:]

    # Build final HTML
    html = HTML_TEMPLATE.format(title=title, body=body_html)

    OUTPUT_PATH.write_text(html, "utf-8")
    print(f"Built {OUTPUT_PATH}")


if __name__ == "__main__":
    build_index()
