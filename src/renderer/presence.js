/**
 * Periodic Human Presence Detection Service
 * Client-Side CPU/WASM inference with MediaPipe Tasks Vision (EfficientDet-Lite0 INT8)
 * Checks for visible person every 5 minutes during active study session.
 * Stores only metadata (timestamps and detection counts), NEVER webcam images or recordings.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const presenceExports = factory();
    root.PresenceDetector = presenceExports.PresenceDetector;
    root.WebcamService = presenceExports.WebcamService;
    root.PresenceAggregator = presenceExports.PresenceAggregator;
    root.PresenceScheduler = presenceExports.PresenceScheduler;
    root.PresenceService = presenceExports.PresenceService;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- 1. Presence Detector ---
  class PresenceDetector {
    constructor(config = {}) {
      this.detector = null;
      this.visionInstance = null;
      this.isInitializing = false;
      this.initPromise = null;
      this.modelName = 'efficientdet_lite0_int8';

      // Smart asset path resolution
      const isFile = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
      const defaultWasm = isFile ? './mediapipe/wasm' : '/mediapipe/wasm';
      const defaultModel = isFile ? './models/efficientdet_lite0_int8.tflite' : '/models/efficientdet_lite0_int8.tflite';

      this.config = {
        enabled: true,
        checkIntervalMs: 5 * 60 * 1000,
        framesPerCheck: 5,
        frameIntervalMs: 250,
        scoreThreshold: 0.5,
        minPositiveFrames: 3,
        maxRetries: 1,
        retryDelayMs: 1500,
        modelPath: defaultModel,
        wasmPath: defaultWasm,
        categoryAllowlist: ['person'],
        ...config
      };
    }

    getModelName() {
      return this.modelName;
    }

    isReady() {
      return this.detector !== null;
    }

    async getVisionModule() {
      if (typeof window !== 'undefined') {
        if (window.Vision) return window.Vision;
        if (window.tasksVision) return window.tasksVision;
      }
      if (typeof require === 'function') {
        try {
          return require('@mediapipe/tasks-vision');
        } catch (e) {
          // Fall through
        }
      }
      try {
        const mod = await import('@mediapipe/tasks-vision');
        return mod;
      } catch (err) {
        throw new Error('MediaPipe Tasks Vision library not found. Please ensure vision_bundle.js is loaded.');
      }
    }

    async initialize() {
      if (this.detector) return;
      if (this.isInitializing && this.initPromise) {
        return this.initPromise;
      }

      this.isInitializing = true;
      this.initPromise = (async () => {
        try {
          const visionModule = await this.getVisionModule();

          if (!this.visionInstance) {
            this.visionInstance = await visionModule.FilesetResolver.forVisionTasks(
              this.config.wasmPath
            );
          }

          this.detector = await visionModule.ObjectDetector.createFromOptions(
            this.visionInstance,
            {
              baseOptions: {
                modelAssetPath: this.config.modelPath,
                delegate: 'CPU'
              },
              runningMode: 'IMAGE',
              scoreThreshold: this.config.scoreThreshold,
              maxResults: 5,
              categoryAllowlist: this.config.categoryAllowlist
            }
          );
        } catch (err) {
          this.detector = null;
          throw new Error('ObjectDetector initialization error: ' + (err.message || err));
        } finally {
          this.isInitializing = false;
        }
      })();

      return this.initPromise;
    }

    updateConfig(newConfig = {}) {
      this.config = { ...this.config, ...newConfig };
      if (this.detector && newConfig.scoreThreshold !== undefined) {
        try {
          this.detector.setOptions({
            scoreThreshold: this.config.scoreThreshold
          });
        } catch (e) {
          console.warn('Failed to update detector scoreThreshold:', e);
        }
      }
    }

    detectFrame(imageSource, frameIndex = 0) {
      if (!this.detector) {
        throw new Error('Detector is not initialized. Call initialize() first.');
      }

      try {
        const result = this.detector.detect(imageSource);
        const personDetections = [];
        let maxScore = 0;

        if (result && Array.isArray(result.detections)) {
          for (const detection of result.detections) {
            const categories = detection.categories || [];
            const personCategory = categories.find(
              c => c.categoryName.toLowerCase() === 'person' && c.score >= this.config.scoreThreshold
            );

            if (personCategory) {
              if (personCategory.score > maxScore) {
                maxScore = personCategory.score;
              }
              personDetections.push({
                score: personCategory.score,
                categoryName: personCategory.categoryName,
                boundingBox: detection.boundingBox || null
              });
            }
          }
        }

        return {
          frameIndex,
          hasPerson: personDetections.length > 0,
          maxScore,
          detections: personDetections,
          timestamp: Date.now()
        };
      } catch (err) {
        throw new Error(`Inference execution failed on frame ${frameIndex}: ` + (err.message || err));
      }
    }

    close() {
      if (this.detector && typeof this.detector.close === 'function') {
        try {
          this.detector.close();
        } catch (e) {
          console.warn('Error closing detector:', e);
        }
      }
      this.detector = null;
    }
  }

  // --- 2. Webcam Service ---
  class WebcamService {
    constructor(options = {}, customNavigator = null, customDocument = null) {
      this.options = {
        width: options.width || 640,
        height: options.height || 480,
        facingMode: options.facingMode || 'user',
        captureTimeoutMs: options.captureTimeoutMs || 10000,
        persistSessionStream: options.persistSessionStream || false
      };
      this.customNavigator = customNavigator;
      this.customDocument = customDocument;
      this.isCapturing = false;
      this.sessionStream = null;
    }

    setPersistSessionStream(persist) {
      this.options.persistSessionStream = persist;
      if (!persist) {
        this.releaseSessionStream();
      }
    }

    releaseSessionStream() {
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

    getNavigator() {
      if (this.customNavigator) return this.customNavigator;
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) return navigator;
      if (typeof globalThis !== 'undefined' && globalThis.navigator && globalThis.navigator.mediaDevices) return globalThis.navigator;
      return typeof navigator !== 'undefined' ? navigator : null;
    }

    getDocument() {
      if (this.customDocument) return this.customDocument;
      if (typeof document !== 'undefined') return document;
      if (typeof globalThis !== 'undefined' && globalThis.document) return globalThis.document;
      return null;
    }

    getIsCapturing() {
      return this.isCapturing;
    }

    isSupported() {
      const nav = this.getNavigator();
      return !!(
        nav &&
        nav.mediaDevices &&
        typeof nav.mediaDevices.getUserMedia === 'function'
      );
    }

    async testPermission() {
      if (!this.isSupported()) return false;
      let stream = null;
      try {
        const nav = this.getNavigator();
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

    async captureBurst(frameCount = 5, intervalMs = 250, onFrame = async () => {}) {
      if (!this.isSupported()) {
        const err = new Error('Webcam mediaDevices API is not supported in this environment.');
        err.errorReason = 'CAMERA_UNAVAILABLE';
        throw err;
      }

      if (this.isCapturing) {
        throw new Error('A webcam capture session is already in progress.');
      }

      this.isCapturing = true;
      let stream = null;
      let videoElement = null;
      const shouldPersist = !!this.options.persistSessionStream;

      try {
        const nav = this.getNavigator();
        const doc = this.getDocument();

        // 1. Request camera or reuse active session stream
        let streamToUse = null;
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
          } catch (err) {
            const errorReason = this.categorizeGetUserMediaError(err);
            const wrappedErr = new Error('Failed to access webcam: ' + (err.message || err));
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

        // 3. Wait for decoded frame
        await this.waitForVideoReady(videoElement, this.options.captureTimeoutMs);

        // 4. Sample distinct frames
        for (let i = 0; i < frameCount; i++) {
          if (i > 0) {
            await this.delay(intervalMs);
          }
          await this.waitForFreshFrame(videoElement);
          await onFrame(videoElement, i);
        }
      } finally {
        // 5. Cleanup
        if (shouldPersist && this.sessionStream) {
          try {
            if (typeof this.sessionStream.getVideoTracks === 'function') {
              this.sessionStream.getVideoTracks().forEach(t => { t.enabled = false; });
            }
          } catch (e) {
            console.warn('Error muting session stream tracks:', e);
          }
        } else {
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

    waitForVideoReady(video, timeoutMs) {
      return new Promise((resolve, reject) => {
        let isResolved = false;

        const timer = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            const err = new Error('Webcam initialization timed out waiting for video frame.');
            err.errorReason = 'FRAME_CAPTURE_FAILED';
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

    waitForFreshFrame(video) {
      return new Promise(resolve => {
        if ('requestVideoFrameCallback' in video && typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(() => resolve());
        } else {
          const raf = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (typeof globalThis !== 'undefined' && globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame : setTimeout);
          raf(() => resolve());
        }
      });
    }

    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    categorizeGetUserMediaError(err) {
      const name = err ? err.name : '';
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

  // --- 3. Presence Aggregator ---
  class PresenceAggregator {
    constructor(minPositiveFrames = 3) {
      this.minPositiveFrames = minPositiveFrames;
    }

    setMinPositiveFrames(threshold) {
      this.minPositiveFrames = Math.max(1, threshold);
    }

    aggregate(predictions, scheduledAt, checkedAt, modelName, error = null) {
      if (error) {
        const errorReason = error.errorReason || 'UNKNOWN_ERROR';
        return {
          status: 'UNKNOWN',
          positiveFrames: 0,
          totalFrames: predictions.length,
          predictions,
          scheduledAt,
          checkedAt,
          model: modelName,
          errorReason
        };
      }

      const totalFrames = predictions.length;
      const positiveFrames = predictions.filter(p => p.hasPerson).length;
      const isPresent = positiveFrames >= this.minPositiveFrames;
      const status = isPresent ? 'PRESENT' : 'NOT_DETECTED';

      return {
        status,
        positiveFrames,
        totalFrames,
        predictions,
        scheduledAt,
        checkedAt,
        model: modelName
      };
    }

    shouldRetry(predictions, alreadyRetried, maxRetries = 1) {
      if (alreadyRetried || maxRetries <= 0) return false;
      const positiveFrames = predictions.filter(p => p.hasPerson).length;
      return positiveFrames === 0 && predictions.length > 0;
    }
  }

  // --- 4. Presence Scheduler ---
  class PresenceScheduler {
    constructor(detector, webcam, aggregator, callbacks = {}, config = {}) {
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
        persistSessionStream: false,
        captureAbsenceEvidence: true,
        ...config
      };

      if (this.config.persistSessionStream !== undefined) {
        this.webcam.setPersistSessionStream(this.config.persistSessionStream);
      }

      this.timerId = null;
      this.checkAlreadyRunning = false;
      this.isMonitoring = false;
      this.lastScheduledTime = 0;
      this.lastCheckTime = 0;
      this.latestStatus = 'UNKNOWN';
      this.visibilityListenerAttached = false;

      this.attachVisibilityListener();
    }

    getLatestStatus() {
      return this.latestStatus;
    }

    getLastCheckTime() {
      return this.lastCheckTime;
    }

    isRunning() {
      return this.checkAlreadyRunning;
    }

    isEnabled() {
      return this.config.enabled;
    }

    setEnabled(enabled) {
      this.config.enabled = enabled;
      if (!enabled) {
        this.stop();
      }
    }

    updateConfig(newConfig = {}) {
      this.config = { ...this.config, ...newConfig };
      if (this.config.minPositiveFrames !== undefined) {
        this.aggregator.setMinPositiveFrames(this.config.minPositiveFrames);
      }
      this.detector.updateConfig(newConfig);
      if (this.config.persistSessionStream !== undefined) {
        this.webcam.setPersistSessionStream(this.config.persistSessionStream);
      }
    }

    start() {
      if (!this.config.enabled) return;
      this.isMonitoring = true;
      this.clearPendingTimer();
      // First check 5 minutes after session starts
      this.scheduleNextCheck(this.config.checkIntervalMs);
    }

    stop() {
      this.isMonitoring = false;
      this.clearPendingTimer();
      this.webcam.releaseSessionStream();
    }

    scheduleNextCheck(delayMs) {
      this.clearPendingTimer();
      if (!this.isMonitoring || !this.config.enabled) return;

      this.lastScheduledTime = Date.now() + delayMs;
      this.timerId = setTimeout(() => {
        this.executeScheduledCheck();
      }, delayMs);
    }

    clearPendingTimer() {
      if (this.timerId !== null) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
    }

    async executeScheduledCheck() {
      if (!this.isMonitoring || !this.config.enabled) return;
      if (this.callbacks.isSessionActive && !this.callbacks.isSessionActive()) {
        this.stop();
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
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
      } catch (err) {
        if (this.callbacks.onCheckError) {
          this.callbacks.onCheckError(err);
        }
      } finally {
        this.checkAlreadyRunning = false;
        if (this.isMonitoring && this.config.enabled && (!this.callbacks.isSessionActive || this.callbacks.isSessionActive())) {
          this.scheduleNextCheck(this.config.checkIntervalMs);
        }
      }
    }

    async performManualCheck() {
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

    captureFrameSnapshot(videoElement) {
      try {
        if (!videoElement) return null;
        const doc = this.webcam ? this.webcam.getDocument() : (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.createElement !== 'function') return null;

        const w = videoElement.videoWidth || 320;
        const h = videoElement.videoHeight || 240;
        if (w <= 0 || h <= 0) return null;

        const canvas = doc.createElement('canvas');
        if (!canvas || typeof canvas.getContext !== 'function') return null;

        // Downscale to 320px width to keep base64 lightweight (~12KB)
        const maxWidth = 320;
        const scale = Math.min(1, maxWidth / Math.max(1, w));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        // Watermark with timestamp and label
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

    async performCheck(scheduledAt) {
      const sessionId = (this.callbacks.getCurrentSessionId && this.callbacks.getCurrentSessionId()) || 'sess-active';
      let checkError = null;
      let predictions = [];
      let lastVideoSnapshot = null;
      const checkedAt = new Date().toISOString();

      try {
        if (!this.detector.isReady()) {
          await this.detector.initialize();
        }

        const runBurst = async () => {
          const burstPredictions = [];
          await this.webcam.captureBurst(
            this.config.framesPerCheck,
            this.config.frameIntervalMs,
            async (videoElement, frameIdx) => {
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

        if (this.aggregator.shouldRetry(predictions, false, this.config.maxRetries)) {
          await new Promise(r => setTimeout(r, this.config.retryDelayMs));
          const retryPredictions = await runBurst();
          if (retryPredictions.some(p => p.hasPerson)) {
            predictions = retryPredictions;
            lastVideoSnapshot = null; // Person detected on retry!
          }
        }
      } catch (err) {
        checkError = err;
      }

      const result = this.aggregator.aggregate(
        predictions,
        scheduledAt,
        checkedAt,
        this.detector.getModelName(),
        checkError
      );

      const evidenceSnapshot = (result.status === 'NOT_DETECTED' && this.config.captureAbsenceEvidence !== false)
        ? (lastVideoSnapshot || null)
        : null;

      return {
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
    }

    attachVisibilityListener() {
      if (this.visibilityListenerAttached || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
      this.visibilityListenerAttached = true;

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          if (this.isMonitoring && this.config.enabled && (!this.callbacks.isSessionActive || this.callbacks.isSessionActive())) {
            const now = Date.now();
            if (this.lastScheduledTime > 0 && now >= this.lastScheduledTime && !this.checkAlreadyRunning) {
              this.clearPendingTimer();
              this.executeScheduledCheck();
            }
          }
        }
      });
    }
  }

  // --- 5. Unified Presence Service ---
  class PresenceService {
    constructor(callbacks = {}, config = {}) {
      this.detector = new PresenceDetector(config);
      this.webcam = new WebcamService({
        persistSessionStream: config.persistSessionStream
      });
      this.aggregator = new PresenceAggregator(config.minPositiveFrames || 3);
      this.scheduler = new PresenceScheduler(
        this.detector,
        this.webcam,
        this.aggregator,
        callbacks,
        config
      );
    }

    start() {
      this.scheduler.start();
    }

    stop() {
      this.scheduler.stop();
    }

    checkNow() {
      return this.scheduler.performManualCheck();
    }

    setEnabled(enabled) {
      this.scheduler.setEnabled(enabled);
    }

    isEnabled() {
      return this.scheduler.isEnabled();
    }

    getLatestStatus() {
      return this.scheduler.getLatestStatus();
    }

    getLastCheckTime() {
      return this.scheduler.getLastCheckTime();
    }

    updateConfig(newConfig) {
      this.scheduler.updateConfig(newConfig);
    }

    dispose() {
      this.scheduler.stop();
      this.detector.close();
    }
  }

  return {
    PresenceDetector,
    WebcamService,
    PresenceAggregator,
    PresenceScheduler,
    PresenceService
  };
});
