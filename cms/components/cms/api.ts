'use client';

export type ApiJson = Record<string, unknown>;

function csrfToken() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((row) => row.startsWith('elitex_csrf='));
  if (!match) return '';
  try {
    return decodeURIComponent(match.slice('elitex_csrf='.length));
  } catch {
    return match.slice('elitex_csrf='.length);
  }
}

export async function cmsFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const method = (init.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = csrfToken();
    if (csrf) headers.set('x-csrf-token', csrf);
    if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
  }
  const response = await fetch(path, { ...init, method, headers, credentials: 'include' });
  if (response.status === 401 && !path.startsWith('/api/auth/login')) {
    window.location.href = '/login';
  }
  return response;
}

export async function cmsJson<T extends ApiJson = ApiJson>(path: string, init: RequestInit = {}) {
  const response = await cmsFetch(path, init);
  const json = (await response.json()) as T & { ok?: boolean; error?: string };
  return { response, json, ok: response.ok && json.ok !== false };
}
