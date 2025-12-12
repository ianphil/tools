#!/usr/bin/env python3
"""
Build by-month.html grouping tools by creation month.
"""
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

TOOLS_JSON_PATH = Path("tools.json")
OUTPUT_PATH = Path("by-month.html")

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tools by Month</title>
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
        h1 {{ border-bottom: 2px solid var(--border); padding-bottom: 0.5em; }}
        h2 {{
            margin-top: 2em;
            padding-bottom: 0.3em;
            border-bottom: 1px solid var(--border);
        }}
        .month-section {{
            margin-bottom: 2em;
        }}
        .tool-item {{
            margin: 0.75em 0;
            padding: 0.5em 0;
        }}
        .tool-item a {{
            font-weight: 500;
        }}
        .tool-description {{
            color: #666;
            font-size: 0.9em;
            margin-left: 1em;
        }}
        .tool-links {{
            font-size: 0.85em;
            margin-left: 1em;
        }}
        .nav {{
            margin-bottom: 2em;
        }}
        .nav a {{
            margin-right: 1em;
        }}
        .toc {{
            background: var(--code-bg);
            padding: 1em;
            border-radius: 8px;
            margin-bottom: 2em;
        }}
        .toc ul {{
            margin: 0;
            padding-left: 1.5em;
            columns: 2;
        }}
    </style>
</head>
<body>
    <nav class="nav">
        <a href="index.html">Home</a>
        <a href="colophon.html">Colophon</a>
    </nav>
    <h1>Tools by Month</h1>
    {toc}
    {content}
</body>
</html>
"""


def format_month(year_month: str) -> str:
    """Convert YYYY-MM to readable month name."""
    try:
        dt = datetime.strptime(year_month, "%Y-%m")
        return dt.strftime("%B %Y")
    except ValueError:
        return year_month


def build_by_month():
    """Build by-month.html from tools.json."""
    if not TOOLS_JSON_PATH.exists():
        print("tools.json not found - run gather_links.py first")
        return

    tools = json.loads(TOOLS_JSON_PATH.read_text("utf-8"))

    # Group by month
    by_month = defaultdict(list)
    for tool in tools:
        created = tool.get("created", "")
        if created:
            year_month = created[:7]  # YYYY-MM
            by_month[year_month].append(tool)

    # Sort months (newest first)
    sorted_months = sorted(by_month.keys(), reverse=True)

    # Build TOC
    toc_items = []
    for ym in sorted_months:
        month_name = format_month(ym)
        count = len(by_month[ym])
        toc_items.append(f'<li><a href="#month-{ym}">{month_name}</a> ({count})</li>')

    toc_html = '<div class="toc">\n<strong>Jump to:</strong>\n<ul>\n'
    toc_html += "\n".join(toc_items)
    toc_html += '\n</ul>\n</div>'

    # Build content
    content_parts = []
    for ym in sorted_months:
        month_name = format_month(ym)
        month_tools = by_month[ym]

        # Sort tools within month by created date
        month_tools.sort(key=lambda t: t.get("created", ""))

        html = f'<div class="month-section">\n'
        html += f'<h2 id="month-{ym}">{month_name}</h2>\n'

        for tool in month_tools:
            slug = tool["slug"]
            title = tool.get("title", slug)
            description = tool.get("description", "")
            url = tool.get("url", f"{slug}.html")

            html += '<div class="tool-item">\n'
            html += f'<a href="{url}">{title}</a>\n'
            if description:
                # Truncate long descriptions
                short_desc = description[:150] + "..." if len(description) > 150 else description
                html += f'<span class="tool-description">{short_desc}</span>\n'
            html += f'<span class="tool-links"><a href="colophon.html#{slug}">history</a></span>\n'
            html += '</div>\n'

        html += '</div>\n'
        content_parts.append(html)

    final_html = HTML_TEMPLATE.format(toc=toc_html, content="\n".join(content_parts))
    OUTPUT_PATH.write_text(final_html, "utf-8")
    print(f"Built {OUTPUT_PATH} with {len(sorted_months)} months")


if __name__ == "__main__":
    build_by_month()
