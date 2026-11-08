const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  PresenceDetector,
  WebcamService,
  PresenceAggregator,
  PresenceScheduler
} = require('../src/renderer/presence');

describe('Absence Evidence & Dual Metrics Tests', () => {

  beforeEach(() => {
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 5);
  });

  test('Evidence snapshot is captured ONLY when status is NOT_DETECTED', async () => {
    let canvasCreated = false;
    const mockDocument = {
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
        if (tag === 'canvas') {
          canvasCreated = true;
          return {
            width: 0,
            height: 0,
            getContext: () => ({
              drawImage: () => {},
              fillRect: () => {},
              fillText: () => {}
            }),
            toDataURL: (mime, q) => 'data:image/jpeg;base64,mockAbsenceEvidenceBase64Data'
          };
        }
        return {};
      }
    };

    const mockNavigator = {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => {} }]
        })
      }
    };

    // 1. Test NOT_DETECTED case:
    const emptyRoomDetector = new PresenceDetector();
    emptyRoomDetector.isReady = () => true;
    emptyRoomDetector.detectFrame = (video, idx) => ({
      frameIndex: idx,
      hasPerson: false,
      maxScore: 0.1,
      detections: [],
      timestamp: Date.now()
    });

    const webcam = new WebcamService({}, mockNavigator, mockDocument);
    const aggregator = new PresenceAggregator(3);
    const scheduler = new PresenceScheduler(
      emptyRoomDetector,
      webcam,
      aggregator,
      {
        isSessionActive: () => true,
        getCurrentSessionId: () => 'sess-absence-test'
      },
      { captureAbsenceEvidence: true }
    );

    const observation = await scheduler.performManualCheck();
    assert.strictEqual(observation.status, 'NOT_DETECTED');
    assert.strictEqual(observation.positiveFrames, 0);
    assert.strictEqual(canvasCreated, true, 'Canvas should be created to capture frame snapshot on absence');
    assert.ok(observation.evidenceSnapshot, 'Evidence snapshot should be present on NOT_DETECTED');
    assert.strictEqual(observation.evidenceSnapshot.startsWith('data:image/jpeg;base64,'), true);

    // 2. Test PRESENT case: evidenceSnapshot must be null
    canvasCreated = false;
    const presentDetector = new PresenceDetector();
    presentDetector.isReady = () => true;
    presentDetector.detectFrame = (video, idx) => ({
      frameIndex: idx,
      hasPerson: true,
      maxScore: 0.95,
      detections: [{ score: 0.95, categoryName: 'person' }],
      timestamp: Date.now()
    });

    const presentScheduler = new PresenceScheduler(
      presentDetector,
      webcam,
      aggregator,
      {
        isSessionActive: () => true,
        getCurrentSessionId: () => 'sess-present-test'
      },
      { captureAbsenceEvidence: true }
    );

    const presentObs = await presentScheduler.performManualCheck();
    assert.strictEqual(presentObs.status, 'PRESENT');
    assert.strictEqual(presentObs.positiveFrames, 5);
    assert.strictEqual(presentObs.evidenceSnapshot, null, 'No image should ever be captured when student is present');
  });

  test('Dual study time metrics calculation (Nominal vs Verified)', () => {
    // 50 minutes nominal study session with 2 absence periods of 5 minutes each
    const nominalDuration = 50;
    const absences = [
      { fromTime: '10:15', toTime: '10:20', durationMinutes: 5, evidenceSnapshot: 'data:image/jpeg;base64,123' },
      { fromTime: '10:35', toTime: '10:40', durationMinutes: 5, evidenceSnapshot: 'data:image/jpeg;base64,456' }
    ];

    const totalAbsentMinutes = absences.reduce((sum, a) => sum + (a.durationMinutes || 0), 0);
    const absentMinutes = Math.min(nominalDuration, totalAbsentMinutes);
    const verifiedMinutes = Math.max(0, nominalDuration - absentMinutes);
    const attendancePercent = Math.round((verifiedMinutes / nominalDuration) * 100);

    assert.strictEqual(nominalDuration, 50, 'ساعت غیرواقعی (ثبت‌شده با تایمر)');
    assert.strictEqual(verifiedMinutes, 40, 'ساعت واقعی (با تأیید وبکم)');
    assert.strictEqual(absentMinutes, 10, 'مجموع زمان‌های عدم حضور');
    assert.strictEqual(attendancePercent, 80, 'درصد حضور مفید');
  });
});

