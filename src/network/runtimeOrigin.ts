export function getRuntimeWebSocketUrl(origin: string, override?: string): string {
  if (override) return override;
  const url = new URL(origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function getRuntimeHttpBaseUrl(origin: string, override?: string): string {
  const url = new URL(override || origin);
  if (override) url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  return url.origin;
}
