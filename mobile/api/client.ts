import { clearSessionToken, getSessionToken, setSessionToken } from '@/lib/session';

export type AuthUser = {
  id: string;
  email: string;
  created_date?: string;
};

/**
 * Absolute API base (no trailing slash). Examples:
 * - iOS Simulator / Expo web (same machine): http://localhost:3000
 * - Android Emulator: http://10.0.2.2:3000
 * - Physical device: http://<your-lan-ip>:3000
 * - Production: https://jobs.yourdomain.com
 */
const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

async function request(path: string, options: RequestInit = {}) {
  const token = await getSessionToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Client', 'mobile');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, { ...options, headers });
  } catch {
    throw Object.assign(new Error('Could not reach the server. Check EXPO_PUBLIC_API_URL and that the API is running.'), {
      status: 0,
    });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) await clearSessionToken();
    throw Object.assign(new Error((data as { message?: string }).message || 'Request failed'), {
      status: response.status,
    });
  }
  return data;
}

const post = (path: string, data: unknown) =>
  request(path, { method: 'POST', body: JSON.stringify(data) });

export const api = {
  baseUrl: API_URL,
  auth: {
    me: (): Promise<AuthUser> => request('/auth/me') as Promise<AuthUser>,
    async login(email: string, password: string): Promise<AuthUser & { token: string }> {
      const result = (await post('/auth/login', {
        email,
        password,
        client: 'mobile',
      })) as AuthUser & { token?: string };
      if (!result.token) throw new Error('Server did not return a session token for mobile login');
      await setSessionToken(result.token);
      return result as AuthUser & { token: string };
    },
    async logout(): Promise<void> {
      try {
        await post('/auth/logout', {});
      } finally {
        await clearSessionToken();
      }
    },
  },
};
