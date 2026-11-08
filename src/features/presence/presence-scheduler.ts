/**
 * 5-Minute Presence Scheduler
 * Integrates with the study session lifecycle.
 * Uses recursive setTimeout, avoids concurrency, respects document visibility,
 * and prevents multiple catch-up checks on resume.
 */

import {
  PresenceObservation,
  PresenceCheckConfig,
  PresenceCheckResult,
  FramePrediction,
  PresenceStatus
} from './types';
import { PresenceDetector } from './presence-detector';
import { WebcamService } from './webcam-service';
import { PresenceAggregator } from './presence-aggregator';

export interface PresenceSchedulerCallbacks {
  onCheckStart?: () => void;
  onCheckComplete?: (observation: PresenceObservation) => void;
  onCheckError?: (error: Error) => void;
  onStatusChange?: (status: PresenceStatus) => void;
  isSessionActive: () => boolean;
  getCurrentSessionId: () => string;
}

export class PresenceScheduler {
  private config: PresenceCheckConfig;
  private detector: PresenceDetector;
  private webcam: WebcamService;
  private aggregator: PresenceAggregator;
  private callbacks: PresenceSchedulerCallbacks;

  private timerId: any = null;
  private checkAlreadyRunning: boolean = false;
  private isMonitoring: boolean = false;
  private lastScheduledTime: number = 0;
  private lastCheckTime: number = 0;
  private latestStatus: PresenceStatus = 'UNKNOWN';
  private visibilityListenerAttached: boolean = false;

  constructor(
    detector: PresenceDetector,
    webcam: WebcamService,
    aggregator: PresenceAggregator,
    callbacks: PresenceSchedulerCallbacks,
    config: Partial<PresenceCheckConfig> = {}
  ) {
    this.detector = detector;
    this.webcam = webcam;
    this.aggregator = aggregator;
    this.callbacks = callbacks;

    this.config = {
      enabled: true,
      checkIntervalMs: 5 * 60 * 1000, // 5 minutes
      framesPerCheck: 5,
      frameIntervalMs: 250,
      scoreThreshold: 0.5,
      minPositiveFrames: 3,
      maxRetries: 1,
      retryDelayMs: 1500,
      modelPath: './models/efficientdet_lite0_int8.tflite',
      wasmPath: './mediapipe/wasm',
      categoryAllowlist: ['person'],
      persistSessionStream: false,
      captureAbsenceEvidence: true,
      ...config
    };

    if (this.config.persistSessionStream !== undefined) {
      this.webcam.setPersistSessionStream(this.config.persistSessionStream);
    }

    this.attachVisibilityListener();
  }

  public getLatestStatus(): PresenceStatus {
    return this.latestStatus;
  }

  public getLastCheckTime(): number {
    return this.lastCheckTime;
  }

  public isRunning(): boolean {
    return this.checkAlreadyRunning;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  public updateConfig(newConfig: Partial<PresenceCheckConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.aggregator.setMinPositiveFrames(this.config.minPositiveFrames);
    this.detector.updateConfig(newConfig);
    if (this.config.persistSessionStream !== undefined) {
      this.webcam.setPersistSessionStream(this.config.persistSessionStream);
    }
  }

  /**
   * Called when a study session starts or resumes.
   * Schedules the first check after 5 minutes.
   */
  public start(): void {
    if (!this.config.enabled) return;

    this.isMonitoring = true;
    this.clearPendingTimer();

    // Schedule first check after 5 minutes
    this.scheduleNextCheck(this.config.checkIntervalMs);
  }

  /**
   * Called when study session is paused or completed.
   * Cancels any pending checks and releases camera hardware.
   */
  public stop(): void {
    this.isMonitoring = false;
    this.clearPendingTimer();
    this.webcam.releaseSessionStream();
  }

  /**
   * Schedule next check using recursive setTimeout
   */
  private scheduleNextCheck(delayMs: number): void {
    this.clearPendingTimer();
    if (!this.isMonitoring || !this.config.enabled) return;

    this.lastScheduledTime = Date.now() + delayMs;
    this.timerId = setTimeout(() => {
      this.executeScheduledCheck();
    }, delayMs);
  }

  private clearPendingTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Executes scheduled 5-minute presence check
   */
  private async executeScheduledCheck(): Promise<void> {
    if (!this.isMonitoring || !this.config.enabled) return;
    if (!this.callbacks.isSessionActive()) {
      this.stop();
      return;
    }

    // Check document visibility
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      // Do not run camera check while app is minimized or tab is hidden.
      // Schedule an immediate single check for when user returns.
      return;
    }

    if (this.checkAlreadyRunning) return;

    const scheduledAt = new Date(this.lastScheduledTime || Date.now()).toISOString();

    try {
      this.checkAlreadyRunning = true;
      if (this.callbacks.onCheckStart) {
        this.callbacks.onCheckStart();
      }

      const observation = await this.performCheck(scheduledAt);
      this.latestStatus = observation.status;
      this.lastCheckTime = Date.now();

      if (this.callbacks.onStatusChange) {
        this.callbacks.onStatusChange(this.latestStatus);
      }
      if (this.callbacks.onCheckComplete) {
        this.callbacks.onCheckComplete(observation);
      }
    } catch (err: any) {
      if (this.callbacks.onCheckError) {
        this.callbacks.onCheckError(err);
      }
    } finally {
      this.checkAlreadyRunning = false;

      // Reschedule next check if session is still active
      if (this.isMonitoring && this.config.enabled && this.callbacks.isSessionActive()) {
        this.scheduleNextCheck(this.config.checkIntervalMs);
      }
    }
  }

  /**
   * Manual on-demand check (e.g. for user testing)
   */
  public async performManualCheck(): Promise<PresenceObservation> {
    if (this.checkAlreadyRunning) {
      throw new Error('A presence check is already in progress.');
    }

    const scheduledAt = new Date().toISOString();
    try {
      this.checkAlreadyRunning = true;
      if (this.callbacks.onCheckStart) {
        this.callbacks.onCheckStart();
      }

      const observation = await this.performCheck(scheduledAt);
      this.latestStatus = observation.status;
      this.lastCheckTime = Date.now();

      if (this.callbacks.onStatusChange) {
        this.callbacks.onStatusChange(this.latestStatus);
      }
      if (this.callbacks.onCheckComplete) {
        this.callbacks.onCheckComplete(observation);
      }
      return observation;
    } finally {
      this.checkAlreadyRunning = false;
    }
  }

  /**
   * Core presence check implementation:
   * 1. Initialize detector once if needed
   * 2. Capture 5 frames via WebcamService
   * 3. Run inference on each frame
   * 4. Aggregate predictions
   * 5. Retry once if 0 positive frames and retries configured
   */
  private async performCheck(scheduledAt: string): Promise<PresenceObservation> {
    const sessionId = this.callbacks.getCurrentSessionId() || 'sess-active';
    let checkError: Error | null = null;
    let predictions: FramePrediction[] = [];
    let lastVideoSnapshot: string | null = null;
    const checkedAt = new Date().toISOString();

    try {
      // Step 1: Ensure detector is initialized
      if (!this.detector.isReady()) {
        await this.detector.initialize();
      }

      // Step 2 & 3: Capture frames and run inference
      const runBurst = async (): Promise<FramePrediction[]> => {
        const burstPredictions: FramePrediction[] = [];
        await this.webcam.captureBurst(
          this.config.framesPerCheck,
          this.config.frameIntervalMs,
          async (videoElement: HTMLVideoElement, frameIdx: number) => {
            const pred = this.detector.detectFrame(videoElement, frameIdx);
            burstPredictions.push(pred);
            if (this.config.captureAbsenceEvidence !== false && !pred.hasPerson && !lastVideoSnapshot) {
              lastVideoSnapshot = this.captureFrameSnapshot(videoElement);
            }
          }
        );
        return burstPredictions;
      };

      predictions = await runBurst();

      // Step 4 & 5: Check retry condition
      if (this.aggregator.shouldRetry(predictions, false, this.config.maxRetries)) {
        await new Promise(r => setTimeout(r, this.config.retryDelayMs));
        const retryPredictions = await runBurst();
        // Use retry results if it found detections, otherwise combine
        if (retryPredictions.some(p => p.hasPerson)) {
          predictions = retryPredictions;
          lastVideoSnapshot = null;
        }
      }
    } catch (err: any) {
      checkError = err;
    }

    // Step 6: Aggregate results into high-level status
    const result: PresenceCheckResult = this.aggregator.aggregate(
      predictions,
      scheduledAt,
      checkedAt,
      this.detector.getModelName(),
      checkError
    );

    const evidenceSnapshot = (result.status === 'NOT_DETECTED' && this.config.captureAbsenceEvidence !== false)
      ? (lastVideoSnapshot || null)
      : null;

    // Build observation
    const observation: PresenceObservation = {
      id: 'pres-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      sessionId,
      scheduledAt: result.scheduledAt,
      checkedAt: result.checkedAt,
      status: result.status,
      positiveFrames: result.positiveFrames,
      totalFrames: result.totalFrames,
      model: result.model,
      errorReason: result.errorReason,
      evidenceSnapshot
    };

    return observation;
  }

  private captureFrameSnapshot(videoElement: any): string | null {
    try {
      if (!videoElement) return null;
      const doc = this.webcam ? (this.webcam as any).getDocument() : (typeof document !== 'undefined' ? document : null);
      if (!doc || typeof doc.createElement !== 'function') return null;

      const w = videoElement.videoWidth || 320;
      const h = videoElement.videoHeight || 240;
      if (w <= 0 || h <= 0) return null;

      const canvas = doc.createElement('canvas');
      if (!canvas || typeof canvas.getContext !== 'function') return null;

      const maxWidth = 320;
      const scale = Math.min(1, maxWidth / Math.max(1, w));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      try {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, canvas.height - 24, canvas.width, 24);
        ctx.fillStyle = '#ff6b35';
        ctx.font = 'bold 11px sans-serif';
        const nowStr = new Date().toLocaleTimeString('fa-IR');
        ctx.fillText(`عدم حضور • ${nowStr}`, 8, canvas.height - 7);
      } catch (e) {}

      if (typeof canvas.toDataURL === 'function') {
        return canvas.toDataURL('image/jpeg', 0.65);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Listen to tab visibility changes.
   * If coming back from hidden and overdue by > 5 minutes, run at most ONE overdue check.
   */
  private attachVisibilityListener(): void {
    if (this.visibilityListenerAttached || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    this.visibilityListenerAttached = true;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (this.isMonitoring && this.config.enabled && this.callbacks.isSessionActive()) {
          const now = Date.now();
          // If check was due while tab was inactive, run at most one check now
          if (this.lastScheduledTime > 0 && now >= this.lastScheduledTime && !this.checkAlreadyRunning) {
            this.clearPendingTimer();
            this.executeScheduledCheck();
          }
        }
      }
    });
  }
}
