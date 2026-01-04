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

## Hosting Options

| Option | Pros | Cons |
|--------|------|------|
| **Cloudflare Worker** | Edge-deployed, fast, Simon's reference impl | Another account/service |
| **Val Town** | Already using for analytics, simple | Single point of dependency |
| **Netlify Function** | Easy if already using Netlify | Another service |

**Recommendation:** Val Town - keeps everything in one place.

## GitHub OAuth App Setup

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create new OAuth App:
   - **Application name:** ianp.io Tools
   - **Homepage URL:** https://tools.ianp.io
   - **Authorization callback URL:** https://{valtown-endpoint}/auth/callback
3. Note the **Client ID**
4. Generate a **Client Secret** (store in Val Town secrets)

## Val Town Implementation

### Environment Secrets

```
GITHUB_CLIENT_ID     = "Iv1.xxxxxxxx"
GITHUB_CLIENT_SECRET = "xxxxxxxxxxxxxxxx"
```

### Endpoints

**`GET /auth/github`** - Start OAuth flow
```js
export function authGithub(req: Request) {
  const redirectUri = "https://your-val.web.val.run/auth/callback";
  const scope = "gist"; // or "gist,read:user" for profile info

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", Deno.env.get("GITHUB_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", crypto.randomUUID()); // CSRF protection

  return Response.redirect(url.toString(), 302);
}
```

**`GET /auth/callback`** - Exchange code for token
```js
export async function authCallback(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  // Exchange code for token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: Deno.env.get("GITHUB_CLIENT_ID"),
      client_secret: Deno.env.get("GITHUB_CLIENT_SECRET"),
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
  window.location.href = "https://your-val.web.val.run/auth/github";
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
const AUTH_ENDPOINT = "https://your-val.web.val.run/auth/github";
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

### Phase 2: Val Town Endpoints
- [ ] Add secrets to Val Town (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)
- [ ] Implement `/auth/github` endpoint
- [ ] Implement `/auth/callback` endpoint
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
└── valtown/
    └── github-oauth.ts     # Val Town endpoint source (for reference)
```

## Resources

- [Simon Willison's TIL: GitHub OAuth for static sites](https://til.simonwillison.net/cloudflare/workers-github-oauth)
- [Simon's Worker code](https://github.com/simonw/tools/blob/main/cloudflare-workers/github-auth.js)
- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps)
- [Val Town HTTP Handlers](https://docs.val.town/types/http/)

## Future Enhancements

- [ ] Token refresh handling (GitHub tokens don't expire, but good practice)
- [ ] Multiple OAuth providers (if needed)
- [ ] User profile display (requires `read:user` scope)
