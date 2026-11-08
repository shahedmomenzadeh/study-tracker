/**
 * Types and interfaces for Periodic Human Presence Detection
 */

export type PresenceStatus = 'PRESENT' | 'NOT_DETECTED' | 'UNKNOWN';

export type PresenceErrorReason =
  | 'PERMISSION_DENIED'
  | 'CAMERA_NOT_FOUND'
  | 'CAMERA_UNAVAILABLE'
  | 'FRAME_CAPTURE_FAILED'
  | 'MODEL_NOT_INITIALIZED'
  | 'INFERENCE_FAILED'
  | 'APP_INACTIVE'
  | 'UNKNOWN_ERROR';

export interface PersonDetection {
  score: number;
  categoryName: string;
  boundingBox?: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
}

export interface FramePrediction {
  frameIndex: number;
  hasPerson: boolean;
  maxScore: number;
  detections: PersonDetection[];
  timestamp: number;
}

export interface PresenceObservation {
  id: string;
  sessionId: string;
  scheduledAt: string;
  checkedAt: string;
  status: PresenceStatus;
  positiveFrames: number;
  totalFrames: number;
  model: string;
  errorReason?: string;
  evidenceSnapshot?: string | null;
}

export interface AbsenceInterval {
  id?: string;
  fromTime: string;
  toTime: string;
  durationMinutes: number;
  evidenceSnapshot?: string | null;
  checkedAt: string;
  timestamp: number;
}

export interface PresenceCheckResult {
  status: PresenceStatus;
  positiveFrames: number;
  totalFrames: number;
  predictions: FramePrediction[];
  checkedAt: string;
  scheduledAt: string;
  model: string;
  errorReason?: string;
  retried?: boolean;
}

export interface PresenceCheckConfig {
  enabled: boolean;
  checkIntervalMs: number;
  framesPerCheck: number;
  frameIntervalMs: number;
  scoreThreshold: number;
  minPositiveFrames: number;
  maxRetries: number;
  retryDelayMs: number;
  modelPath: string;
  wasmPath: string;
  categoryAllowlist: string[];
  persistSessionStream?: boolean;
  captureAbsenceEvidence?: boolean;
}

export interface WebcamOptions {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment' | string;
  captureTimeoutMs?: number;
  persistSessionStream?: boolean;
}

