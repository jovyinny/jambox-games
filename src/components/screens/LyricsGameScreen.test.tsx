import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LYRICS_TRACKS } from '../../game/lyricsCatalog.generated';
import { LobbySessionProvider } from '../../lobby/LobbySessionProvider';
import { LyricsGameScreen } from './LyricsGameScreen';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('initializes both players at zero with a ready bundled round', () => {
  render(<LobbySessionProvider><LyricsGameScreen sessionId={1} track={LYRICS_TRACKS[0]} onComplete={vi.fn()} onBackToSetup={vi.fn()} /></LobbySessionProvider>);
  expect(screen.getByText('P1 0')).toBeInTheDocument();
  expect(screen.getByText('P2 0')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start Lyrics Run' })).toBeEnabled();
});

it('releases a laptop microphone granted after leaving lyrics', async () => {
  let grant!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>((resolve) => { grant = resolve; });
  vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => pending } });
  const stop = vi.fn();
  const { unmount } = render(<LobbySessionProvider><LyricsGameScreen sessionId={1} track={LYRICS_TRACKS[0]} onComplete={vi.fn()} onBackToSetup={vi.fn()} /></LobbySessionProvider>);
  unmount();
  await act(async () => { grant({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
  expect(stop).toHaveBeenCalledOnce();
});

it('finishes a bundled track without microphone or YouTube access', async () => {
  vi.stubGlobal('Audio', class { currentTime = 0; loop = false; play = () => Promise.resolve(); pause = () => {}; });
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  const complete = vi.fn();
  render(<LobbySessionProvider><LyricsGameScreen sessionId={1} track={LYRICS_TRACKS[0]} onComplete={complete} onBackToSetup={vi.fn()} /></LobbySessionProvider>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start Lyrics Run' })); });
  now.mockReturnValue(999_999);
  const tick = vi.mocked(window.requestAnimationFrame).mock.calls.at(-1)![0];
  act(() => tick(999_999));
  expect(complete).toHaveBeenCalledOnce();
});
