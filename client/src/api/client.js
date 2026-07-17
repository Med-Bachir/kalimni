import { API_URL } from '../config';

// The auth token is injected by the auth store to avoid a require cycle.
let authToken = null;
export const setAuthToken = (token) => {
  authToken = token;
};
// Media URLs (voice notes) authenticate via ?token= — players can't set headers.
export const getAuthToken = () => authToken;

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || 'unknown', res.status);
  return data;
}

// Multipart upload (FormData) — no Content-Type header so fetch sets the boundary.
export async function apiUpload(path, formData) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method: 'POST',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      body: formData,
    });
  } catch {
    throw new ApiError('network', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || 'unknown', res.status);
  return data;
}
