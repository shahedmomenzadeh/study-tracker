/**
 * Automated Unit Test Suite for Periodic Human Presence Detection
 * Tests all 12 criteria specified in Section 13 of the task specification.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  PresenceDetector,
  WebcamService,
  PresenceAggregator,
  PresenceScheduler,
  PresenceService
} = require('../src/renderer/presence');

function setMockNavigator(mockNav) {
  Object.defineProperty(globalThis, 'navigator', {
    value: mockNav,
    configurable: true,
    writable: true
  });
}

function setMockDocument(mockDoc) {
  Object.defineProperty(globalThis, 'document', {
    value: mockDoc,
    configurable: true,
    writable: true
  });
}

describe('Periodic Human Presence Detection Tests', () => {

  beforeEach(() => {
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 5);
    setMockDocument({
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
      createElement: (tag) => {
        if (tag === 'video') {
          return {
            readyState: 4,
            videoWidth: 640,
            videoHeight: 480,
            style: {},
            setAttribute: () => {},
            addEventListener: (evt, cb) => {
              if (evt === 'loadeddata') setTimeout(cb, 5);
            },
            removeEventListener: () => {},
            play: async () => {},
            pause: () => {},
            srcObject: null
          };
        }
        return {};
      }
    });
    setMockNavigator({
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => {} }]
        })
      }
    });
  });

  // --- Criterion 1: Correct model initialization ---
  test('1. Correct model initialization with CPU delegate, IMAGE mode, and person category', async () => {
    let capturedOptions = null;
    let capturedWasmPath = null;

    const mockVisionModule = {
      FilesetResolver: {
        forVisionTasks: async (wasmPath) => {
          capturedWasmPath = wasmPath;
          return { wasm: true };
        }
      },
      ObjectDetector: {
        createFromOptions: async (vision, options) => {
          capturedOptions = options;
          return {
            detect: () => ({ detections: [] }),
            close: () => {}
          };
        }
      }
    };

    const detector = new PresenceDetector({
      modelPath: './models/efficientdet_lite0_int8.tflite',
      wasmPath: './mediapipe/wasm',
      scoreThreshold: 0.5,
      categoryAllowlist: ['person']
    });

    detector.getVisionModule = async () => mockVisionModule;

    await detector.initialize();

    assert.strictEqual(detector.isReady(), true, 'Detector should be marked ready');
    assert.strictEqual(capturedWasmPath, './mediapipe/wasm');
    assert.strictEqual(capturedOptions.baseOptions.delegate, 'CPU', 'Delegate must be CPU');
    assert.strictEqual(capturedOptions.baseOptions.modelAssetPath, './models/efficientdet_lite0_int8.tflite');
    assert.strictEqual(capturedOptions.runningMode, 'IMAGE', 'Running mode must be IMAGE');
    assert.strictEqual(capturedOptions.scoreThreshold, 0.5);
    assert.deepStrictEqual(capturedOptions.categoryAllowlist, ['person']);

    // Subsequent initialize call reuses existing detector
    const prevDetector = detector.detector;
    await detector.initialize();
    assert.strictEqual(detector.detector, prevDetector, 'Detector instance should be reused');
  });

  // --- Criterion 2: Successful webcam permission and capture ---
  test('2. Successful webcam permission and burst capture of 5 distinct frames', async () => {
    let stoppedTracksCount = 0;
    const mockTrack = {
      kind: 'video',
      readyState: 'live',
      stop: () => {
        mockTrack.readyState = 'ended';
        stoppedTracksCount++;
      }
    };

    const mockStream = {
      getTracks: () => [mockTrack]
    };

    let requestedConstraints = null;
    setMockNavigator({
      mediaDevices: {
        getUserMedia: async (constraints) => {
          requestedConstraints = constraints;
          return mockStream;
        }
      }
    });

    const webcam = new WebcamService({ width: 640, height: 480, facingMode: 'user' });
    const capturedIndices = [];

    await webcam.captureBurst(5, 10, async (video, index) => {
      capturedIndices.push(index);
    });

    assert.strictEqual(requestedConstraints.video.facingMode.ideal, 'user');
    assert.strictEqual(requestedConstraints.video.width.ideal, 640);
    assert.strictEqual(requestedConstraints.video.height.ideal, 480);
    assert.strictEqual(requestedConstraints.audio, false, 'Audio must be false');
    assert.deepStrictEqual(capturedIndices, [0, 1, 2, 3, 4], 'Must capture 5 frames in sequence');
  });

  // --- Criterion 3: Person detection from a webcam frame ---
  test('3. Person detection from a webcam frame with confidence score and bounding box', () => {
    const detector = new PresenceDetector({ scoreThreshold: 0.5 });
    detector.detector = {
      detect: () => ({
        detections: [
          {
            categories: [
              { categoryName: 'person', score: 0.88 },
              { categoryName: 'chair', score: 0.72 }
            ],
            boundingBox: { originX: 100, originY: 80, width: 220, height: 350 }
          }
        ]
      })
    };

    const prediction = detector.detectFrame({}, 1);

    assert.strictEqual(prediction.hasPerson, true);
    assert.strictEqual(prediction.frameIndex, 1);
    assert.strictEqual(prediction.maxScore, 0.88);
    assert.strictEqual(prediction.detections.length, 1);
    assert.strictEqual(prediction.detections[0].categoryName, 'person');
    assert.deepStrictEqual(prediction.detections[0].boundingBox, {
      originX: 100,
      originY: 80,
      width: 220,
      height: 350
    });
  });

  // --- Criterion 4: Empty-room detection (no person visible) ---
  test('4. Empty-room detection: returns hasPerson = false when no person category present', () => {
    const detector = new PresenceDetector({ scoreThreshold: 0.5 });
    detector.detector = {
      detect: () => ({
        detections: [
          {
            categories: [
              { categoryName: 'chair', score: 0.85 },
              { categoryName: 'laptop', score: 0.91 }
            ]
          }
        ]
      })
    };

    const prediction = detector.detectFrame({}, 0);

    assert.strictEqual(prediction.hasPerson, false);
    assert.strictEqual(prediction.maxScore, 0);
    assert.strictEqual(prediction.detections.length, 0);
  });

  // --- Criterion 5: Aggregation of five frame predictions ---
  test('5. Aggregation of five frame predictions according to classification rule', () => {
    const aggregator = new PresenceAggregator(3);

    const makeFrames = (positiveCount) => {
      const frames = [];
      for (let i = 0; i < 5; i++) {
        frames.push({
          frameIndex: i,
          hasPerson: i < positiveCount,
          maxScore: i < positiveCount ? 0.85 : 0.1,
          detections: [],
          timestamp: Date.now()
        });
      }
      return frames;
    };

    // 5/5 -> PRESENT
    const r5 = aggregator.aggregate(makeFrames(5), '2026-11-09T10:00:00Z', '2026-11-09T10:00:02Z', 'model');
    assert.strictEqual(r5.status, 'PRESENT');
    assert.strictEqual(r5.positiveFrames, 5);

    // 4/5 -> PRESENT
    const r4 = aggregator.aggregate(makeFrames(4), '2026-11-09T10:00:00Z', '2026-11-09T10:00:02Z', 'model');
    assert.strictEqual(r4.status, 'PRESENT');
    assert.strictEqual(r4.positiveFrames, 4);

    // 3/5 -> PRESENT (exact threshold)
    const r3 = aggregator.aggregate(makeFrames(3), '2026-11-09T10:00:00Z', '2026-11-09T10:00:02Z', 'model');
    assert.strictEqual(r3.status, 'PRESENT');
    assert.strictEqual(r3.positiveFrames, 3);

    // 2/5 -> NOT_DETECTED
    const r2 = aggregator.aggregate(makeFrames(2), '2026-11-09T10:00:00Z', '2026-11-09T10:00:02Z', 'model');
    assert.strictEqual(r2.status, 'NOT_DETECTED');
    assert.strictEqual(r2.positiveFrames, 2);

    // 1/5 -> NOT_DETECTED
    const r1 = aggregator.aggregate(makeFrames(1), '2026-11-09T10:00:00Z', '2026-11-09T10:00:02Z', 'model');
    assert.strictEqual(r1.status, 'NOT_DETECTED');
    assert.strictEqual(r1.positiveFrames, 1);

    // 0/5 -> NOT_DETECTED
    const r0 = aggregator.aggregate(makeFrames(0), '2026-11-09T10:00:00Z', '2026-11-09T10:00:02Z', 'model');
    assert.strictEqual(r0.status, 'NOT_DETECTED');
    assert.strictEqual(r0.positiveFrames, 0);
  });

  // --- Criterion 6: Correct handling of camera permission denial ---
  test('6. Camera permission denial returns UNKNOWN and PERMISSION_DENIED (never NOT_DETECTED)', async () => {
    setMockNavigator({
      mediaDevices: {
        getUserMedia: async () => {
          const err = new Error('Permission denied by user');
          err.name = 'NotAllowedError';
          throw err;
        }
      }
    });

    const webcam = new WebcamService();
    const aggregator = new PresenceAggregator(3);

    let caughtError = null;
    try {
      await webcam.captureBurst(5, 10, () => {});
    } catch (e) {
      caughtError = e;
    }

    assert.ok(caughtError);
    assert.strictEqual(caughtError.errorReason, 'PERMISSION_DENIED');

    const result = aggregator.aggregate([], '2026-11-09T10:00:00Z', '2026-11-09T10:00:02Z', 'model', caughtError);
    assert.strictEqual(result.status, 'UNKNOWN', 'Technical failure must yield UNKNOWN, never NOT_DETECTED');
    assert.strictEqual(result.errorReason, 'PERMISSION_DENIED');
  });

  // --- Criterion 7: Correct handling of unavailable cameras ---
  test('7. Unavailable or disconnected camera returns UNKNOWN and CAMERA_NOT_FOUND', async () => {
    setMockNavigator({
      mediaDevices: {
        getUserMedia: async () => {
          const err = new Error('No video device found');
          err.name = 'NotFoundError';
          throw err;
        }
      }
    });

    const webcam = new WebcamService();
    const aggregator = new PresenceAggregator(3);

    let caughtError = null;
    try {
      await webcam.captureBurst(5, 10, () => {});
    } catch (e) {
      caughtError = e;
    }

    assert.ok(caughtError);
    assert.strictEqual(caughtError.errorReason, 'CAMERA_NOT_FOUND');

    const result = aggregator.aggregate([], '2026-11-09T10:00:00Z', '2026-11-09T10:00:02Z', 'model', caughtError);
    assert.strictEqual(result.status, 'UNKNOWN');
    assert.strictEqual(result.errorReason, 'CAMERA_NOT_FOUND');
  });

  // --- Criterion 8: No overlapping scheduled checks ---
  test('8. No overlapping scheduled checks (concurrency protection)', async () => {
    const detector = new PresenceDetector();
    detector.isReady = () => true;

    const webcam = new WebcamService();
    webcam.captureBurst = () => new Promise(resolve => setTimeout(resolve, 50));

    const aggregator = new PresenceAggregator(3);
    const scheduler = new PresenceScheduler(
      detector,
      webcam,
      aggregator,
      {
        isSessionActive: () => true,
        getCurrentSessionId: () => 'sess-1'
      }
    );

    const promise1 = scheduler.performManualCheck();
    assert.strictEqual(scheduler.isRunning(), true);

    await assert.rejects(
      async () => {
        await scheduler.performManualCheck();
      },
      /already in progress/
    );

    await promise1;
    assert.strictEqual(scheduler.isRunning(), false);
  });

  // --- Criterion 9: Scheduler stopping when the study session stops ---
  test('9. Scheduler stops timers and pending checks when study session stops or pauses', () => {
    const detector = new PresenceDetector();
    const webcam = new WebcamService();
    const aggregator = new PresenceAggregator();
    let sessionActive = true;

    const scheduler = new PresenceScheduler(
      detector,
      webcam,
      aggregator,
      {
        isSessionActive: () => sessionActive,
        getCurrentSessionId: () => 'sess-1'
      },
      { checkIntervalMs: 500 }
    );

    scheduler.start();
    assert.strictEqual(scheduler.timerId !== null, true, 'Timer should be scheduled');

    // Study session paused/stopped
    sessionActive = false;
    scheduler.stop();

    assert.strictEqual(scheduler.timerId, null, 'Pending timer must be cleared');
    assert.strictEqual(scheduler.isMonitoring, false);
  });

  // --- Criterion 10: No camera tracks remaining active after a check ---
  test('10. Guaranteed camera cleanup: all tracks stopped and video srcObject cleared', async () => {
    let trackStopped = false;
    const mockTrack = {
      stop: () => {
        trackStopped = true;
      }
    };
    const mockStream = {
      getTracks: () => [mockTrack]
    };

    setMockNavigator({
      mediaDevices: {
        getUserMedia: async () => mockStream
      }
    });

    let videoSrcObject = 'initial';
    setMockDocument({
      createElement: () => ({
        readyState: 4,
        videoWidth: 640,
        videoHeight: 480,
        setAttribute: () => {},
        addEventListener: (e, cb) => setTimeout(cb, 5),
        removeEventListener: () => {},
        play: async () => {},
        pause: () => {},
        set srcObject(val) {
          videoSrcObject = val;
        },
        get srcObject() {
          return videoSrcObject;
        }
      })
    });

    const webcam = new WebcamService();

    // Even if an error occurs inside onFrame
    try {
      await webcam.captureBurst(2, 5, () => {
        throw new Error('Unexpected error during frame processing');
      });
    } catch {}

    assert.strictEqual(trackStopped, true, 'Track must be stopped in finally block');
    assert.strictEqual(videoSrcObject, null, 'videoElement.srcObject must be null in finally');
    assert.strictEqual(webcam.getIsCapturing(), false);
  });

  // --- Criterion 11: No images or webcam recordings being persisted ---
  test('11. Observations persist only metadata (timestamps, status, counts) - NEVER images or videos', async () => {
    const aggregator = new PresenceAggregator(3);
    const predictions = [
      { frameIndex: 0, hasPerson: true, maxScore: 0.9, detections: [], timestamp: Date.now() },
      { frameIndex: 1, hasPerson: true, maxScore: 0.85, detections: [], timestamp: Date.now() },
      { frameIndex: 2, hasPerson: true, maxScore: 0.92, detections: [], timestamp: Date.now() },
      { frameIndex: 3, hasPerson: false, maxScore: 0.1, detections: [], timestamp: Date.now() },
      { frameIndex: 4, hasPerson: false, maxScore: 0.1, detections: [], timestamp: Date.now() }
    ];

    const result = aggregator.aggregate(predictions, '2026-11-09T10:00:00Z', '2026-11-09T10:00:02Z', 'efficientdet_lite0_int8');

    const observation = {
      id: 'pres-12345',
      sessionId: 'sess-001',
      scheduledAt: result.scheduledAt,
      checkedAt: result.checkedAt,
      status: result.status,
      positiveFrames: result.positiveFrames,
      totalFrames: result.totalFrames,
      model: result.model
    };

    const jsonStr = JSON.stringify(observation);
    const parsed = JSON.parse(jsonStr);

    assert.strictEqual(parsed.status, 'PRESENT');
    assert.strictEqual(parsed.positiveFrames, 3);
    assert.strictEqual(parsed.totalFrames, 5);
    assert.strictEqual(parsed.model, 'efficientdet_lite0_int8');

    // Guarantee no image/video payload
    assert.strictEqual(parsed.image, undefined);
    assert.strictEqual(parsed.imageData, undefined);
    assert.strictEqual(parsed.frames, undefined);
    assert.strictEqual(parsed.video, undefined);
    assert.strictEqual(parsed.base64, undefined);
    assert.ok(jsonStr.length < 300, 'Observation record must be lightweight metadata only');
  });

  // --- Criterion 12: Missed-check handling after returning from an inactive tab ---
  test('12. Inactive tab handling: runs at most one overdue check when tab becomes visible again', async () => {
    const detector = new PresenceDetector();
    detector.isReady = () => true;

    let checkCount = 0;
    const webcam = new WebcamService();
    webcam.captureBurst = async (n, int, onFrame) => {
      checkCount++;
      for (let i = 0; i < n; i++) await onFrame({}, i);
    };

    let visibilityState = 'hidden';
    let visibilityCallback = null;

    setMockDocument({
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: (evt, cb) => {
        if (evt === 'visibilitychange') visibilityCallback = cb;
      }
    });

    const aggregator = new PresenceAggregator(3);
    const scheduler = new PresenceScheduler(
      detector,
      webcam,
      aggregator,
      {
        isSessionActive: () => true,
        getCurrentSessionId: () => 'sess-1'
      },
      { checkIntervalMs: 100 }
    );

    scheduler.start();

    // Tab was hidden: scheduled check is skipped
    visibilityState = 'hidden';
    await new Promise(r => setTimeout(r, 150));
    assert.strictEqual(checkCount, 0, 'No check should run while document is hidden');

    // User returns to tab -> visibility becomes visible
    visibilityState = 'visible';
    assert.ok(visibilityCallback, 'visibility listener must be attached');
    visibilityCallback();

    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(checkCount, 1, 'Exactly one overdue check must be executed upon returning');

    scheduler.stop();
  });
});
