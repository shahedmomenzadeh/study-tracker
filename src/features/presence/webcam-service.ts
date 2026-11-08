/**
 * Reusable Webcam Capture Service
 * Requests camera access, captures 5 fresh frames spaced 250ms apart,
 * and guarantees 100% camera track cleanup in try/finally blocks.
 * Never stores or records images or video.
 */

import { WebcamOptions, PresenceErrorReason } from './types';

export class WebcamService {
  private options: Required<WebcamOptions>;
  private isCapturing: boolean = false;
  private customNavigator: any = null;
  private customDocument: any = null;

  private sessionStream: MediaStream | null = null;

  constructor(options: WebcamOptions = {}, customNavigator: any = null, customDocument: any = null) {
    this.options = {
      width: options.width || 640,
      height: options.height || 480,
      facingMode: options.facingMode || 'user',
      captureTimeoutMs: options.captureTimeoutMs || 10000,
      persistSessionStream: options.persistSessionStream || false
    };
    this.customNavigator = customNavigator;
    this.customDocument = customDocument;
  }

  public setPersistSessionStream(persist: boolean): void {
    this.options.persistSessionStream = persist;
    if (!persist) {
      this.releaseSessionStream();
    }
  }

  public releaseSessionStream(): void {
    if (this.sessionStream) {
      try {
        this.sessionStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {
            console.warn('Error stopping session stream track:', e);
          }
        });
      } catch (e) {
        console.warn('Error releasing session stream:', e);
      }
      this.sessionStream = null;
    }
  }

  private getNavigator(): any {
    if (this.customNavigator) return this.customNavigator;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) return navigator;
    if (typeof globalThis !== 'undefined' && (globalThis as any).navigator?.mediaDevices) return (globalThis as any).navigator;
    return typeof navigator !== 'undefined' ? navigator : null;
  }

  private getDocument(): any {
    if (this.customDocument) return this.customDocument;
    if (typeof document !== 'undefined') return document;
    if (typeof globalThis !== 'undefined' && (globalThis as any).document) return (globalThis as any).document;
    return null;
  }

  public getIsCapturing(): boolean {
    return this.isCapturing;
  }

  /**
   * Check if getUserMedia is supported in the current environment
   */
  public isSupported(): boolean {
    const nav = this.getNavigator();
    return !!(
      nav &&
      nav.mediaDevices &&
      typeof nav.mediaDevices.getUserMedia === 'function'
    );
  }

  /**
   * Request permission only to test accessibility
   */
  public async testPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    let stream: MediaStream | null = null;
    try {
      const nav = this.getNavigator()!;
      stream = await nav.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: this.options.facingMode },
          width: { ideal: this.options.width },
          height: { ideal: this.options.height }
        },
        audio: false
      });
      return true;
    } catch {
      return false;
    } finally {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    }
  }

  /**
   * Captures multiple distinct frames spaced approximately `intervalMs` apart.
   * Invokes `onFrame` callback for each fresh frame.
   * Cleans up all camera tracks and elements in `finally`.
   */
  public async captureBurst(
    frameCount: number = 5,
    intervalMs: number = 250,
    onFrame: (video: HTMLVideoElement, index: number) => Promise<void> | void
  ): Promise<void> {
    if (!this.isSupported()) {
      const err: any = new Error('Webcam mediaDevices API is not supported in this environment.');
      err.errorReason = 'CAMERA_UNAVAILABLE' as PresenceErrorReason;
      throw err;
    }

    if (this.isCapturing) {
      throw new Error('A webcam capture session is already in progress.');
    }

    this.isCapturing = true;
    let stream: MediaStream | null = null;
    let videoElement: HTMLVideoElement | null = null;
    const shouldPersist = !!this.options.persistSessionStream;

    try {
      const nav = this.getNavigator()!;
      const doc = this.getDocument()!;

      // 1. Request webcam access or reuse existing active session stream
      let streamToUse: MediaStream | null = null;
      if (shouldPersist && this.sessionStream) {
        const liveTracks = typeof this.sessionStream.getVideoTracks === 'function'
          ? this.sessionStream.getVideoTracks().filter(t => t.readyState === 'live')
          : [];
        if (liveTracks.length > 0) {
          liveTracks.forEach(t => { t.enabled = true; });
          streamToUse = this.sessionStream;
        }
      }

      if (!streamToUse) {
        try {
          stream = await nav.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: this.options.facingMode },
              width: { ideal: this.options.width },
              height: { ideal: this.options.height }
            },
            audio: false
          });
          if (shouldPersist) {
            this.sessionStream = stream;
          }
          streamToUse = stream;
        } catch (err: any) {
          const errorReason = this.categorizeGetUserMediaError(err);
          const wrappedErr: any = new Error(`Failed to access webcam: ${err?.message || err}`);
          wrappedErr.errorReason = errorReason;
          throw wrappedErr;
        }
      }

      // 2. Setup video element
      videoElement = doc.createElement('video');
      videoElement.setAttribute('autoplay', '');
      videoElement.setAttribute('muted', '');
      videoElement.setAttribute('playsinline', '');
      if (videoElement.style) videoElement.style.display = 'none';
      videoElement.muted = true;
      videoElement.srcObject = streamToUse;

      // 3. Wait for video to have decoded frames available
      await this.waitForVideoReady(videoElement, this.options.captureTimeoutMs);

      // 4. Sample distinct frames spaced intervalMs apart
      for (let i = 0; i < frameCount; i++) {
        // Wait before next frame (except before frame 0)
        if (i > 0) {
          await this.delay(intervalMs);
        }

        // Wait for fresh frame decoded if requestVideoFrameCallback is available
        await this.waitForFreshFrame(videoElement);

        // Run user callback on the fresh frame
        await onFrame(videoElement, i);
      }
    } finally {
      // 5. Cleanup
      if (shouldPersist && this.sessionStream) {
        // Soft mute between checks to keep permission token alive without taking continuous frames
        try {
          if (typeof this.sessionStream.getVideoTracks === 'function') {
            this.sessionStream.getVideoTracks().forEach(t => { t.enabled = false; });
          }
        } catch (e) {
          console.warn('Error muting session stream tracks:', e);
        }
      } else {
        // Stop all tracks immediately
        if (stream) {
          try {
            stream.getTracks().forEach(track => {
              try {
                track.stop();
              } catch (e) {
                console.warn('Error stopping camera track:', e);
              }
            });
          } catch (e) {
            console.warn('Error releasing stream:', e);
          }
        }
      }

      if (videoElement) {
        try {
          videoElement.pause();
          videoElement.srcObject = null;
          if (videoElement.parentNode) {
            videoElement.parentNode.removeChild(videoElement);
          }
        } catch (e) {
          console.warn('Error cleaning up video element:', e);
        }
      }

      this.isCapturing = false;
    }
  }

  private waitForVideoReady(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let isResolved = false;

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          const err: any = new Error('Webcam initialization timed out waiting for video frame.');
          err.errorReason = 'FRAME_CAPTURE_FAILED' as PresenceErrorReason;
          reject(err);
        }
      }, timeoutMs);

      const checkReady = () => {
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            cleanup();
            resolve();
          }
        }
      };

      const onLoaded = () => {
        video.play().then(checkReady).catch(checkReady);
      };

      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('canplay', checkReady);
      };

      video.addEventListener('loadeddata', onLoaded);
      video.addEventListener('canplay', checkReady);

      video.play().then(checkReady).catch(() => {});
      checkReady();
    });
  }

  private waitForFreshFrame(video: HTMLVideoElement): Promise<void> {
    return new Promise(resolve => {
      if ('requestVideoFrameCallback' in video && typeof (video as any).requestVideoFrameCallback === 'function') {
        (video as any).requestVideoFrameCallback(() => resolve());
      } else {
        requestAnimationFrame(() => resolve());
      }
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private categorizeGetUserMediaError(err: any): PresenceErrorReason {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      return 'PERMISSION_DENIED';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'CAMERA_NOT_FOUND';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      return 'CAMERA_UNAVAILABLE';
    }
    return 'UNKNOWN_ERROR';
  }
}
