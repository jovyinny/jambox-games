import { useEffect, useRef } from 'react';
import type { ZoneId } from '../types';

interface OverlayCanvasProps {
  video: HTMLVideoElement | null;
  enabled?: boolean;
  activeZones?: Record<ZoneId, boolean>;
  hitFlashes?: Record<ZoneId, number>;
  onDraw?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

import { drawNeonOverlay } from './drawNeonOverlay';

export function OverlayCanvas({
  video,
  enabled = true,
  activeZones = { left: true, middle: true, right: true },
  hitFlashes = { left: 0, middle: 0, right: 0 },
  onDraw,
}: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let rafId = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas || !video) {
        rafId = window.requestAnimationFrame(render);
        return;
      }

      const width = video.videoWidth || video.clientWidth || 640;
      const height = video.videoHeight || video.clientHeight || 480;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafId = window.requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);
      drawNeonOverlay(
        ctx,
        width,
        height,
        activeZones,
        hitFlashes,
        performance.now(),
      );
      if (onDraw) {
        onDraw(ctx, width, height);
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(rafId);
  }, [activeZones, enabled, hitFlashes, onDraw, video]);

  return <canvas ref={canvasRef} className="overlay-canvas" aria-label="Overlay Canvas" />;
}
