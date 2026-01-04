const AUTH_ENDPOINT = "https://github-oauth.ian-philpot.workers.dev/auth/github";
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

  fetch: (url, options = {}) => {
    const token = localStorage.getItem(TOKEN_KEY);
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  },
};
