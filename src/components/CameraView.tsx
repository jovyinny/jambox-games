import { type ReactNode, useEffect, useRef, useState } from 'react';

interface CameraViewProps {
  isRunning: boolean;
  children?: (video: HTMLVideoElement | null) => ReactNode;
  onVideoElementChange?: (video: HTMLVideoElement | null) => void;
}

import { acquireSharedStream, getSharedVideoElement, releaseStreamConsumer, retainStreamConsumer, sharedVideoElement } from './cameraStream';

export function CameraView({ isRunning, children, onVideoElementChange }: CameraViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasConsumerRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const video = getSharedVideoElement();
    if (video.parentElement !== container) {
      container.innerHTML = '';
      container.appendChild(video);
    }

    return () => {
      if (video.parentElement === container) {
        container.removeChild(video);
      }
      onVideoElementChange?.(null);
    };
  }, [onVideoElementChange]);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (!isRunning) {
        if (hasConsumerRef.current) {
          releaseStreamConsumer();
          hasConsumerRef.current = false;
        }
        onVideoElementChange?.(null);
        return;
      }

      try {
        if (!hasConsumerRef.current) {
          retainStreamConsumer();
          hasConsumerRef.current = true;
        }

        const stream = await acquireSharedStream();
        if (cancelled) {
          return;
        }
        setErrorMessage(null);

        const video = getSharedVideoElement();
        video.srcObject = stream;
        await video.play();
        if (cancelled) {
          return;
        }
        onVideoElementChange?.(video);
      } catch {
        if (cancelled) return;
        if (hasConsumerRef.current) {
          releaseStreamConsumer();
          hasConsumerRef.current = false;
        }
        onVideoElementChange?.(null);
        setErrorMessage('Unable to access webcam. Check browser permissions and retry.');
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (hasConsumerRef.current) {
        releaseStreamConsumer();
        hasConsumerRef.current = false;
      }
    };
  }, [isRunning, onVideoElementChange, retryCount]);

  return (
    <section className="camera-view" aria-label="Camera View">
      {errorMessage ? <div className="camera-error">
        <p>{errorMessage}</p>
        <button type="button" className="phase-action" disabled={!isRunning} onClick={() => { setErrorMessage(null); setRetryCount((count) => count + 1); }}>
          Retry Camera
        </button>
      </div> : null}
      <div ref={containerRef} className="camera-video-host" />
      {children ? children(sharedVideoElement) : null}
    </section>
  );
}
