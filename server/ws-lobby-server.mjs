import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

function loadDotEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) {
    return;
  }

  const contents = readFileSync(path, 'utf8');
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const AUDIO_TYPES = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' };
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function isWithin(root, filename) {
  const path = relative(root, filename);
  return path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path);
}

async function serveStatic(request, response, distDir, pathname) {
  const root = resolve(distDir);
  let filename = resolve(root, `.${pathname}`);
  if (!isWithin(root, filename)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }
  try {
    if (!await stat(filename).then((entry) => entry.isFile()).catch(() => false)) {
      if (extname(pathname) || pathname.startsWith('/assets/')) {
        sendJson(response, 404, { error: 'Not found' });
        return;
      }
      filename = resolve(root, 'index.html');
    }
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(filename)]);
    if (!isWithin(realRoot, realFile)) {
      sendJson(response, 403, { error: 'Forbidden' });
      return;
    }
    const body = await readFile(realFile);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(filename)] || 'application/octet-stream',
      'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    sendJson(response, 404, { error: 'App build not found. Run pnpm build first.' });
  }
}

export function createJamboxServer({
  distDir = resolve(process.cwd(), 'dist'),
  openAiApiKey = '',
  fetchImpl = fetch,
  transcriptionModel = 'gpt-4o-mini-transcribe',
} = {}) {

  /** @type {Map<string, { code: string; hostClientId: string; roomCodes: Set<string> }>} */
  const lobbies = new Map();
  /** @type {Map<string, { code: string; lobbyCode: string; name: string; phoneClientIds: Set<string> }>} */
  const rooms = new Map();
  /** @type {Map<import('ws').WebSocket, { id: string; role: 'host'|'phone'|null; lobbyCode: string | null; roomCode: string | null; phoneName: string | null; playerSlot: 1 | 2 | null }>} */
  const clients = new Map();

  function setCorsHeaders(response) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  function readJsonBody(request) {
    return new Promise((resolveBody, reject) => {
      const chunks = [];
      let bytes = 0;
      request.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) {
          chunks.length = 0;
          reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
          return;
        }
        chunks.push(chunk);
      });
      request.on('end', () => {
        if (bytes > MAX_BODY_BYTES) return;
        try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
        catch (error) { reject(error); }
      });
      request.on('error', reject);
    });
  }

  async function handleTranscriptionRequest(request, response) {
    if (!openAiApiKey) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'OPENAI_API_KEY is not configured on the server.' }));
      return;
    }

    let payload;
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      sendJson(response, 415, { error: 'Content-Type must be application/json.' });
      return;
    }
    try {
      payload = await readJsonBody(request);
    } catch (error) {
      sendJson(response, error.status || 400, { error: error.status === 413 ? 'Request body is too large.' : 'Malformed JSON body.' });
      return;
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      sendJson(response, 400, { error: 'Expected an audio payload object.' });
      return;
    }
    const audioBase64 = payload.audioBase64;
    const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType.split(';')[0].trim() : 'audio/webm';
    const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim().slice(0, 4000) : '';

    if (typeof audioBase64 !== 'string' || !audioBase64 || audioBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)
      || Buffer.from(audioBase64, 'base64').toString('base64') !== audioBase64) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Valid non-empty audioBase64 is required.' }));
      return;
    }
    if (!Object.hasOwn(AUDIO_TYPES, mimeType)) {
      sendJson(response, 415, { error: 'Unsupported audio type.' });
      return;
    }

    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const extension = AUDIO_TYPES[mimeType];
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([audioBuffer], { type: mimeType }),
        `speech.${extension}`,
      );
      formData.append('model', transcriptionModel);
      formData.append('language', 'en');
      formData.append('response_format', 'json');
      if (prompt) {
        formData.append('prompt', prompt);
      }

      const upstream = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
        },
        body: formData,
      });

      const result = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        response.writeHead(502, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            error: 'Transcription service is unavailable. Please try again later.',
          }),
        );
        return;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          text: typeof result?.text === 'string' ? result.text : '',
        }),
      );
    } catch {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Transcription proxy failed.' }));
    }
  }

  const server = createServer((request, response) => {
    setCorsHeaders(response);
    let pathname;
    try { pathname = decodeURIComponent((request.url || '/').split(/[?#]/)[0]); }
    catch { sendJson(response, 400, { error: 'Malformed URL' }); return; }

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method === 'POST' && pathname === '/api/transcribe') {
      void handleTranscriptionRequest(request, response);
      return;
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && pathname !== '/api' && !pathname.startsWith('/api/') && pathname !== '/ws' && pathname !== '/health') {
      void serveStatic(request, response, distDir, pathname);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  function randomCode(size, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') {
    let code = '';
    for (let i = 0; i < size; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  function uniqueCode(size, usedSet, alphabet) {
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const next = randomCode(size, alphabet);
      if (!usedSet.has(next)) {
        return next;
      }
    }
    throw new Error('Unable to generate unique code');
  }

  function send(ws, payload) {
    if (ws.readyState !== 1) {
      return;
    }
    ws.send(JSON.stringify(payload));
  }

  function createAccessPoint(lobbyCode) {
    const roomCode = uniqueCode(4, new Set(rooms.keys()));

    rooms.set(roomCode, {
      code: roomCode,
      lobbyCode,
      name: 'Lobby Access',
      phoneClientIds: new Set(),
    });

    return roomCode;
  }

  function roomSnapshot(room) {
    return {
      code: room.code,
      name: room.name,
      phoneCount: room.phoneClientIds.size,
      phones: [...room.phoneClientIds]
        .map((clientId) => [...clients.values()].find((entry) => entry.id === clientId)?.phoneName || 'Phone')
        .filter(Boolean),
    };
  }

  function lobbySnapshot(lobby) {
    return {
      code: lobby.code,
      rooms: [...lobby.roomCodes]
        .map((roomCode) => rooms.get(roomCode))
        .filter(Boolean)
        .map((room) => roomSnapshot(room)),
    };
  }

  function broadcastLobby(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) {
      return;
    }

    const snapshot = lobbySnapshot(lobby);

    for (const [ws, state] of clients.entries()) {
      if (state.lobbyCode === lobbyCode) {
        send(ws, { type: 'lobby_state', lobby: snapshot });
      }
    }
  }

  function cleanupClient(ws) {
    const state = clients.get(ws);
    if (!state) {
      return;
    }

    if (state.roomCode) {
      const room = rooms.get(state.roomCode);
      room?.phoneClientIds.delete(state.id);
    }

    if (state.role === 'host' && state.lobbyCode) {
      const lobby = lobbies.get(state.lobbyCode);
      if (lobby?.hostClientId === state.id) {
        for (const roomCode of lobby.roomCodes) {
          rooms.delete(roomCode);
        }
        lobbies.delete(state.lobbyCode);
      }
    }

    if (state.role === 'phone' && state.lobbyCode) {
      broadcastLobby(state.lobbyCode);
    }

    clients.delete(ws);
  }

  function requireConnected(clientState, ws) {
    if (!clientState) {
      send(ws, { type: 'error', message: 'Client not initialized' });
      return false;
    }
    return true;
  }

  wss.on('connection', (ws) => {
    const clientId = uniqueCode(8, new Set([...clients.values()].map((entry) => entry.id)));

    clients.set(ws, {
      id: clientId,
      role: null,
      lobbyCode: null,
      roomCode: null,
      phoneName: null,
      playerSlot: null,
    });

    send(ws, { type: 'connected', clientId });

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        send(ws, { type: 'error', message: 'Malformed JSON message' });
        return;
      }

      const clientState = clients.get(ws);
      if (!requireConnected(clientState, ws)) {
        return;
      }

      if (message.type === 'create_lobby') {
        const lobbyCode = uniqueCode(6, new Set(lobbies.keys()));
        const roomCode = createAccessPoint(lobbyCode);
        lobbies.set(lobbyCode, {
          code: lobbyCode,
          hostClientId: clientState.id,
          roomCodes: new Set([roomCode]),
        });
        clientState.role = 'host';
        clientState.lobbyCode = lobbyCode;
        clientState.roomCode = null;
        broadcastLobby(lobbyCode);
        return;
      }

      if (message.type === 'join_lobby') {
        const code = String(message.lobbyCode || '').toUpperCase();
        const lobby = lobbies.get(code);
        if (!lobby) {
          send(ws, { type: 'error', message: 'Lobby not found' });
          return;
        }

        clientState.role = clientState.role || 'host';
        clientState.lobbyCode = code;
        clientState.roomCode = null;
        send(ws, { type: 'lobby_state', lobby: lobbySnapshot(lobby) });
        return;
      }

      if (message.type === 'leave_lobby') {
        const previousLobby = clientState.lobbyCode;
        if (clientState.roomCode) {
          const room = rooms.get(clientState.roomCode);
          room?.phoneClientIds.delete(clientState.id);
        }
        clientState.lobbyCode = null;
        clientState.roomCode = null;
        clientState.phoneName = null;
        clientState.playerSlot = null;
        clientState.role = null;
        send(ws, { type: 'left_lobby' });
        if (previousLobby) {
          broadcastLobby(previousLobby);
        }
        return;
      }

      if (message.type === 'create_room') {
        send(ws, { type: 'error', message: 'Lobby now uses a single access point' });
        return;
      }

      if (message.type === 'pair_phone') {
        const lobbyCode = String(message.lobbyCode || '').toUpperCase();
        const phoneName = String(message.phoneName || 'Phone').trim().slice(0, 40) || 'Phone';
        const playerSlot = message.playerSlot === 1 || message.playerSlot === 2 ? message.playerSlot : null;
        const lobby = lobbies.get(lobbyCode);

        if (!lobby) {
          send(ws, { type: 'error', message: 'Lobby not found' });
          return;
        }

        const room = [...lobby.roomCodes]
          .map((code) => rooms.get(code))
          .find(Boolean);

        if (!room) {
          send(ws, { type: 'error', message: 'Lobby access point not found' });
          return;
        }

        clientState.role = 'phone';
        clientState.lobbyCode = lobbyCode;
        clientState.roomCode = room.code;
        clientState.phoneName = phoneName;
        clientState.playerSlot = playerSlot;
        room.phoneClientIds.add(clientState.id);

        send(ws, {
          type: 'paired',
          lobbyCode,
          roomCode: room.code,
          roomName: room.name,
          playerSlot: clientState.playerSlot ?? undefined,
        });

        broadcastLobby(lobbyCode);
        return;
      }

      if (message.type === 'select_round_track') {
        if (clientState.role !== 'phone' || !clientState.roomCode || !clientState.lobbyCode) {
          send(ws, { type: 'error', message: 'Phone must be paired before selecting a track' });
          return;
        }

        const playerSlot = message.playerSlot === 1 || message.playerSlot === 2 ? message.playerSlot : clientState.playerSlot;
        if (!playerSlot) {
          send(ws, { type: 'error', message: 'Player slot is required' });
          return;
        }

        for (const [targetWs, targetState] of clients.entries()) {
          if (targetState.roomCode === clientState.roomCode || targetState.lobbyCode === clientState.lobbyCode) {
            send(targetWs, {
              type: 'room_track_selected',
              roomCode: clientState.roomCode,
              playerSlot,
              trackId: String(message.trackId || ''),
              trackName: String(message.trackName || ''),
              artistNames: String(message.artistNames || ''),
              uri: String(message.uri || ''),
            });
          }
        }
        return;
      }

      if (message.type === 'publish_on_beat_state') {
        if (clientState.role !== 'host' || !clientState.lobbyCode) {
          send(ws, { type: 'error', message: 'Host must join a lobby before publishing On Beat state' });
          return;
        }

        for (const [targetWs, targetState] of clients.entries()) {
          if (targetState.lobbyCode === clientState.lobbyCode) {
            send(targetWs, {
              type: 'on_beat_state',
              state: message.state,
            });
          }
        }
        return;
      }

      if (message.type === 'submit_on_beat_attempt') {
        if (clientState.role !== 'phone' || !clientState.lobbyCode) {
          send(ws, { type: 'error', message: 'Phone must be paired before sending an On Beat attempt' });
          return;
        }

        for (const [targetWs, targetState] of clients.entries()) {
          if (targetState.lobbyCode === clientState.lobbyCode) {
            send(targetWs, {
              type: 'on_beat_attempt_recorded',
              attempt: message.attempt,
            });
          }
        }
        return;
      }

      if (message.type === 'publish_lyrics_state') {
        if (clientState.role !== 'host' || !clientState.lobbyCode) {
          send(ws, { type: 'error', message: 'Host must join a lobby before publishing lyrics state' });
          return;
        }

        for (const [targetWs, targetState] of clients.entries()) {
          if (targetState.lobbyCode === clientState.lobbyCode) {
            send(targetWs, {
              type: 'lyrics_state',
              state: message.state,
            });
          }
        }
        return;
      }

      if (message.type === 'submit_lyrics_attempt') {
        if (clientState.role !== 'phone' || !clientState.lobbyCode) {
          send(ws, { type: 'error', message: 'Phone must be paired before sending a lyrics attempt' });
          return;
        }

        for (const [targetWs, targetState] of clients.entries()) {
          if (targetState.lobbyCode === clientState.lobbyCode) {
            send(targetWs, {
              type: 'lyrics_attempt_recorded',
              attempt: message.attempt,
            });
          }
        }
        return;
      }

      send(ws, { type: 'error', message: 'Unknown message type' });
    });

    ws.on('close', () => {
      cleanupClient(ws);
    });

    ws.on('error', () => {
      cleanupClient(ws);
    });
  });

  return { server, wss };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  loadDotEnvFile('.env');
  loadDotEnvFile('.env.local');
  const port = Number(process.env.PORT || 8080);
  const { server, wss } = createJamboxServer({
    openAiApiKey: process.env.OPENAI_API_KEY || '',
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
  });
  server.listen(port, () => {
    console.log(`Jambox running on http://localhost:${port} (WebSocket: /ws)`);
  });
  const shutdown = () => {
    for (const client of wss.clients) client.terminate();
    wss.close();
    server.close();
    server.closeAllConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
