const CAMERA_HANDOFF_GRACE_MS = 750;

let sharedStream: MediaStream | null = null;
let pendingStream: Promise<MediaStream> | null = null;
let activeConsumers = 0;
let releaseTimer: number | null = null;
export let sharedVideoElement: HTMLVideoElement | null = null;

function clearReleaseTimer() {
  if (releaseTimer !== null) {
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

export function retainStreamConsumer() {
  activeConsumers += 1;
  clearReleaseTimer();
}

export function releaseStreamConsumer() {
  activeConsumers = Math.max(0, activeConsumers - 1);

  if (activeConsumers > 0) {
    return;
  }

  clearReleaseTimer();
  releaseTimer = window.setTimeout(() => {
    if (activeConsumers > 0) {
      return;
    }

    if (sharedStream) {
      sharedStream.getTracks().forEach((track) => track.stop());
      sharedStream = null;
    }
    releaseTimer = null;
  }, CAMERA_HANDOFF_GRACE_MS);
}

export async function acquireSharedStream(): Promise<MediaStream> {
  clearReleaseTimer();
  if (sharedStream) {
    return sharedStream;
  }

  if (!pendingStream) {
    pendingStream = navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        if (activeConsumers === 0) {
          stream.getTracks().forEach((track) => track.stop());
          return stream;
        }
        sharedStream = stream;
        return stream;
      })
      .finally(() => {
        pendingStream = null;
      });
  }

  return pendingStream;
}

export function getSharedVideoElement() {
  if (sharedVideoElement) {
    return sharedVideoElement;
  }

  const video = document.createElement('video');
  video.className = 'camera-video';
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  sharedVideoElement = video;
  return video;
}

export function __resetCameraViewSharedStateForTests() {
  clearReleaseTimer();
  if (sharedStream) {
    sharedStream.getTracks().forEach((track) => track.stop());
  }
  if (sharedVideoElement) {
    sharedVideoElement.pause();
    sharedVideoElement.srcObject = null;
    sharedVideoElement.remove();
  }
  sharedStream = null;
  pendingStream = null;
  activeConsumers = 0;
  sharedVideoElement = null;
}
