# MVP Stabilization Design

## Goal

Make Jam Box Games reliable for a local host-and-phone demo while preserving a single-origin runtime model that can be deployed online later without client URL changes.

## Scope and order

Work proceeds in this order:

1. Restore deterministic local quality gates and standardize on pnpm.
2. Make the web app, lobby WebSocket, and transcription API same-origin in production, with equivalent Vite development proxies.
3. Stabilize and regression-test the self-contained host and phone game flows: pairing, Jam Hero, On Beat, and Know Your Lyrics.
4. Make Spotify and YouTube integrations optional, configured, and failure-tolerant; they must not block the self-contained flows.
5. Document local/LAN operation and the production handoff. Evaluate bundle splitting against a real phone test rather than treating the current build-size warning as an automatic blocker.

## Architecture

### Runtime topology

Production uses one Node HTTP server that:

- serves the built Vite application;
- upgrades same-origin `/ws` requests to the lobby WebSocket server; and
- handles same-origin `/api/transcribe` requests.

The browser derives both WebSocket and HTTP endpoints from `window.location.origin` by default. `VITE_WS_URL` remains an explicit override for unusual development or hosted topologies. No default may point a paired phone at `localhost`.

During development, Vite continues to serve the client and proxies both `/ws` and `/api` to the Node server. The development command starts both processes. This preserves LAN pairing through the URL used to open Vite.

### Package and runtime policy

- pnpm is the sole documented and committed package manager.
- `pnpm-lock.yaml` is committed; the obsolete npm lockfile is removed as part of the same migration.
- `package.json` declares the supported Node version and pnpm package-manager version.
- Tests must not depend on Node's process-level experimental localStorage. Vitest provides a deterministic jsdom storage implementation or configuration for all test files.

### Game-flow policy

The release gate includes these credential-free flows:

- host creates a lobby and a phone pairs over the LAN URL;
- Jam Hero reaches gameplay and results with camera/audio permissions handled safely;
- On Beat works with its local audio prompt and microphone permission/error states;
- Know Your Lyrics can complete a bundled track flow and presents useful transcription-service errors when the server key is absent.

Spotify and YouTube are integrations, not prerequisites. Missing credentials, authorization refusal, browser API failures, quota failures, or upstream failures must leave the user in a recoverable setup screen and must not break navigation or another game.

## Error handling

- Network endpoint construction is centralized and covered by unit tests for local, HTTPS, and explicit-override URLs.
- The server limits malformed, oversized, and unsupported transcription requests before forwarding them upstream, and returns JSON errors without exposing credentials.
- UI effects clean up media streams, timers, and socket listeners when the user changes screen or retries.
- Lint violations are resolved at their cause; dependencies are complete and hook dependencies reflect actual state inputs.

## Testing and release gates

Every atomic implementation task follows test-first work where behavior changes, then runs its focused test, `pnpm lint`, `pnpm test`, and `pnpm build` before its commit when the task affects shared behavior. The final release check runs all three commands plus a manual LAN smoke test:

1. Start with `pnpm dev` on the host.
2. Open the displayed LAN URL from two phones.
3. Pair both phones to one lobby.
4. Exercise one complete round in Jam Hero, On Beat, and Know Your Lyrics.
5. Verify missing Spotify/YouTube credentials show actionable setup states and do not block a bundled game.

## Key implementation checkpoints

### Checkpoint 1: Toolchain is reproducible

**Deliverable:** pnpm is the only package workflow and the test runtime supplies browser storage deterministically.

**Exit evidence:** a clean checkout can run `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm test`, and `pnpm build`; the App home-flow suite runs without `localStorage` failures.

**Commit boundary:** package-manager metadata, documentation, and the test-environment fix are committed together because they establish one reproducible development baseline.

### Checkpoint 2: Same-origin host/phone transport works

**Deliverable:** the Node runtime owns `/ws` and `/api/transcribe` in production, while Vite proxies both paths in development; endpoint resolution defaults to the browser origin.

**Exit evidence:** unit tests cover HTTP and WebSocket URL derivation for HTTP, HTTPS, and explicit override cases. A host and phone opened through the Vite LAN URL join the same lobby without setting `VITE_WS_URL`; a phone transcription request reaches the host API rather than phone-local `localhost`.

**Commit boundary:** server routing, Vite proxy configuration, endpoint utility changes, and their tests are committed together.

### Checkpoint 3: Credential-free game loops are reliable

**Deliverable:** pairing, Jam Hero, On Beat, and bundled-track Know Your Lyrics navigate from setup through gameplay and results with safe retry/back behavior.

**Exit evidence:** automated tests cover every route transition and the host/phone message contract needed by On Beat and Lyrics. Manual LAN smoke testing demonstrates two paired phones completing one round in each game; denied camera/microphone permission shows recovery UI and does not strand the session.

**Commit boundary:** one commit per independently testable game-flow correction. Do not mix flow fixes with external-service integration work.

### Checkpoint 4: External integrations fail safely

**Deliverable:** Spotify and YouTube setup, authorization, API, quota, and playback failures remain isolated to their respective setup flows.

**Exit evidence:** tests cover missing configuration and failed upstream responses. Manual testing verifies a missing key/client ID presents actionable guidance, and the user can return to the menu or launch a bundled game without a page reload.

**Commit boundary:** Spotify and YouTube corrections are separate commits because their configuration and failure modes are independent.

### Checkpoint 5: Release candidate is usable on phones

**Deliverable:** concise local/LAN and hosted-runtime documentation, plus a measured decision about code splitting.

**Exit evidence:** the final `pnpm lint`, `pnpm test`, and `pnpm build` all succeed. The LAN smoke script succeeds on the intended host browser and two phones. Record the production bundle sizes and either keep the current chunks with observed acceptable phone load time or add only the splits justified by the measurement.

**Commit boundary:** release documentation and any measured performance fix are separate atomic commits.

## Commit policy

After each concrete, independently verifiable change, make one atomic commit. Commit messages have a concise subject and a body of one or two concise lines, with no co-author attribution. Existing unrelated working-tree changes are never staged or included.

## Non-goals

- Building a hosted infrastructure platform, database, accounts, or persistent lobbies.
- Replacing the in-memory lobby protocol.
- Requiring Spotify, YouTube, or an OpenAI key for the baseline local demo.
- Splitting bundles before measured phone testing establishes a user-visible need.
