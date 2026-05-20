let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>): void {
  _getToken = fn;
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = _getToken ? await _getToken() : null;
  const existingHeaders = (options.headers ?? {}) as Record<string, string>;
  return fetch(url, {
    ...options,
    headers: {
      ...existingHeaders,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
