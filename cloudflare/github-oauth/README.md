# GitHub OAuth Proxy

A Cloudflare Worker that enables GitHub OAuth authentication for static sites. Designed to obtain GitHub Gist access tokens without exposing client secrets in frontend code.

## Overview

Static sites can't securely perform OAuth flows because they can't keep client secrets private. This worker acts as a backend proxy that:

1. Initiates the OAuth flow with GitHub
2. Exchanges the authorization code for an access token (using the secret)
3. Redirects back to your static site with the token

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌────────────┐
│ Static Site │────▶│ Cloudflare      │────▶│ GitHub     │
│ (auth.js)   │     │ Worker          │     │ OAuth      │
└─────────────┘     └─────────────────┘     └────────────┘
       │                    │                      │
       │  1. login()        │                      │
       │───────────────────▶│  2. /auth/github     │
       │                    │─────────────────────▶│
       │                    │                      │
       │                    │  3. User authorizes  │
       │                    │◀─────────────────────│
       │                    │                      │
       │                    │  4. /auth/callback   │
       │                    │     (exchange code)  │
       │                    │─────────────────────▶│
       │                    │                      │
       │                    │  5. access_token     │
       │                    │◀─────────────────────│
       │                    │                      │
       │  6. Redirect with  │                      │
       │     #token=...     │                      │
       │◀───────────────────│                      │
       │                    │                      │
       ▼                    │                      │
┌─────────────┐             │                      │
│ auth-       │             │                      │
│ complete    │             │                      │
│ .html       │             │                      │
└─────────────┘             │                      │
```

## Endpoints

### `GET /auth/github`

Initiates the OAuth flow. Redirects to GitHub's authorization page.

### `GET /auth/callback`

Handles the OAuth callback from GitHub. Exchanges the authorization code for an access token, then redirects to:

```
https://tools.ianp.io/auth-complete.html#token={access_token}
```

The token is passed in the URL fragment (after `#`) so it's never sent to the server in subsequent requests.

## Setup

### 1. Create a GitHub OAuth App

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create a new OAuth App:
   - **Application name**: Your app name
   - **Homepage URL**: Your site URL
   - **Authorization callback URL**: `https://your-worker.workers.dev/auth/callback`
3. Note the Client ID and generate a Client Secret

### 2. Configure Secrets

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

### 3. Deploy

```bash
npm install
npm run deploy
```

## Client Integration

Use the companion `auth.js` module on your static site:

```javascript
import { auth } from './auth.js';

// Check if user is logged in
if (auth.isLoggedIn()) {
  // Make authenticated API calls
  const response = await auth.fetch('https://api.github.com/gists');
  const gists = await response.json();
}

// Trigger login
loginButton.onclick = () => auth.login();

// Logout
logoutButton.onclick = () => auth.logout();
```

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Cloudflare Worker handling OAuth flow |
| `wrangler.jsonc` | Wrangler deployment configuration |
| `../auth.js` | Client-side auth helper module |
| `../auth-complete.html` | Landing page that stores the token |

## Development

```bash
# Start local dev server
npm run dev

# Run tests
npm test

# Deploy to Cloudflare
npm run deploy
```

## Security Notes

- The worker only requests the `gist` scope (minimal permissions)
- Tokens are passed via URL fragment, not query params, so they don't appear in server logs
- Client secrets are stored as Cloudflare secrets, never exposed to the frontend
- Tokens are stored in localStorage on the client (acceptable for limited-scope personal tools)

## License

MIT
