import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeHttpBaseUrl, getRuntimeWebSocketUrl } from './runtimeOrigin';
import { getLobbyHttpBaseUrl } from './httpBase';

afterEach(() => { vi.unstubAllEnvs(); });

describe('runtime endpoints', () => {
  it.each([
    ['http://192.168.1.20:5173', 'ws://192.168.1.20:5173/ws'],
    ['https://play.example.com', 'wss://play.example.com/ws'],
    ['http://[::1]:5173/path?query=yes#hash', 'ws://[::1]:5173/ws'],
  ])('uses the host origin for WebSocket: %s', (origin, expected) => {
    expect(getRuntimeWebSocketUrl(origin)).toBe(expected);
  });

  it('preserves an explicit WebSocket endpoint', () => {
    expect(getRuntimeWebSocketUrl('https://ignored.example', 'wss://api.example/custom?token=test'))
      .toBe('wss://api.example/custom?token=test');
  });

  it.each([
    ['https://play.example.com', undefined, 'https://play.example.com'],
    ['http://192.168.1.20:5173', undefined, 'http://192.168.1.20:5173'],
    ['https://ignored.example', 'wss://api.example/ws', 'https://api.example'],
    ['https://ignored.example', 'ws://192.168.1.20:8080/ws?q=1#hash', 'http://192.168.1.20:8080'],
  ])('derives the HTTP origin from %s and %s', (origin, override, expected) => {
    expect(getRuntimeHttpBaseUrl(origin, override)).toBe(expected);
  });

  it('uses the browser origin for transcription when no override is configured', () => {
    vi.stubEnv('VITE_WS_URL', '');
    expect(getLobbyHttpBaseUrl()).toBe(window.location.origin);
  });
});
