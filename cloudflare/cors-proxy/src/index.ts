const ALLOWED_ORIGINS = [
	"https://tools.ianp.io",
	"http://localhost:8765",
	"http://localhost:3000",
];

export default {
	async fetch(request: Request): Promise<Response> {
		const origin = request.headers.get("Origin") || "";
		const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

		// Handle preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": corsOrigin,
					"Access-Control-Allow-Methods": "GET, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
					"Access-Control-Max-Age": "86400",
				},
			});
		}

		const url = new URL(request.url);
		const targetUrl = url.searchParams.get("url");

		if (!targetUrl) {
			return new Response("Missing ?url= parameter", {
				status: 400,
				headers: { "Access-Control-Allow-Origin": corsOrigin },
			});
		}

		try {
			const response = await fetch(targetUrl, {
				headers: {
					"User-Agent": "Mozilla/5.0 (compatible; CorsProxy/1.0)",
					"Accept": "*/*",
				},
			});

			const headers = new Headers(response.headers);
			headers.set("Access-Control-Allow-Origin", corsOrigin);
			headers.delete("Content-Security-Policy");
			headers.delete("X-Frame-Options");

			return new Response(response.body, {
				status: response.status,
				headers,
			});
		} catch (err) {
			return new Response(`Fetch error: ${err}`, {
				status: 502,
				headers: { "Access-Control-Allow-Origin": corsOrigin },
			});
		}
	},
};
