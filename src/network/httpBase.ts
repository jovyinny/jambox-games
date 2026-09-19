import { getRuntimeHttpBaseUrl } from './runtimeOrigin';

export function getLobbyHttpBaseUrl() {
  const origin = typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin;
  return getRuntimeHttpBaseUrl(origin, import.meta.env.VITE_WS_URL);
}
