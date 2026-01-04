// Val Town Analytics for blog.ianp.io
// Deploy this as a Val Town HTTP endpoint

import { sqlite } from "https://esm.town/v/std/sqlite";

// Initialize schema (run once)
await sqlite.execute(`
  CREATE TABLE IF NOT EXISTS hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    page TEXT NOT NULL,
    ref TEXT,
    ua TEXT,
    browser TEXT,
    os TEXT,
    device TEXT,
    width INTEGER
  )
`);
await sqlite.execute(`CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits(ts)`);
await sqlite.execute(`CREATE INDEX IF NOT EXISTS idx_hits_page ON hits(page)`);

function parseOS(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

function parseBrowser(ua: string): string {
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) return "Chrome";
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return "Safari";
  if (/Firefox/.test(ua)) return "Firefox";
  if (/Edg/.test(ua)) return "Edge";
  return "Other";
}

export default async function(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  // POST /track - Record a hit
  if (req.method === "POST" || url.pathname === "/track") {
    const ts = Date.now();
    const page = url.searchParams.get("page") || "/";
    const ref = url.searchParams.get("ref") || null;
    const width = parseInt(url.searchParams.get("w") || "") || null;
    const ua = req.headers.get("user-agent") || "";

    const browser = parseBrowser(ua);
    const os = parseOS(ua);
    const device = width ? (width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop") : null;

    await sqlite.execute({
      sql: `INSERT INTO hits (ts, page, ref, ua, browser, os, device, width)
            VALUES (:ts, :page, :ref, :ua, :browser, :os, :device, :width)`,
      args: { ts, page, ref, ua, browser, os, device, width },
    });

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

  // GET /stats - Return aggregated stats
  if (url.pathname === "/stats") {
    const days = parseInt(url.searchParams.get("days") || "30");
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);

    const [totals, daily, pages, referrers, browsers, os, devices] = await Promise.all([
      sqlite.execute({ sql: `SELECT COUNT(*) as views FROM hits WHERE ts > :since`, args: { since } }),
      sqlite.execute({
        sql: `SELECT date(ts/1000, 'unixepoch') as day, COUNT(*) as views
              FROM hits WHERE ts > :since
              GROUP BY day ORDER BY day DESC`,
        args: { since },
      }),
      sqlite.execute({
        sql: `SELECT page, COUNT(*) as views
              FROM hits WHERE ts > :since
              GROUP BY page ORDER BY views DESC LIMIT 20`,
        args: { since },
      }),
      sqlite.execute({
        sql: `SELECT ref, COUNT(*) as views
              FROM hits WHERE ts > :since AND ref IS NOT NULL AND ref != ''
              GROUP BY ref ORDER BY views DESC LIMIT 10`,
        args: { since },
      }),
      sqlite.execute({
        sql: `SELECT browser, COUNT(*) as views
              FROM hits WHERE ts > :since
              GROUP BY browser ORDER BY views DESC`,
        args: { since },
      }),
      sqlite.execute({
        sql: `SELECT os, COUNT(*) as views
              FROM hits WHERE ts > :since
              GROUP BY os ORDER BY views DESC`,
        args: { since },
      }),
      sqlite.execute({
        sql: `SELECT device, COUNT(*) as views
              FROM hits WHERE ts > :since AND device IS NOT NULL
              GROUP BY device ORDER BY views DESC`,
        args: { since },
      }),
    ]);

    return Response.json({
      generated: new Date().toISOString(),
      days,
      totals: { views: totals.rows[0]?.[0] || 0 },
      daily: daily.rows.map(r => ({ day: r[0], views: r[1] })),
      pages: pages.rows.map(r => ({ page: r[0], views: r[1] })),
      referrers: referrers.rows.map(r => ({ ref: r[0], views: r[1] })),
      browsers: browsers.rows.map(r => ({ browser: r[0], views: r[1] })),
      os: os.rows.map(r => ({ os: r[0], views: r[1] })),
      devices: devices.rows.map(r => ({ device: r[0], views: r[1] })),
    }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // DELETE /cleanup - Prune old data (requires secret)
  if (req.method === "DELETE" && url.pathname === "/cleanup") {
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${Deno.env.get("CLEANUP_SECRET")}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000); // 90 days
    await sqlite.execute(`DELETE FROM hits WHERE ts < ?`, [cutoff]);

    return new Response("OK", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  return new Response("Not found", { status: 404 });
}
