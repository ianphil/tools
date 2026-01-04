interface Env {
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/auth/github") {
			const redirectUri = `${url.origin}/auth/callback`;
			const scope = "gist";

			const authUrl = new URL("https://github.com/login/oauth/authorize");
			authUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
			authUrl.searchParams.set("redirect_uri", redirectUri);
			authUrl.searchParams.set("scope", scope);
			authUrl.searchParams.set("state", crypto.randomUUID());

			return Response.redirect(authUrl.toString(), 302);
		}

		if (url.pathname === "/auth/callback") {
			const code = url.searchParams.get("code");

			if (!code) {
				return new Response("Missing code parameter", { status: 400 });
			}

			const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
				method: "POST",
				headers: {
					"Accept": "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					client_id: env.GITHUB_CLIENT_ID,
					client_secret: env.GITHUB_CLIENT_SECRET,
					code,
				}),
			});

			const data = await tokenRes.json() as { access_token?: string; error?: string };

			if (data.error || !data.access_token) {
				return new Response(`OAuth error: ${data.error || "No access token"}`, { status: 400 });
			}

			return Response.redirect(
				`https://tools.ianp.io/auth-complete.html#token=${data.access_token}`,
				302
			);
		}

		return new Response("Not found", { status: 404 });
	},
};
