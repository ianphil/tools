#!/usr/bin/env python3
"""
Build colophon.html showing development history of all tools.
"""
import json
from pathlib import Path

GATHERED_LINKS_PATH = Path("gathered_links.json")
TOOLS_JSON_PATH = Path("tools.json")
OUTPUT_PATH = Path("colophon.html")

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Colophon - Development History</title>
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
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
            background: var(--bg);
            color: var(--fg);
        }}
        a {{ color: var(--link); }}
        a:visited {{ color: var(--link-visited); }}
        h1 {{ border-bottom: 2px solid var(--border); padding-bottom: 0.5em; }}
        .tool {{
            margin: 2em 0;
            padding: 1em;
            border: 1px solid var(--border);
            border-radius: 8px;
        }}
        .tool h2 {{
            margin-top: 0;
        }}
        .tool-meta {{
            color: #666;
            font-size: 0.9em;
            margin-bottom: 1em;
        }}
        .description {{
            margin: 1em 0;
            padding: 0.5em 1em;
            background: var(--code-bg);
            border-radius: 4px;
        }}
        details {{
            margin-top: 1em;
        }}
        summary {{
            cursor: pointer;
            font-weight: 500;
        }}
        .commit {{
            margin: 0.5em 0;
            padding: 0.5em;
            border-left: 3px solid var(--border);
            font-size: 0.9em;
        }}
        .commit-date {{
            color: #666;
            font-family: monospace;
        }}
        .commit-hash {{
            font-family: monospace;
            font-size: 0.85em;
        }}
        .commit-urls {{
            margin-top: 0.25em;
        }}
        .commit-urls a {{
            font-size: 0.85em;
        }}
        .nav {{
            margin-bottom: 2em;
        }}
        .nav a {{
            margin-right: 1em;
        }}
    </style>
</head>
<body>
    <nav class="nav">
        <a href="./">Home</a>
        <a href="by-month">By Month</a>
    </nav>
    <h1>Colophon</h1>
    <p>Development history of all tools, sorted by most recent activity.</p>
    {content}
</body>
</html>
"""


def format_date(iso_date: str) -> str:
    """Format ISO date to readable format."""
    if not iso_date:
        return ""
    return iso_date[:10]


def build_colophon():
    """Build colophon.html from gathered metadata."""
    if not GATHERED_LINKS_PATH.exists():
        print("gathered_links.json not found - run gather_links.py first")
        return

    gathered = json.loads(GATHERED_LINKS_PATH.read_text("utf-8"))

    # Load tools.json for descriptions
    tools_by_slug = {}
    if TOOLS_JSON_PATH.exists():
        tools = json.loads(TOOLS_JSON_PATH.read_text("utf-8"))
        tools_by_slug = {t["slug"]: t for t in tools}

    # Sort by most recent commit
    sorted_slugs = sorted(
        gathered.keys(),
        key=lambda s: gathered[s]["commits"][0]["date"] if gathered[s]["commits"] else "",
        reverse=True
    )

    content_parts = []

    for slug in sorted_slugs:
        data = gathered[slug]
        commits = data.get("commits", [])
        tool_info = tools_by_slug.get(slug, {})

        title = tool_info.get("title", slug)
        description = tool_info.get("description", "")
        url = data.get("file", f"{slug}.html")

        html = f'<div class="tool" id="{slug}">\n'
        html += f'<h2><a href="{url}">{title}</a></h2>\n'

        if commits:
            created = format_date(commits[-1]["date"])
            updated = format_date(commits[0]["date"])
            html += f'<div class="tool-meta">Created: {created} | Updated: {updated} | {len(commits)} commits</div>\n'

        if description:
            html += f'<div class="description">{description}</div>\n'

        if commits:
            html += f'<details>\n<summary>Commit history ({len(commits)})</summary>\n'
            for commit in commits:
                date = format_date(commit["date"])
                hash_short = commit["hash"][:8]
                message = commit["message"]
                urls = commit.get("urls", [])

                html += f'<div class="commit">\n'
                html += f'<span class="commit-date">{date}</span> '
                html += f'<span class="commit-hash">{hash_short}</span> '
                html += f'{message}\n'

                if urls:
                    html += '<div class="commit-urls">'
                    for u in urls:
                        html += f'<a href="{u}" target="_blank">Transcript</a> '
                    html += '</div>\n'

                html += '</div>\n'
            html += '</details>\n'

        html += '</div>\n'
        content_parts.append(html)

    final_html = HTML_TEMPLATE.format(content="\n".join(content_parts))
    OUTPUT_PATH.write_text(final_html, "utf-8")
    print(f"Built {OUTPUT_PATH} with {len(sorted_slugs)} tools")


if __name__ == "__main__":
    build_colophon()
