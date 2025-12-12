#!/usr/bin/env python3
"""
Build dates.json mapping each HTML file to its most recent commit date.
Used by footer.js to display last updated date.
"""
import json
from pathlib import Path

GATHERED_LINKS_PATH = Path("gathered_links.json")
OUTPUT_PATH = Path("dates.json")


def build_dates():
    """Build dates.json from gathered_links.json."""
    if not GATHERED_LINKS_PATH.exists():
        print("gathered_links.json not found - run gather_links.py first")
        return

    gathered = json.loads(GATHERED_LINKS_PATH.read_text("utf-8"))

    dates = {}
    for slug, data in gathered.items():
        commits = data.get("commits", [])
        if commits:
            # Most recent commit date (first in list), truncated to date only
            dates[data["file"]] = commits[0]["date"][:10]

    OUTPUT_PATH.write_text(json.dumps(dates, indent=2), "utf-8")
    print(f"Built {OUTPUT_PATH} with {len(dates)} entries")


if __name__ == "__main__":
    build_dates()
