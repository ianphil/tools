/**
 * Search functionality for the tools index page
 * Provides fuzzy search across tool titles, descriptions, and slugs
 */

const TOOLS_JSON_URL = 'tools.json';
const RECENT_VISITS_KEY = 'tools_recent_visits';
const MAX_RESULTS = 10;

let toolsData = [];
let searchContainer = null;
let searchInput = null;
let resultsContainer = null;
let selectedIndex = -1;

// Load tools data
async function loadTools() {
    try {
        const response = await fetch(TOOLS_JSON_URL);
        if (!response.ok) return [];
        return await response.json();
    } catch {
        return [];
    }
}

// Get recent visits from localStorage
function getRecentVisits() {
    try {
        const data = localStorage.getItem(RECENT_VISITS_KEY);
        return data ? JSON.parse(data) : {};
    } catch {
        return {};
    }
}

// Record a visit to a tool
function recordVisit(slug) {
    try {
        const visits = getRecentVisits();
        visits[slug] = Date.now();
        localStorage.setItem(RECENT_VISITS_KEY, JSON.stringify(visits));
    } catch {
        // Ignore localStorage errors
    }
}

// Simple fuzzy match scoring
function scoreMatch(query, text) {
    if (!text) return 0;
    const lowerQuery = query.toLowerCase();
    const lowerText = text.toLowerCase();

    // Exact match
    if (lowerText === lowerQuery) return 100;

    // Starts with
    if (lowerText.startsWith(lowerQuery)) return 80;

    // Contains as word
    if (lowerText.includes(' ' + lowerQuery) || lowerText.includes(lowerQuery + ' ')) return 60;

    // Contains
    if (lowerText.includes(lowerQuery)) return 40;

    // Fuzzy: all characters in order
    let queryIdx = 0;
    for (let i = 0; i < lowerText.length && queryIdx < lowerQuery.length; i++) {
        if (lowerText[i] === lowerQuery[queryIdx]) {
            queryIdx++;
        }
    }
    if (queryIdx === lowerQuery.length) return 20;

    return 0;
}

// Search tools
function searchTools(query) {
    if (!query.trim()) return [];

    const recentVisits = getRecentVisits();

    const results = toolsData.map(tool => {
        const titleScore = scoreMatch(query, tool.title) * 2;
        const slugScore = scoreMatch(query, tool.slug) * 1.5;
        const descScore = scoreMatch(query, tool.description);
        const baseScore = Math.max(titleScore, slugScore, descScore);

        // Boost recently visited
        const lastVisit = recentVisits[tool.slug] || 0;
        const recencyBoost = lastVisit ? Math.max(0, 10 - (Date.now() - lastVisit) / (1000 * 60 * 60 * 24)) : 0;

        return {
            ...tool,
            score: baseScore + recencyBoost
        };
    }).filter(t => t.score > 0);

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, MAX_RESULTS);
}

// Render search results
function renderResults(results) {
    if (!resultsContainer) return;

    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="search-no-results">No tools found</div>';
        resultsContainer.style.display = 'block';
        return;
    }

    resultsContainer.innerHTML = results.map((tool, index) => `
        <a href="${tool.url}"
           class="search-result ${index === selectedIndex ? 'selected' : ''}"
           data-slug="${tool.slug}"
           data-index="${index}">
            <span class="search-result-title">${escapeHtml(tool.title)}</span>
            ${tool.description ? `<span class="search-result-desc">${escapeHtml(truncate(tool.description, 80))}</span>` : ''}
        </a>
    `).join('');

    resultsContainer.style.display = 'block';

    // Add click handlers
    resultsContainer.querySelectorAll('.search-result').forEach(el => {
        el.addEventListener('click', () => {
            recordVisit(el.dataset.slug);
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
}

// Handle keyboard navigation
function handleKeyDown(e) {
    const results = resultsContainer?.querySelectorAll('.search-result') || [];
    if (results.length === 0) return;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
            updateSelection(results);
            break;
        case 'ArrowUp':
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelection(results);
            break;
        case 'Enter':
            e.preventDefault();
            if (selectedIndex >= 0 && results[selectedIndex]) {
                const slug = results[selectedIndex].dataset.slug;
                recordVisit(slug);
                window.location.href = results[selectedIndex].href;
            }
            break;
        case 'Escape':
            hideResults();
            searchInput?.blur();
            break;
    }
}

function updateSelection(results) {
    results.forEach((el, i) => {
        el.classList.toggle('selected', i === selectedIndex);
    });
    if (selectedIndex >= 0 && results[selectedIndex]) {
        results[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
}

function hideResults() {
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
    }
    selectedIndex = -1;
}

// Create search UI
function createSearchUI() {
    // Find insertion point (after first h1)
    const h1 = document.querySelector('h1');
    if (!h1) return;

    searchContainer = document.createElement('div');
    searchContainer.className = 'tool-search-container';
    searchContainer.innerHTML = `
        <style>
            .tool-search-container {
                margin: 1.5rem 0;
                position: relative;
            }
            .tool-search-input {
                width: 100%;
                padding: 0.75rem 1rem;
                font-size: 1rem;
                border: 2px solid var(--border, #e0e0e0);
                border-radius: 8px;
                background: var(--bg, #fff);
                color: var(--fg, #1a1a1a);
                box-sizing: border-box;
            }
            .tool-search-input:focus {
                outline: none;
                border-color: var(--link, #0066cc);
            }
            .tool-search-results {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: var(--bg, #fff);
                border: 1px solid var(--border, #e0e0e0);
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                max-height: 400px;
                overflow-y: auto;
                display: none;
                z-index: 100;
            }
            .search-result {
                display: block;
                padding: 0.75rem 1rem;
                text-decoration: none;
                border-bottom: 1px solid var(--border, #e0e0e0);
            }
            .search-result:last-child {
                border-bottom: none;
            }
            .search-result:hover,
            .search-result.selected {
                background: var(--code-bg, #f5f5f5);
            }
            .search-result-title {
                display: block;
                font-weight: 500;
                color: var(--link, #0066cc);
            }
            .search-result-desc {
                display: block;
                font-size: 0.85rem;
                color: #666;
                margin-top: 0.25rem;
            }
            .search-no-results {
                padding: 1rem;
                color: #666;
                text-align: center;
            }
            .search-hint {
                font-size: 0.85rem;
                color: #666;
                margin-top: 0.5rem;
            }
        </style>
        <input type="text"
               class="tool-search-input"
               placeholder="Search tools... (press / to focus)"
               autocomplete="off">
        <div class="tool-search-results"></div>
        <div class="search-hint">Use arrow keys to navigate, Enter to select</div>
    `;

    h1.insertAdjacentElement('afterend', searchContainer);

    searchInput = searchContainer.querySelector('.tool-search-input');
    resultsContainer = searchContainer.querySelector('.tool-search-results');

    // Event listeners
    searchInput.addEventListener('input', (e) => {
        selectedIndex = -1;
        const results = searchTools(e.target.value);
        if (e.target.value.trim()) {
            renderResults(results);
        } else {
            hideResults();
        }
    });

    searchInput.addEventListener('keydown', handleKeyDown);

    searchInput.addEventListener('blur', () => {
        // Delay hide to allow click on results
        setTimeout(hideResults, 200);
    });

    // Global / key to focus search
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
    });
}

// Initialize
async function init() {
    // Only run on pages with the data attribute
    const script = document.querySelector('script[data-tool-search]');
    if (!script) return;

    toolsData = await loadTools();
    if (toolsData.length === 0) return;

    createSearchUI();
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { searchTools, loadTools };
