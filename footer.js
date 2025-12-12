/**
 * Common footer for tool pages
 * Adds navigation links and last updated date
 */
(function() {
    'use strict';

    // Detect background color for contrast
    function getBackgroundColor() {
        const body = document.body;
        const computed = window.getComputedStyle(body);
        return computed.backgroundColor;
    }

    function isLightBackground(color) {
        // Parse rgb(r, g, b) or rgba(r, g, b, a)
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return true;
        const [, r, g, b] = match.map(Number);
        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5;
    }

    // Get current page filename
    function getCurrentPage() {
        const path = window.location.pathname;
        return path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    }

    // Fetch last updated date
    async function getLastUpdated() {
        try {
            const response = await fetch('dates.json');
            if (!response.ok) return null;
            const dates = await response.json();
            const currentPage = getCurrentPage();
            return dates[currentPage] || null;
        } catch {
            return null;
        }
    }

    // Build and inject footer
    async function injectFooter() {
        const currentPage = getCurrentPage();
        const lastUpdated = await getLastUpdated();
        const isLight = isLightBackground(getBackgroundColor());

        const footer = document.createElement('footer');
        footer.style.cssText = `
            margin-top: 3rem;
            padding: 1.5rem 0;
            border-top: 1px solid ${isLight ? '#e0e0e0' : '#333'};
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 0.9rem;
            color: ${isLight ? '#666' : '#999'};
        `;

        const links = [
            { href: './', text: 'Home' },
            { href: 'colophon', text: 'About' },
            { href: 'by-month', text: 'Archive' }
        ];

        let html = '<div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">';
        html += '<div>';
        links.forEach((link, i) => {
            if (i > 0) html += ' | ';
            html += `<a href="${link.href}" style="color: ${isLight ? '#0066cc' : '#6db3f2'};">${link.text}</a>`;
        });
        html += '</div>';

        if (lastUpdated) {
            html += `<div>Updated ${lastUpdated}</div>`;
        }

        html += '</div>';
        footer.innerHTML = html;

        document.body.appendChild(footer);
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFooter);
    } else {
        injectFooter();
    }
})();
