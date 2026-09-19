import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraView } from './CameraView';
import { __resetCameraViewSharedStateForTests } from './cameraStream';

describe('CameraView', () => {
  const trackStop = vi.fn();
  const fakeStream = {
    getTracks: () => [{ stop: trackStop }],
  } as unknown as MediaStream;

  beforeEach(() => {
    vi.useFakeTimers();
    trackStop.mockReset();
    __resetCameraViewSharedStateForTests();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(fakeStream),
      },
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      writable: true,
      value: null,
    });

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    __resetCameraViewSharedStateForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests webcam when running and stops tracks when stopped', async () => {
    const { rerender, unmount } = render(<CameraView isRunning={true} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    rerender(<CameraView isRunning={false} />);

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(trackStop).toHaveBeenCalledTimes(1);

    act(() => {
      unmount();
    });

    expect(trackStop).toHaveBeenCalledTimes(1);
  });

  it('keeps the stream alive across rapid remount handoff', async () => {
    const first = render(<CameraView isRunning={true} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    act(() => {
      first.unmount();
    });

    const second = render(<CameraView isRunning={true} />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(trackStop).toHaveBeenCalledTimes(0);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    act(() => {
      second.unmount();
      vi.advanceTimersByTime(900);
    });

    expect(trackStop).toHaveBeenCalledTimes(1);
  });

  it('does not report camera readiness before permission and playback succeed', async () => {
    let grant!: (stream: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(new Promise((resolve) => { grant = resolve; }));
    const ready = vi.fn();
    const { unmount } = render(<CameraView isRunning onVideoElementChange={ready} />);
    expect(ready.mock.calls.some(([video]) => video !== null)).toBe(false);
    await act(async () => { grant(fakeStream); });
    expect(ready).toHaveBeenCalledWith(expect.any(HTMLVideoElement));
    unmount();
  });

  it('releases a stream granted after its last consumer has left', async () => {
    let grant!: (stream: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(new Promise((resolve) => { grant = resolve; }));
    const { unmount } = render(<CameraView isRunning />);
    unmount();
    act(() => { vi.advanceTimersByTime(900); });
    await act(async () => { grant(fakeStream); });
    expect(trackStop).toHaveBeenCalledOnce();
  });

  it('retries a denied camera request without reloading the app', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error('Denied'));
    const ready = vi.fn();
    const { unmount } = render(<CameraView isRunning onVideoElementChange={ready} />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry Camera' })); });
    expect(ready).toHaveBeenCalledWith(expect.any(HTMLVideoElement));
    expect(screen.queryByText(/Unable to access webcam/)).not.toBeInTheDocument();
    unmount();
  });
});
