# GitHub OAuth Tool Plan

Reusable OAuth flow for tools.ianp.io, following [Simon Willison's pattern](https://til.simonwillison.net/cloudflare/workers-github-oauth).

## Purpose

Provide a shared authentication mechanism so any tool on `tools.ianp.io` can:
- Authenticate users with GitHub
- Store tokens in localStorage (scoped to tools.ianp.io domain)
- Make authenticated GitHub API calls (Gists, repos, etc.)

## Architecture

```
[User clicks "Sign in with GitHub" on any tool]
     │
     ▼
[Redirect to /auth/github]
     │
     ▼
[Redirect to github.com/login/oauth/authorize]
     │
     ▼
[User approves, GitHub redirects to /auth/callback?code=xxx]
     │
     ▼
[Server exchanges code for token via GitHub API]
     │
     ▼
[Redirect back to tool with token in URL fragment]
     │
     ▼
[Tool stores token in localStorage, clears URL]
```

## Hosting

**Cloudflare Workers** - Edge-deployed, fast, and matches Simon Willison's reference implementation.

## GitHub OAuth App Setup

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create new OAuth App:
   - **Application name:** ianp.io Tools
   - **Homepage URL:** https://tools.ianp.io
   - **Authorization callback URL:** https://{worker-name}.{account}.workers.dev/auth/callback
3. Note the **Client ID**
4. Generate a **Client Secret** (store in Cloudflare Worker secrets)

## Cloudflare Worker Implementation

### Environment Secrets

Set via `wrangler secret put`:

```
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

### Worker Code

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth/github") {
      // Start OAuth flow
      const redirectUri = `${url.origin}/auth/callback`;
      const scope = "gist"; // or "gist,read:user" for profile info

      const authUrl = new URL("https://github.com/login/oauth/authorize");
      authUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", scope);
      authUrl.searchParams.set("state", crypto.randomUUID()); // CSRF protection

      return Response.redirect(authUrl.toString(), 302);
    }

    if (url.pathname === "/auth/callback") {
      // Exchange code for token
      const code = url.searchParams.get("code");

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

      const { access_token } = await tokenRes.json();

      // Redirect back to tools.ianp.io with token in fragment (not query!)
      // Fragment stays client-side, never sent to server
      return Response.redirect(
        `https://tools.ianp.io/auth-complete.html#token=${access_token}`,
        302
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
```

### Landing Page: `auth-complete.html`

Lives in tools repo, receives token and stores it:

```html
<!DOCTYPE html>
<html>
<head><title>Authenticating...</title></head>
<body>
<script>
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const token = params.get("token");

  if (token) {
    localStorage.setItem("github_token", token);
    // Redirect to referring tool or home
    const returnTo = localStorage.getItem("auth_return_to") || "/";
    localStorage.removeItem("auth_return_to");
    window.location.href = returnTo;
  } else {
    document.body.textContent = "Authentication failed.";
  }
</script>
</body>
</html>
```

## Client-Side Usage

Any tool can use the stored token:

```js
// Check if authenticated
function isAuthenticated() {
  return !!localStorage.getItem("github_token");
}

// Start auth flow
function login() {
  localStorage.setItem("auth_return_to", window.location.pathname);
  window.location.href = "https://{worker-name}.{account}.workers.dev/auth/github";
}

// Make authenticated request
async function updateGist(gistId, filename, content) {
  const token = localStorage.getItem("github_token");

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: { [filename]: { content } }
    }),
  });

  return res.json();
}

// Logout
function logout() {
  localStorage.removeItem("github_token");
}
```

## Shared Auth Module

Create `auth.js` that any tool can import:

```js
// /auth.js
const AUTH_ENDPOINT = "https://{worker-name}.{account}.workers.dev/auth/github";
const TOKEN_KEY = "github_token";

export const auth = {
  isLoggedIn: () => !!localStorage.getItem(TOKEN_KEY),

  getToken: () => localStorage.getItem(TOKEN_KEY),

  login: (returnTo = window.location.pathname) => {
    localStorage.setItem("auth_return_to", returnTo);
    window.location.href = AUTH_ENDPOINT;
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
  },

  // Wrapper for authenticated fetch
  fetch: (url, options = {}) => {
    const token = localStorage.getItem(TOKEN_KEY);
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "Authorization": `Bearer ${token}`,
      },
    });
  },
};
```

## Security Considerations

- **CSRF:** Include `state` parameter, verify on callback
- **Token in fragment:** URL fragments are never sent to servers (safer than query params)
- **Scope minimization:** Only request scopes you need (`gist` for analytics)
- **Token storage:** localStorage is domain-scoped, only tools.ianp.io can access
- **HTTPS only:** All endpoints must be HTTPS

## Implementation Steps

### Phase 1: GitHub OAuth App
- [ ] Create OAuth App on GitHub
- [ ] Note Client ID and Secret

### Phase 2: Cloudflare Worker
- [ ] Create new Worker project with `wrangler init`
- [ ] Add secrets via `wrangler secret put`
- [ ] Implement worker with `/auth/github` and `/auth/callback` routes
- [ ] Deploy with `wrangler deploy`
- [ ] Test flow manually

### Phase 3: Tools Integration
- [ ] Create `auth-complete.html` in tools repo
- [ ] Create shared `auth.js` module
- [ ] Test end-to-end flow

### Phase 4: Documentation
- [ ] Add usage docs for other tools
- [ ] Document available scopes

## File Structure

```
tools/
├── auth-complete.html      # OAuth callback landing page
├── auth.js                 # Shared auth module
└── cloudflare/
    └── github-oauth/
        ├── wrangler.toml   # Worker configuration
        └── src/
            └── index.js    # Worker code
```

## Resources

- [Simon Willison's TIL: GitHub OAuth for static sites](https://til.simonwillison.net/cloudflare/workers-github-oauth)
- [Simon's Worker code](https://github.com/simonw/tools/blob/main/cloudflare-workers/github-auth.js)
- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

## Future Enhancements

- [ ] Token refresh handling (GitHub tokens don't expire, but good practice)
- [ ] Multiple OAuth providers (if needed)
- [ ] User profile display (requires `read:user` scope)
