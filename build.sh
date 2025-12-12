#!/bin/bash
set -e

# Ensure full git history (for CI environments)
if [ -f .git/shallow ]; then
    git fetch --unshallow || true
fi

echo "=== Building tools site ==="

# Step 1: Gather metadata
echo "Gathering metadata..."
python gather_links.py

# Step 2: Build supporting pages
echo "Building colophon..."
python build_colophon.py

echo "Building dates index..."
python build_dates.py

# Step 3: Build index
echo "Building index..."
python build_index.py

# Step 4: Build archive
echo "Building by-month archive..."
python build_by_month.py

# Step 5: Inject footer into HTML files
echo "Injecting footer into tool pages..."
if [ -f footer.js ]; then
    FOOTER_HASH=$(git log -1 --format="%H" -- footer.js 2>/dev/null || echo "latest")
    FOOTER_SHORT_HASH=$(echo "$FOOTER_HASH" | cut -c1-8)

    for file in *.html; do
        # Skip generated pages
        if [ "$file" = "index.html" ] || [ "$file" = "colophon.html" ] || [ "$file" = "by-month.html" ]; then
            continue
        fi

        if [ -f "$file" ]; then
            if ! grep -q 'src="footer.js' "$file"; then
                # Inject footer.js before closing </body>
                sed -i'' -e "s|</body>|<script src=\"footer.js?${FOOTER_SHORT_HASH}\"></script>\n</body>|" "$file"
                echo "  Injected footer into $file"
            fi
        fi
    done
fi

echo "=== Build complete! ==="
echo ""
echo "Generated files:"
ls -la index.html colophon.html by-month.html dates.json tools.json gathered_links.json 2>/dev/null || true
