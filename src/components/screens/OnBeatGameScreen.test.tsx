import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OnBeatGameScreen } from './OnBeatGameScreen';

const props = { sessionId: 1, difficulty: 'level1' as const, onComplete: vi.fn(), onBackToSetup: vi.fn() };
class TestAudio extends EventTarget {
  static instances: TestAudio[] = [];
  readyState = 1;
  currentTime = 0;
  preload = '';
  loop = false;
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  constructor() { super(); TestAudio.instances.push(this); }
}

beforeEach(() => {
  TestAudio.instances = [];
  vi.stubGlobal('Audio', TestAudio);
  vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('keeps retry and back available after denied microphone permission', async () => {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('Denied')) } });
  render(<OnBeatGameScreen {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Enable Computer Mic' }));
  expect((await screen.findAllByText(/permission was blocked/)).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Enable Computer Mic' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Back To Setup' }));
  expect(props.onBackToSetup).toHaveBeenCalledOnce();
});

it('stops a microphone granted after leaving the screen', async () => {
  let grant!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>((resolve) => { grant = resolve; });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => pending } });
  const stop = vi.fn();
  const { unmount } = render(<OnBeatGameScreen {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Enable Computer Mic' }));
  unmount();
  await act(async () => { grant({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
  expect(stop).toHaveBeenCalledOnce();
});

it('completes a local manual round without microphone or transcription credentials', async () => {
  render(<OnBeatGameScreen {...props} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start Challenge' })); });
  expect(screen.getByRole('heading', { name: 'Countdown' })).toBeInTheDocument();
  const audio = TestAudio.instances[0];
  audio.currentTime = 999;
  const tick = vi.mocked(window.requestAnimationFrame).mock.calls.at(-1)![0];
  act(() => tick(0));
  expect(props.onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 0, totalPrompts: expect.any(Number) }));
  expect(audio.pause).toHaveBeenCalled();
});

it('keeps Start and Back available after local audio playback fails', async () => {
  vi.stubGlobal('Audio', class extends TestAudio {
    play = vi.fn().mockRejectedValue(new Error('Playback blocked'));
  });
  render(<OnBeatGameScreen {...props} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start Challenge' })); });
  expect(screen.getAllByText(/Could not play.*audio/).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Start Challenge' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Back To Setup' })).toBeEnabled();
});
