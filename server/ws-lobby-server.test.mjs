// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createJamboxServer } from './ws-lobby-server.mjs';

let root;
let runtime;
let origin;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'jambox-runtime-'));
  await mkdir(join(root, 'dist', 'assets'), { recursive: true });
  await writeFile(join(root, 'dist', 'index.html'), '<h1>Jambox</h1>');
  await writeFile(join(root, 'dist', 'assets', 'app.js'), 'window.jambox = true;');
  await writeFile(join(root, 'secret.txt'), 'private');
  await symlink(join(root, 'secret.txt'), join(root, 'dist', 'leak.txt'));
});

afterEach(async () => {
  if (runtime) {
    for (const client of runtime.wss.clients) client.terminate();
    await new Promise((resolve) => runtime.wss.close(resolve));
    runtime.server.closeAllConnections();
    await new Promise((resolve) => runtime.server.close(resolve));
    runtime = undefined;
  }
  await rm(root, { recursive: true, force: true });
});

async function start(options = {}) {
  runtime = createJamboxServer({ distDir: join(root, 'dist'), openAiApiKey: '', ...options });
  runtime.server.listen(0, '127.0.0.1');
  await once(runtime.server, 'listening');
  origin = `http://127.0.0.1:${runtime.server.address().port}`;
}

function post(body, headers = { 'Content-Type': 'application/json' }) {
  return fetch(`${origin}/api/transcribe`, { method: 'POST', headers, body });
}

describe('same-origin runtime', () => {
  it('serves health, built assets and client routes on the same listener', async () => {
    await start();
    expect(await (await fetch(`${origin}/health`)).json()).toEqual({ ok: true });
    const asset = await fetch(`${origin}/assets/app.js`);
    expect(asset.headers.get('content-type')).toMatch(/javascript/);
    expect(await asset.text()).toBe('window.jambox = true;');
    const page = await fetch(`${origin}/play/lyrics`);
    expect(page.headers.get('content-type')).toMatch(/text\/html/);
    expect(await page.text()).toBe('<h1>Jambox</h1>');
    expect((await fetch(`${origin}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${origin}/api/missing`)).status).toBe(404);
  });

  it('blocks traversal and symlinks escaping the dist directory', async () => {
    await start();
    const status = await new Promise((resolve, reject) => {
      const req = request(`${origin}`, { path: '/%2e%2e%2fsecret.txt' }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
    expect((await fetch(`${origin}/leak.txt`)).status).toBe(403);
  });

  it('accepts the lobby socket at /ws', async () => {
    await start();
    const socket = new WebSocket(origin.replace('http:', 'ws:') + '/ws');
    const [raw] = await once(socket, 'message');
    expect(JSON.parse(String(raw))).toMatchObject({ type: 'connected', clientId: expect.any(String) });
    socket.close();
    await once(socket, 'close');
  });

  it('returns a safe actionable error when transcription is unconfigured', async () => {
    await start();
    const response = await post('{}');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'OPENAI_API_KEY is not configured on the server.' });
  });

  it.each([
    ['malformed JSON', '{', 400],
    ['null payload', 'null', 400],
    ['invalid base64', JSON.stringify({ audioBase64: '???' }), 400],
    ['unsupported MIME', JSON.stringify({ audioBase64: 'dGVzdA==', mimeType: 'text/html' }), 415],
    ['oversized body', JSON.stringify({ audioBase64: 'A'.repeat(12 * 1024 * 1024) }), 413],
  ])('rejects %s', async (_name, body, status) => {
    await start({ openAiApiKey: 'test-only', fetchImpl: () => { throw new Error('Must not forward invalid input'); } });
    const response = await post(body);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });

  it('does not expose upstream credentials or internal errors', async () => {
    await start({ openAiApiKey: 'test-only', fetchImpl: async () => new Response(
      JSON.stringify({ error: { message: 'Private upstream detail: test-only' } }), { status: 401 },
    ) });
    const response = await post(JSON.stringify({ audioBase64: 'dGVzdA==' }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('test-only');
  });

  it('accepts a normal recording larger than a short test fixture', async () => {
    await start({ openAiApiKey: 'test-only', fetchImpl: async () => new Response(JSON.stringify({ text: 'hello' })) });
    const response = await post(JSON.stringify({ audioBase64: Buffer.alloc(4.5 * 1024 * 1024, 1).toString('base64') }));
    expect(response.status).toBe(200);
  });

  it('forwards supported audio and returns transcription text', async () => {
    await start({ openAiApiKey: 'test-only', fetchImpl: async (_url, options) => {
      const file = options.body.get('file');
      if (file.type !== 'audio/webm' || await file.text() !== 'test') {
        return new Response('{}', { status: 400 });
      }
      return new Response(JSON.stringify({ text: 'hello' }), { status: 200 });
    } });
    const response = await post(JSON.stringify({ audioBase64: 'dGVzdA==', mimeType: 'audio/webm' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: 'hello' });
  });
});
