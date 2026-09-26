# MVP Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reproducible, local-network MVP whose host and phones use same-origin realtime and transcription endpoints, whose core games pass automated and manual release gates, and whose optional Spotify and YouTube integrations fail safely.

**Architecture:** Keep Vite as the development client server and the Node lobby process as the runtime service. Extract browser-origin endpoint resolution into a tested network utility; in development Vite proxies `/ws` and `/api`, while production Node serves `dist`, `/ws`, and `/api/transcribe` on one origin. Stabilize React effects at their source rather than suppressing lint rules.

**Tech Stack:** pnpm, Node.js, Vite, React 19, TypeScript, Vitest, Testing Library, ws, TensorFlow.js, Tone.js.

**Spec:** `docs/superpowers/specs/2026-09-13-mvp-stabilization-design.md`

## Current Progress (reconciled 2026-09-26)

- Tasks 1–4 are complete and merged to `main` through `3327b59`.
- Task 5 automated corrections and coverage are complete and merged through `48d3e0a`; its physical host/two-phone gate remains open.
- Tasks 6–7 have not started.
- Latest post-merge evidence on `48d3e0a`: `pnpm lint` passed, `pnpm test` passed 143/143 tests across 44 files, and `pnpm build` passed with the existing large-chunk advisory.

## Global Constraints

- Use pnpm exclusively; do not recreate or commit `package-lock.json`.
- Preserve unrelated working-tree changes; stage only files belonging to the current task.
- Every behavior change starts with a focused failing test and ends with its focused passing test.
- Before every task commit, run `pnpm lint`, `pnpm test`, and `pnpm build` when the task changes shared behavior.
- Each task commit has a concise subject and a body of one or two concise lines, with no co-author attribution.
- Spotify, YouTube, and `OPENAI_API_KEY` are optional for the baseline local demo; their absence must never block a bundled game.

## File Structure

- `package.json` — pnpm/Node metadata and canonical developer scripts.
- `pnpm-lock.yaml`, `pnpm-workspace.yaml` — committed dependency resolution and pnpm workspace policy.
- `src/test/setup.ts` — deterministic browser API shims used by every Vitest test.
- `src/network/runtimeOrigin.ts` — pure same-origin HTTP/WebSocket URL construction and explicit override support.
- `src/network/runtimeOrigin.test.ts` — endpoint resolution regression tests.
- `src/network/httpBase.ts` — transcription base URL adapter using `runtimeOrigin`.
- `src/lobby/LobbySessionProvider.tsx` — lobby client consuming the centralized WebSocket URL.
- `vite.config.ts` — development proxy for `/ws` and `/api`.
- `server/ws-lobby-server.mjs` — production Node runtime, static asset fallback, `/api/transcribe`, and WebSocket upgrade.
- `server/ws-lobby-server.test.mjs` — HTTP/runtime integration tests for health, static fallback, and safe transcription errors.
- `src/components/**`, `src/App.tsx`, and their tests — React-hook correctness and game-flow regression coverage.
- `README.md` — pnpm setup, local/LAN runbook, optional configuration, and online deployment contract.

---

### Task 1: Establish the reproducible pnpm and browser-test baseline

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `pnpm-workspace.yaml`
- Delete: `package-lock.json`
- Modify: `src/test/setup.ts`
- Modify: `README.md`
- Test: `src/App.home-flow.test.tsx`

**Consumes:** Existing pnpm lock/workspace files and the failing `window.localStorage.clear()` setup in `src/App.home-flow.test.tsx`.

**Produces:** A committed pnpm-only install contract and a test environment in which `window.localStorage` implements the `Storage` API in every test worker.

- [x] **Step 1: Add an explicit regression assertion for the browser test baseline**

Add a setup-level test or the first assertion in `App.home-flow.test.tsx` that verifies storage can be cleared and read:

```ts
window.localStorage.clear();
window.localStorage.setItem('mvp-test', 'ok');
expect(window.localStorage.getItem('mvp-test')).toBe('ok');
```

- [x] **Step 2: Run the focused test and record the current failure**

Run: `pnpm vitest run src/App.home-flow.test.tsx`

Expected: the suite fails before render because `window.localStorage` is unavailable under the active Node runtime.

- [x] **Step 3: Implement the deterministic storage setup**

In `src/test/setup.ts`, install an in-memory `Storage` implementation only when jsdom does not provide a usable `window.localStorage`; expose `getItem`, `setItem`, `removeItem`, `clear`, `key`, and `length`. Reset it between tests so state cannot leak. Do not depend on `NODE_OPTIONS` or Node's `--localstorage-file` flag.

- [x] **Step 4: Make pnpm the single documented toolchain**

Verify the pnpm lockfile describes `package.json`, add an `engines.node` floor compatible with the selected test stack, and keep `pnpm-workspace.yaml`. Update all README commands to `pnpm install`, `pnpm dev`, `pnpm test`, and `pnpm build`; explain that `pnpm dev` starts Vite and the lobby process. Commit the existing removal of `package-lock.json` only after confirming it is the obsolete npm lockfile. Do not add `packageManager` metadata that produces duplicate pnpm workspace importers.

- [x] **Step 5: Verify the baseline**

Run:

```bash
pnpm install --frozen-lockfile
pnpm vitest run src/App.home-flow.test.tsx
pnpm lint
pnpm test
pnpm build
```

Expected: the storage failure is gone. Remaining lint failures are documented as the next task's work; no command may fail because npm and pnpm disagree.

- [x] **Step 6: Commit the baseline atomically**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml package-lock.json src/test/setup.ts README.md src/App.home-flow.test.tsx
git commit -m "chore: standardize pnpm test baseline" -m "Provide deterministic browser storage for Vitest."
```

### Task 2: Clear React correctness lint failures without suppressions

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/CameraView.tsx`
- Modify: `src/components/OverlayCanvas.tsx`
- Modify: `src/components/jam/TimingCallout.tsx`
- Modify: `src/components/lobby/LobbyPairingPanel.tsx`
- Modify: `src/components/screens/LyricsGameScreen.tsx`
- Modify: `src/components/screens/LyricsSetupScreen.tsx`
- Modify: `src/components/screens/PhonePlayerScreen.tsx`
- Modify: `src/components/screens/VsBattleScreen.tsx`
- Modify: `src/lobby/useLobbySession.tsx`
- Create: narrowly scoped `*.test.tsx` tests beside each changed screen where current coverage does not express the corrected lifecycle.

**Consumes:** The 15 current ESLint errors and 4 hook warnings.

**Produces:** A zero-error, zero-warning lint run with behavior-preserving lifecycle tests.

- [x] **Step 1: Add focused lifecycle tests**

Extend existing tests to cover the state transitions currently initialized or reset inside effects: route changes in `App.home-flow.test.tsx`, initial lyrics result state in `LyricsGameScreen`, automatic YouTube loading in `LyricsSetupScreen`, Spotify playback reset in `VsBattleScreen`, and phone playlist refresh in `PhonePlayerScreen`.

- [x] **Step 2: Run the targeted tests and lint to capture current errors**

Run: `pnpm lint` and the new focused tests.

Expected: React hook rules report synchronous state-setting effects, render-time ref access, manual memoization dependency mismatch, and non-component exports.

- [x] **Step 3: Move derived and reset state to explicit boundaries**

Replace each synchronous reset effect with one of: a lazy initial state keyed by props, a reducer/action invoked by the route or user event that changes the session, or an asynchronous subscription callback. In particular, do not read `cueResultsByPlayerRef.current` while initializing render state in `LyricsGameScreen`; create the initial matrix with a lazy `useState` initializer and synchronize the ref after state creation.

- [x] **Step 4: Make hook dependencies and exports structurally correct**

Use `useCallback`/`useMemo` only when their complete dependencies are stable, include the actual referenced values in effects, and move non-component test-reset exports from `CameraView`, `OverlayCanvas`, and `useLobbySession` into focused helper modules. Do not disable ESLint or React Compiler rules.

- [x] **Step 5: Verify behavior and all static gates**

Run:

```bash
pnpm vitest run src/App.home-flow.test.tsx src/components/screens/LyricsGameScreen.test.tsx src/components/screens/LyricsSetupScreen.test.tsx src/components/screens/VsBattleScreen.test.tsx
pnpm lint
pnpm test
pnpm build
```

Expected: all commands exit zero with no lint warnings.

- [x] **Step 6: Commit the lint stabilization**

```bash
git add src/App.tsx src/components src/lobby src/test
git commit -m "fix: stabilize React screen lifecycles" -m "Remove invalid effect and memoization patterns."
```

Task 2 verification (2026-09-19): `pnpm lint` exits zero without warnings; `pnpm test` passes 110 tests across 41 files; `pnpm build` succeeds with the existing large-chunk advisory. Independent review caught a hidden phone playlist failure; its failure-and-retry test was confirmed red before the fix and green afterward. Other lifecycle coverage was added alongside refactoring, rather than entirely beforehand. Nested worktrees are excluded from lint/test discovery; helper extractions preserve camera/drawing behavior.

Follow-up coverage retained for Tasks 5–6: camera start/stop/restart and successful Spotify autoplay/cancelled transfer across rounds. Hardware/LAN and real Spotify checks are not proven by these unit tests.

### Task 3: Centralize same-origin endpoint construction

**Files:**
- Create: `src/network/runtimeOrigin.ts`
- Create: `src/network/runtimeOrigin.test.ts`
- Modify: `src/network/httpBase.ts`
- Modify: `src/lobby/LobbySessionProvider.tsx`

**Consumes:** `window.location.origin` and optional `VITE_WS_URL`.

**Produces:** `getRuntimeWebSocketUrl(origin, override?)` and `getRuntimeHttpBaseUrl(origin, override?)`, which return same-origin paths by default and derive HTTP/HTTPS from the explicit WebSocket override.

- [x] **Step 1: Write endpoint contract tests**

Cover these exact cases:

```ts
expect(getRuntimeWebSocketUrl('http://192.168.1.20:5173')).toBe('ws://192.168.1.20:5173/ws');
expect(getRuntimeWebSocketUrl('https://play.example.com')).toBe('wss://play.example.com/ws');
expect(getRuntimeHttpBaseUrl('https://play.example.com')).toBe('https://play.example.com');
expect(getRuntimeHttpBaseUrl('https://ignored.example', 'wss://api.example/ws')).toBe('https://api.example');
```

- [x] **Step 2: Run the focused tests to verify the current localhost defect**

Run: `pnpm vitest run src/network/runtimeOrigin.test.ts`

Expected: failure because the module and same-origin HTTP behavior do not exist; current `httpBase.ts` resolves to `http://localhost:8080`.

- [x] **Step 3: Implement the pure URL utility and adopt it**

Use `new URL()` to set protocol and `/ws` pathname without retaining search/hash. Browser callers pass `window.location.origin`; server-side fallback is only for SSR/test safety and is never used by a phone. Replace local `defaultWsUrl` and `DEFAULT_WS_URL` behavior with this utility.

- [x] **Step 4: Verify endpoint behavior**

Run: `pnpm vitest run src/network/runtimeOrigin.test.ts src/components/lobby/LobbyPairingPanel.test.tsx`

Expected: endpoint cases and existing pairing-link tests pass.

- [x] **Step 5: Commit the client endpoint contract**

```bash
git add src/network/runtimeOrigin.ts src/network/runtimeOrigin.test.ts src/network/httpBase.ts src/lobby/LobbySessionProvider.tsx
git commit -m "fix: derive phone endpoints from origin" -m "Keep local and hosted clients on one runtime contract."
```

Task 3 completed in `e37f600`. Focused endpoint/pairing tests passed 11/11; the full suite passed 119/119 with clean lint and a successful build.

### Task 4: Make the Node server a same-origin production runtime

**Files:**
- Modify: `server/ws-lobby-server.mjs`
- Create: `server/ws-lobby-server.test.mjs`
- Modify: `server/dev.mjs`
- Modify: `vite.config.ts`
- Modify: `package.json`

**Consumes:** `dist/` built by Vite and the endpoint contract from Task 3.

**Produces:** Node production start command serving static files, SPA fallback, `/health`, `/api/transcribe`, and WebSocket upgrades on one origin; Vite proxies `/ws` and `/api` locally.

- [x] **Step 1: Write HTTP integration tests around a constructible server**

Refactor the server to export a `createJamboxServer({ distDir, openAiApiKey, fetchImpl })` factory while retaining the executable listener entry point. Test `/health` returns JSON, a known built asset is served with a correct content type, unknown client routes return `index.html`, and a transcription request with no key returns the existing safe JSON error.

- [x] **Step 2: Run the focused server tests and confirm they fail**

Run: `pnpm vitest run server/ws-lobby-server.test.mjs`

Expected: failure until the factory/static handling exists.

- [x] **Step 3: Add static serving and SPA fallback safely**

Resolve requested static paths under the configured `distDir`, reject traversal outside it, set content types for HTML/JS/CSS/images/audio, serve static assets before the SPA fallback, and leave `/health`, `/api/transcribe`, and the `WebSocketServer` behavior intact. Cap request-body bytes and reject invalid/unsupported audio payloads before upstream transcription forwarding.

- [x] **Step 4: Align development and production scripts**

Add a production `start` script that serves `dist`, keep `pnpm dev` as the Vite-plus-Node launcher, and configure Vite proxies for both `/ws` (with `ws: true`) and `/api` to port 8080. Do not hard-code a LAN IP or introduce CORS as a substitute for same-origin routing.

- [x] **Step 5: Verify the runtime contract**

Run:

```bash
pnpm vitest run server/ws-lobby-server.test.mjs src/network/runtimeOrigin.test.ts
pnpm lint
pnpm test
pnpm build
pnpm start
```

With `pnpm start` running, request `/health`, `/`, and a built asset; verify a WebSocket client can connect at `/ws`. Stop the server cleanly after the check.

- [x] **Step 6: Commit the same-origin runtime**

```bash
git add server/ws-lobby-server.mjs server/ws-lobby-server.test.mjs server/dev.mjs vite.config.ts package.json
git commit -m "feat: serve jambox from one origin" -m "Proxy API and WebSocket traffic during development."
```

Task 4 verification (2026-09-19): 131 tests pass, lint is clean, and build succeeds. Production `pnpm start` returned health JSON, HTML and built JavaScript and accepted `/ws`; `pnpm dev` forwarded both `/api/transcribe` and `/ws`. Tests cover traversal/symlink rejection, malformed/oversized audio, missing configuration, sanitized upstream failures, and a valid 4.5 MiB recording. Physical two-phone testing is still pending.

### Task 5: Lock down credential-free host and phone game flows

**Files:**
- Modify: `src/App.home-flow.test.tsx`
- Modify/Create: `src/components/lobby/LobbyPairingPanel.test.tsx`
- Modify/Create: `src/components/screens/OnBeatGameScreen.test.tsx`
- Modify/Create: `src/components/screens/PhonePlayerScreen.test.tsx`
- Modify/Create: `src/components/screens/LyricsGameScreen.test.tsx`
- Modify: only the matching production screens when a test exposes a defect.

**Consumes:** Working test storage and endpoint/runtime behavior from Tasks 1–4.

**Produces:** Automated coverage proving the baseline games remain navigable with no Spotify, YouTube, or OpenAI credentials.

- [x] **Step 1: Add route and recovery tests**

Add tests for: lobby-to-home navigation; bundled Jam Hero setup-to-results; On Beat with a denied microphone and a retry/back action; Know Your Lyrics using `LYRICS_TRACKS` without a YouTube key; and phone controller rendering from a valid phone query without browser media APIs.

- [x] **Step 2: Run the focused suites and document failures**

Run:

```bash
pnpm vitest run src/App.home-flow.test.tsx src/components/lobby/LobbyPairingPanel.test.tsx src/components/screens/OnBeatGameScreen.test.tsx src/components/screens/PhonePlayerScreen.test.tsx src/components/screens/LyricsGameScreen.test.tsx
```

Expected: only behavior gaps exposed by the new assertions fail.

- [x] **Step 3: Correct one game-flow defect at a time**

For each failure, make the smallest screen or protocol change that preserves a retry/back route, stops media resources on unmount, and returns an actionable permission/transcription message. Re-run the focused test after each correction; do not bundle unrelated game changes.

- [x] **Step 4: Commit each independently verified flow correction**

Use one commit per game or pairing correction, for example:

```bash
git add src/components/screens/OnBeatGameScreen.tsx src/components/screens/OnBeatGameScreen.test.tsx
git commit -m "fix: recover from denied on-beat microphone" -m "Keep setup navigation available after permission failure."
```

- [ ] **Step 5: Verify the credential-free release gate**

Run: `pnpm lint && pnpm test && pnpm build`

Then manually run `pnpm dev`, open the displayed LAN URL on two phones, pair them, and complete a round in Jam Hero, On Beat, and a bundled Lyrics track.

Automated evidence (2026-09-19): camera readiness waits for successful playback and has an in-app permission retry; late camera/microphone grants release their tracks after leaving; On Beat can complete in local manual mode and recover from audio playback failure; bundled Lyrics reaches completion without media APIs; mobile links reach controller waiting UI. The Jam Hero route test simulates its live-input boundary, not physical calibration. Real loopback sockets verify a host, two phones and Lyrics message relay.

Task 5 automated work was committed separately in `06db5f9`, `8a6306e`, `2ddbca3`, and `48d3e0a`, then fast-forwarded to `main`. Post-merge verification passed 143/143 tests across 44 files, clean lint, and a production build. Step 5 remains unchecked because physical-device evidence has not been supplied.

Remaining device checks (do not mark complete from automated tests):

- [ ] Host browser: grant/deny/retry camera, complete calibration and a Jam Hero round, then replay.
- [ ] Two physical phones: open the host address, pair both, and receive Lyrics prompts.
- [ ] Complete an On Beat manual round and a bundled Lyrics round; verify navigation after denied microphone access.
- [ ] Phone recording: use a trusted HTTPS origin, since plain LAN HTTP may not expose microphone APIs. Verify missing transcription configuration shows an error and preserves navigation.
- [ ] Record host/phone browsers, results and observed load times before advancing to optional integrations.

### Task 6: Harden Spotify and YouTube as optional integrations

**Files:**
- Modify: `src/spotify/client.ts`
- Modify: `src/components/screens/VsSetupScreen.tsx`
- Modify: `src/components/screens/VsBattleScreen.tsx`
- Modify: `src/components/screens/PhonePlayerScreen.tsx`
- Modify: `src/game/lyricsLibrary.ts`
- Modify: `src/components/screens/LyricsSetupScreen.tsx`
- Modify/Create: matching `*.test.tsx` and `*.test.ts` files.

**Consumes:** Core navigation and error/recovery pattern verified in Task 5.

**Produces:** Explicit configuration, authorization, quota, upstream, and playback errors that remain isolated to the optional flow.

- [ ] **Step 1: Write failure-mode tests**

Mock Spotify authorization/API failures and YouTube search/lyrics failures. Assert each setup screen shows a concise actionable message and retains Back/Menu and bundled-track choices; assert no missing `VITE_SPOTIFY_CLIENT_ID` or YouTube key throws during initial render.

- [ ] **Step 2: Run focused tests to establish gaps**

Run: `pnpm vitest run src/components/screens/VsSetupScreen.test.tsx src/components/screens/VsBattleScreen.test.tsx src/components/screens/PhonePlayerScreen.test.tsx src/components/screens/LyricsSetupScreen.test.tsx src/game/lyricsLibrary.test.ts`

- [ ] **Step 3: Implement isolated recovery behavior**

Normalize upstream errors at each client boundary, retain selectable bundled lyrics tracks after YouTube failure, retain the manual/embedded Spotify fallback after authorization or playback failure, and make retry actions explicit user actions rather than mount effects.

- [ ] **Step 4: Verify optional integrations and core isolation**

Run the focused suites, then `pnpm lint && pnpm test && pnpm build`. Manually test with no integration variables and verify all core game routes remain usable.

- [ ] **Step 5: Commit integrations separately**

```bash
git add src/spotify src/components/screens/VsSetupScreen.tsx src/components/screens/VsBattleScreen.tsx src/components/screens/PhonePlayerScreen.tsx
git commit -m "fix: recover from Spotify integration failures" -m "Keep battle setup usable without a connected account."

git add src/game/lyricsLibrary.ts src/components/screens/LyricsSetupScreen.tsx
git commit -m "fix: recover from YouTube search failures" -m "Keep bundled lyrics tracks available offline."
```

### Task 7: Document and certify the phone-ready release candidate

**Files:**
- Modify: `README.md`
- Create: `docs/release/mvp-lan-smoke-checklist.md`
- Modify: `vite.config.ts` or route-level imports only if measurement justifies code splitting.

**Consumes:** All preceding release gates.

**Produces:** A copyable local/LAN runbook, hosted deployment contract, manual smoke checklist, and measured bundle decision.

- [ ] **Step 1: Add the LAN and hosted runbook**

Document `pnpm install --frozen-lockfile`, `pnpm dev`, how to identify and open the LAN URL, all optional environment variables, `pnpm build && pnpm start` for one-origin hosting, required HTTPS for remote camera/microphone access, and the fact that no client URL override is needed for standard local or hosted use.

- [ ] **Step 2: Add a markable manual smoke checklist**

Create `docs/release/mvp-lan-smoke-checklist.md` with checkbox rows for host startup, two-phone pairing, Jam Hero, On Beat, bundled Lyrics, denied permissions, missing integration keys, and final automated command output.

- [ ] **Step 3: Measure before splitting**

Run `pnpm build`, record the emitted chunk sizes, and test first load on the target phones over the intended LAN. Only add route-level `React.lazy` imports or Rollup manual chunks if load time or memory is demonstrably unacceptable; add a route-render regression test for every deferred screen.

- [ ] **Step 4: Run final verification**

Run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

Complete every checkbox in `docs/release/mvp-lan-smoke-checklist.md` on the target host and two phones. Record the date, browser versions, and observed bundle/load result in the checklist rather than claiming a phone test that was not performed.

- [ ] **Step 5: Commit release artifacts atomically**

```bash
git add README.md docs/release/mvp-lan-smoke-checklist.md
git commit -m "docs: add MVP LAN release checklist" -m "Document local operation and final verification gates."
```

If measured code splitting is required, make it a separate commit with its own focused route test and one-line performance rationale.

## Final Acceptance Checklist

Status note (2026-09-26): the automated commands and same-origin runtime have prior passing evidence, but these final checkboxes remain open until Task 7 performs the clean release rerun and records physical-device results.

- [ ] `pnpm install --frozen-lockfile` succeeds from a clean checkout.
- [ ] `pnpm lint` succeeds with zero errors and warnings.
- [ ] `pnpm test` succeeds with all current and newly added tests.
- [ ] `pnpm build` succeeds.
- [ ] `pnpm dev` supports host-and-two-phone LAN pairing without `VITE_WS_URL`.
- [ ] `pnpm build && pnpm start` serves the app, `/ws`, `/health`, and `/api/transcribe` on one origin.
- [ ] Jam Hero, On Beat, and bundled Know Your Lyrics complete one LAN-tested round.
- [ ] Missing Spotify, YouTube, and OpenAI configuration produces recoverable UI and does not block the self-contained games.
- [ ] The release smoke checklist contains actual device/browser verification evidence.
