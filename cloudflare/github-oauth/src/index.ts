interface Env {
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
}

const STATE_COOKIE = "github_oauth_state";

function getStateCookie(request: Request): string | null {
	const cookies = request.headers.get("Cookie") || "";
	const match = cookies.split(";").map(c => c.trim()).find(c => c.startsWith(`${STATE_COOKIE}=`));
	return match ? match.split("=")[1] : null;
}

function clearStateCookie(): string {
	return `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/auth/github") {
			const redirectUri = `${url.origin}/auth/callback`;
			const scope = "gist";
			const state = crypto.randomUUID();

			const authUrl = new URL("https://github.com/login/oauth/authorize");
			authUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
			authUrl.searchParams.set("redirect_uri", redirectUri);
			authUrl.searchParams.set("scope", scope);
			authUrl.searchParams.set("state", state);

			return new Response(null, {
				status: 302,
				headers: {
					"Location": authUrl.toString(),
					"Set-Cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
				},
			});
		}

		if (url.pathname === "/auth/callback") {
			const code = url.searchParams.get("code");
			const returnedState = url.searchParams.get("state");
			const savedState = getStateCookie(request);

			if (!savedState || savedState !== returnedState) {
				return new Response("Invalid state parameter (possible CSRF attempt)", {
					status: 400,
					headers: { "Set-Cookie": clearStateCookie() },
				});
			}

			if (!code) {
				return new Response("Missing code parameter", {
					status: 400,
					headers: { "Set-Cookie": clearStateCookie() },
				});
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
				return new Response(`OAuth error: ${data.error || "No access token"}`, {
					status: 400,
					headers: { "Set-Cookie": clearStateCookie() },
				});
			}

			return new Response(null, {
				status: 302,
				headers: {
					"Location": `https://tools.ianp.io/auth-complete.html#token=${data.access_token}`,
					"Set-Cookie": clearStateCookie(),
				},
			});
		}

		return new Response("Not found", { status: 404 });
	},
};
