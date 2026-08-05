// API client for the specialist console. Same endpoints as the mobile app,
// same bearer token — the console adds no privileged surface of its own.
//
// The token lives in sessionStorage, not localStorage: a console session on a
// clinic desktop should not survive closing the tab.
const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'kalimni.console.token';

export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network', 0);
  }
  // A dead or revoked token ends the session immediately rather than leaving
  // the console showing stale clinical data.
  if (res.status === 401) {
    setToken(null);
    window.location.hash = '#/login';
    throw new ApiError('unauthorized', 401);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || 'unknown', res.status);
  return data;
}
