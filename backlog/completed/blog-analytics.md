# Blog Analytics Plan

Privacy-friendly analytics for blog.ianp.io using Val Town + GitHub Gists.

**Dependency:** [github-oauth.md](./github-oauth.md) - OAuth tool must be implemented first.

## Architecture

```
[blog.ianp.io page load]
         │
         ▼
[Tracking beacon → Val Town /track endpoint]
         │
         ▼
[Val Town SQLite (working storage, ~35k events in 10MB)]


[You visit tools.ianp.io/analytics]
         │
         ▼
[OAuth flow if needed (via github-oauth tool)]
         │
         ▼
[Dashboard fetches stats from Val Town /stats endpoint]
         │
         ▼
[Browser aggregates and writes to public Gist]
         │
         ▼
[Display charts and tables]
```

**Key insight:** Gist sync happens client-side when you visit the dashboard. No server-side tokens needed.

## Data Collection

### Collected per hit

| Data | Source | Notes |
|------|--------|-------|
| Page path | Query param | `/track?page=/some-post` |
| Referrer | Query param | Parsed from `document.referrer` |
| Timestamp | Server-side | `Date.now()` |
| User-Agent | Header | Parse for browser/OS/device |
| Screen width | Query param | Viewport width (desktop vs mobile) |

### Val Town extracts

From the request (no Cloudflare-specific headers, but still useful):
- User-Agent parsing → browser, OS, device type
- Timestamp → date/hour aggregation

### Not collected (privacy)

- IP addresses (not stored, not hashed)
- Cookies
- Fingerprinting data

## Val Town Implementation

### SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,           -- Unix timestamp ms
  page TEXT NOT NULL,            -- URL path
  ref TEXT,                      -- Referrer domain
  ua TEXT,                       -- Raw user-agent
  browser TEXT,                  -- Parsed: Chrome, Safari, Firefox
  os TEXT,                       -- Parsed: Windows, macOS, iOS, Android
  device TEXT,                   -- desktop, mobile, tablet
  width INTEGER                  -- Viewport width
);

CREATE INDEX idx_hits_ts ON hits(ts);
CREATE INDEX idx_hits_page ON hits(page);
```

### Endpoints

**`POST /track`** - Record a hit

```js
import { sqlite } from "https://esm.town/v/std/sqlite";

export async function track(req: Request) {
  const url = new URL(req.url);
  const page = url.searchParams.get("page") || "/";
  const ref = url.searchParams.get("ref") || null;
  const width = parseInt(url.searchParams.get("w")) || null;
  const ua = req.headers.get("user-agent") || "";

  // Parse UA (simple regex, or use a library)
  const browser = parseBrowser(ua);
  const os = parseOS(ua);
  const device = width ? (width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop") : null;

  await sqlite.execute(
    `INSERT INTO hits (ts, page, ref, ua, browser, os, device, width)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [Date.now(), page, ref, ua, browser, os, device, width]
  );

  // Return 1x1 transparent GIF
  const gif = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
    0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x2c,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02,
    0x02, 0x44, 0x01, 0x00, 0x3b
  ]);

  return new Response(gif, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function parseOS(ua) {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

function parseOS(ua) {
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) return "Chrome";
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return "Safari";
  if (/Firefox/.test(ua)) return "Firefox";
  if (/Edg/.test(ua)) return "Edge";
  return "Other";
}
```

**`GET /stats`** - Return aggregated stats (public, no auth)

```js
import { sqlite } from "https://esm.town/v/std/sqlite";

export async function stats(req: Request) {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days")) || 30;
  const since = Date.now() - (days * 24 * 60 * 60 * 1000);

  const [totals, daily, pages, referrers, browsers, os, devices] = await Promise.all([
    sqlite.execute(`SELECT COUNT(*) as views FROM hits WHERE ts > ?`, [since]),
    sqlite.execute(`
      SELECT date(ts/1000, 'unixepoch') as day, COUNT(*) as views
      FROM hits WHERE ts > ?
      GROUP BY day ORDER BY day DESC
    `, [since]),
    sqlite.execute(`
      SELECT page, COUNT(*) as views
      FROM hits WHERE ts > ?
      GROUP BY page ORDER BY views DESC LIMIT 20
    `, [since]),
    sqlite.execute(`
      SELECT ref, COUNT(*) as views
      FROM hits WHERE ts > ? AND ref IS NOT NULL
      GROUP BY ref ORDER BY views DESC LIMIT 10
    `, [since]),
    sqlite.execute(`
      SELECT browser, COUNT(*) as views
      FROM hits WHERE ts > ?
      GROUP BY browser ORDER BY views DESC
    `, [since]),
    sqlite.execute(`
      SELECT os, COUNT(*) as views
      FROM hits WHERE ts > ?
      GROUP BY os ORDER BY views DESC
    `, [since]),
    sqlite.execute(`
      SELECT device, COUNT(*) as views
      FROM hits WHERE ts > ?
      GROUP BY device ORDER BY views DESC
    `, [since]),
  ]);

  return Response.json({
    generated: new Date().toISOString(),
    days,
    totals: { views: totals.rows[0].views },
    daily: daily.rows,
    pages: pages.rows,
    referrers: referrers.rows,
    browsers: browsers.rows,
    os: os.rows,
    devices: devices.rows,
  }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
```

**`DELETE /cleanup`** - Prune old data (optional, authenticated)

```js
export async function cleanup(req: Request) {
  // Verify auth token from header matches a secret
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${Deno.env.get("CLEANUP_SECRET")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000); // 90 days
  await sqlite.execute(`DELETE FROM hits WHERE ts < ?`, [cutoff]);

  return new Response("OK");
}
```

## Blog Integration

Add to Hugo template (`layouts/partials/analytics.html`):

```html
<script>
(function() {
  var endpoint = 'https://your-val.web.val.run/track';
  var data = {
    page: location.pathname,
    ref: document.referrer ? new URL(document.referrer).hostname : '',
    w: window.innerWidth
  };
  var img = new Image();
  img.src = endpoint + '?' + Object.keys(data)
    .map(function(k) { return k + '=' + encodeURIComponent(data[k]); })
    .join('&');
})();
</script>
```

Include in `baseof.html`:
```html
{{ partial "analytics.html" . }}
```

## Dashboard: `analytics.html`

Single-file tool for tools.ianp.io:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Blog Analytics</title>
  <style>
    /* Minimal styling matching other tools */
  </style>
</head>
<body>
  <h1>Blog Analytics</h1>

  <div id="auth-section">
    <button id="login-btn">Sign in with GitHub</button>
    <button id="sync-btn" style="display:none">Sync to Gist</button>
  </div>

  <div id="stats">
    <p>Loading...</p>
  </div>

  <script type="module">
    import { auth } from './auth.js';

    const VALTOWN_STATS = 'https://your-val.web.val.run/stats';
    const GIST_ID = 'your-gist-id';

    // UI elements
    const loginBtn = document.getElementById('login-btn');
    const syncBtn = document.getElementById('sync-btn');
    const statsDiv = document.getElementById('stats');

    // Auth state
    if (auth.isLoggedIn()) {
      loginBtn.style.display = 'none';
      syncBtn.style.display = 'inline';
    }

    loginBtn.onclick = () => auth.login();

    // Fetch and display stats
    async function loadStats() {
      const res = await fetch(VALTOWN_STATS + '?days=30');
      const data = await res.json();

      statsDiv.innerHTML = `
        <h2>Last 30 Days</h2>
        <p><strong>${data.totals.views}</strong> total views</p>

        <h3>Top Pages</h3>
        <ul>
          ${data.pages.map(p => `<li>${p.page}: ${p.views}</li>`).join('')}
        </ul>

        <h3>Referrers</h3>
        <ul>
          ${data.referrers.map(r => `<li>${r.ref}: ${r.views}</li>`).join('')}
        </ul>

        <h3>Browsers</h3>
        <ul>
          ${data.browsers.map(b => `<li>${b.browser}: ${b.views}</li>`).join('')}
        </ul>
      `;

      return data;
    }

    // Sync to Gist
    syncBtn.onclick = async () => {
      const data = await loadStats();

      await auth.fetch(`https://api.github.com/gists/${GIST_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: {
            'blog-stats.json': {
              content: JSON.stringify(data, null, 2)
            }
          }
        }),
      });

      alert('Synced to Gist!');
    };

    loadStats();
  </script>
</body>
</html>
```

## Storage Management

### Capacity

- Free tier: 10MB SQLite
- ~300 bytes per hit
- ~35,000 hits before full

### When approaching limit

1. Dashboard shows storage warning
2. Click "Export & Cleanup" button:
   - Fetches all data from Val Town
   - Writes to Gist (archived)
   - Calls `/cleanup` endpoint to prune old data

### Automatic cleanup (optional)

Add a Val Town cron to prune data older than 90 days:

```js
// @cron daily
export async function autocleanup() {
  const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
  await sqlite.execute(`DELETE FROM hits WHERE ts < ?`, [cutoff]);
}
```

## Implementation Steps

### Phase 0: Prerequisites
- [ ] Complete [github-oauth.md](./github-oauth.md) implementation

### Phase 1: Val Town Setup
- [ ] Create Val Town account (if needed)
- [ ] Create new val for analytics
- [ ] Initialize SQLite schema
- [ ] Implement `/track` endpoint
- [ ] Implement `/stats` endpoint
- [ ] Test with curl

### Phase 2: Blog Integration
- [ ] Add tracking snippet to Hugo template
- [ ] Deploy blog
- [ ] Verify hits appearing in Val Town SQLite

### Phase 3: Dashboard
- [ ] Create `analytics.html` in tools repo
- [ ] Integrate with `auth.js` from OAuth tool
- [ ] Implement stats display
- [ ] Implement Gist sync
- [ ] Style to match existing tools

### Phase 4: Gist Setup
- [ ] Create public Gist for stats archive
- [ ] Test sync from dashboard

### Phase 5: Cleanup & Polish
- [ ] Add storage monitoring
- [ ] Add export/cleanup functionality
- [ ] Document in tools README

## File Structure

```
tools/
├── analytics.html           # Dashboard
├── auth.js                  # Shared OAuth module (from github-oauth)
├── auth-complete.html       # OAuth callback (from github-oauth)
├── valtown/
│   └── analytics.ts         # Val Town source (for reference)
└── backlog/
    └── plans/
        ├── github-oauth.md
        └── blog-analytics.md
```

## Costs

All free:
- Val Town: 1M requests/mo, 10MB SQLite
- GitHub Gist: Unlimited

## Privacy

- No cookies
- No IP storage
- No fingerprinting
- User-agent parsed server-side (raw not exposed in dashboard)
- All data aggregated before display

## Resources

- [Val Town Docs](https://docs.val.town/)
- [Val Town SQLite](https://docs.val.town/std/sqlite/)
- [How I Track My Blog's Analytics with Val Town](https://orjpap.github.io/valtown/http/analytics/blog/jekyll/2025/04/15/blog-analytics.html)
- [GitHub Gist API](https://docs.github.com/en/rest/gists)

## Open Questions

- [ ] How many days of data to display by default? (30?)
- [ ] Add charts? (sparklines, Chart.js, or keep minimal?)
- [ ] Show real-time hit count or just aggregates?
