#!/usr/bin/env python3
"""
Gather metadata from HTML tool files using git history.

Outputs:
- gathered_links.json: Full commit history and URLs per page
- tools.json: Tool metadata (slug, title, description, created/updated dates, URL)
"""
import json
import re
import subprocess
from pathlib import Path

EXCLUDED_FILES = {"index.html", "colophon.html", "by-month.html"}


def get_file_commit_details(file_path: str) -> list[dict]:
    """Get commit history for a file using git log."""
    try:
        result = subprocess.run(
            [
                "git", "log",
                "--follow",
                "--format=%H|%aI|%s",
                "--", file_path
            ],
            capture_output=True,
            text=True,
            check=True
        )
    except subprocess.CalledProcessError:
        return []

    commits = []
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("|", 2)
        if len(parts) == 3:
            hash_, date, message = parts
            # Extract URLs from commit message
            urls = re.findall(r'https?://[^\s<>"]+', message)
            commits.append({
                "hash": hash_,
                "date": date,
                "message": message,
                "urls": urls
            })
    return commits


def extract_title(html_path: Path) -> str:
    """Extract <title> content from HTML file."""
    try:
        content = html_path.read_text("utf-8")
        match = re.search(r"<title>([^<]+)</title>", content, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    except Exception:
        pass
    return html_path.stem


def extract_description(docs_path: Path) -> str:
    """Extract first paragraph from .docs.md file."""
    if not docs_path.exists():
        return ""
    try:
        content = docs_path.read_text("utf-8")
        # Skip any leading headers and find first paragraph
        lines = content.strip().split("\n")
        paragraph = []
        in_paragraph = False
        for line in lines:
            stripped = line.strip()
            # Skip headers
            if stripped.startswith("#"):
                continue
            # Start collecting non-empty lines
            if stripped:
                in_paragraph = True
                paragraph.append(stripped)
            elif in_paragraph:
                # Empty line ends paragraph
                break
        return " ".join(paragraph)
    except Exception:
        return ""


def gather_links():
    """Main function to gather all metadata."""
    html_files = sorted(Path(".").glob("*.html"))

    gathered_links = {}
    tools = []

    for html_path in html_files:
        if html_path.name in EXCLUDED_FILES:
            continue

        slug = html_path.stem
        commits = get_file_commit_details(str(html_path))

        if not commits:
            continue

        # gathered_links.json format
        gathered_links[slug] = {
            "file": html_path.name,
            "commits": commits,
            "all_urls": list(set(url for c in commits for url in c.get("urls", [])))
        }

        # tools.json format
        title = extract_title(html_path)
        docs_path = Path(f"{slug}.docs.md")
        description = extract_description(docs_path)

        tools.append({
            "slug": slug,
            "title": title,
            "description": description,
            "url": html_path.name,
            "created": commits[-1]["date"] if commits else "",
            "updated": commits[0]["date"] if commits else "",
        })

    # Sort tools by created date (newest first)
    tools.sort(key=lambda t: t.get("created", ""), reverse=True)

    # Write output files
    Path("gathered_links.json").write_text(
        json.dumps(gathered_links, indent=2), "utf-8"
    )
    Path("tools.json").write_text(
        json.dumps(tools, indent=2), "utf-8"
    )

    print(f"Gathered metadata for {len(tools)} tools")


if __name__ == "__main__":
    gather_links()
