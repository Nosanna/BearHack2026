import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import type {
  ApplianceDetailDto,
  ApplianceDto,
  DashboardHomeResponse,
  LoginResponse,
  RegisterFromImageRequest,
  RegisterFromImageResponse,
  RepairTransitionResponse,
  RoomDto,
  ScheduleUpcomingResponse,
  SignedUploadRequest,
  SignedUploadResponse,
  StartRepairRequest,
  RepairSessionDto,
} from '@fixit/shared';

const ACCESS_KEY = 'fixit.accessToken';
const REFRESH_KEY = 'fixit.refreshToken';

const apiUrl: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:4000';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null) {
  onSessionExpired = fn;
}

// Coalesce concurrent refresh attempts to a single in-flight request.
let inflightRefresh: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!refreshToken) return false;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      try {
        const res = await fetch(`${apiUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal: ctrl.signal,
        });
        if (!res.ok) return false;
        const data = (await res.json()) as LoginResponse;
        await SecureStore.setItemAsync(ACCESS_KEY, data.accessToken);
        await SecureStore.setItemAsync(REFRESH_KEY, data.refreshToken);
        return true;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

// Hard ceiling so a hung TCP/TLS connection surfaces an error within ~60s
// instead of waiting for the OS-level timeout (~3 min on iOS).
const REQUEST_TIMEOUT_MS = 60_000;

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean; _retry?: boolean } = {},
): Promise<T> {
  if (__DEV__) {
    // #region agent log
    console.log('[agent][H1] api request start', { apiUrl, path, auth: init.auth !== false });
    // #endregion agent log
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };

  if (init.auth !== false) {
    const token = await SecureStore.getItemAsync(ACCESS_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, { ...init, headers, signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    if (ctrl.signal.aborted) {
      if (__DEV__) {
        // #region agent log
        console.log('[agent][H2] api request timeout', { apiUrl, path, timeoutMs: REQUEST_TIMEOUT_MS });
        // #endregion agent log
      }
      throw new ApiError(
        0,
        `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check that your phone and Mac are on the same Wi-Fi.`,
      );
    }
    if (__DEV__) {
      // #region agent log
      console.log('[agent][H3] api request network error', {
        apiUrl,
        path,
        message: (e as Error)?.message ?? String(e),
      });
      // #endregion agent log
    }
    throw new ApiError(0, (e as Error).message || 'Network request failed');
  }
  clearTimeout(timer);

  // 401 on an authed request: try refresh-and-retry exactly once.
  if (
    res.status === 401 &&
    init.auth !== false &&
    !init._retry &&
    path !== '/auth/refresh' &&
    path !== '/auth/login' &&
    path !== '/auth/dev-login'
  ) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, { ...init, _retry: true });
    }
    // Refresh failed → tokens are dead. Notify the app so it can boot to login.
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    onSessionExpired?.();
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  const text = await res.text();
  const body = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const errBody = (body ?? {}) as { message?: string | string[] };
    const message = errBody.message ?? `Request failed with ${res.status}`;
    throw new ApiError(
      res.status,
      Array.isArray(message) ? message.join(', ') : String(message),
    );
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const tokenStorage = {
  async save(tokens: { accessToken: string; refreshToken: string }) {
    await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
  async getAccess() {
    return SecureStore.getItemAsync(ACCESS_KEY);
  },
  async getRefresh() {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
};

export const api = {
  async login(idToken: string): Promise<LoginResponse> {
    const res = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ idToken }),
    });
    await tokenStorage.save({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
    });
    return res;
  },
  async devLogin(): Promise<LoginResponse> {
    const res = await request<LoginResponse>('/auth/dev-login', {
      method: 'POST',
      auth: false,
      body: '{}',
    });
    await tokenStorage.save({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
    });
    return res;
  },
  async logout() {
    try {
      await request<void>('/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // ignore — we still clear local tokens
    }
    await tokenStorage.clear();
  },

  dashboardHome: () => request<DashboardHomeResponse>('/dashboard/home'),

  listRooms: () => request<RoomDto[]>('/rooms'),
  createRoom: (name: string) =>
    request<RoomDto>('/rooms', { method: 'POST', body: JSON.stringify({ name }) }),
  getRoom: (id: string) => request<RoomDto>(`/rooms/${id}`),
  deleteRoom: (id: string) =>
    request<void>(`/rooms/${id}`, { method: 'DELETE' }),

  listAppliances: (roomId?: string) =>
    request<ApplianceDto[]>(
      roomId ? `/appliances?roomId=${encodeURIComponent(roomId)}` : '/appliances',
    ),
  applianceDetail: (id: string) =>
    request<ApplianceDetailDto>(`/appliances/${id}/detail`),
  registerFromImage: (body: RegisterFromImageRequest) =>
    request<RegisterFromImageResponse>('/appliances/register-from-image', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteAppliance: (id: string) =>
    request<void>(`/appliances/${id}`, { method: 'DELETE' }),

  upcoming: () => request<ScheduleUpcomingResponse>('/schedule/upcoming'),

  signedUpload: (body: SignedUploadRequest) =>
    request<SignedUploadResponse>('/media/signed-upload', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  startRepair: (body: StartRepairRequest) =>
    request<RepairSessionDto>('/repair/start', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  respond: (id: string, answer: string) =>
    request<RepairTransitionResponse>(`/repair/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),
  submitRepairPhoto: (id: string, imageUrl: string) =>
    request<RepairTransitionResponse>(`/repair/${id}/photo`, {
      method: 'POST',
      body: JSON.stringify({ imageUrl }),
    }),
};

export async function uploadToSignedUrl(
  signed: SignedUploadResponse,
  uri: string,
): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: signed.headers,
      body: blob,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Upload failed: ${res.status}`);
    }
    return signed.publicUrl;
  } catch (e) {
    if (ctrl.signal.aborted) {
      throw new Error(
        `Photo upload timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Try again.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
