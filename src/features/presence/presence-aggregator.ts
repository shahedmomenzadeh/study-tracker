/**
 * Presence Aggregator Service
 * Evaluates multiple frame predictions to determine the aggregate observation.
 * Classification rule: isPresent = positiveFrames >= 3 (out of 5).
 */

import {
  PresenceStatus,
  FramePrediction,
  PresenceCheckResult,
  PresenceErrorReason
} from './types';

export class PresenceAggregator {
  private minPositiveFrames: number;

  constructor(minPositiveFrames: number = 3) {
    this.minPositiveFrames = minPositiveFrames;
  }

  public setMinPositiveFrames(threshold: number): void {
    this.minPositiveFrames = Math.max(1, threshold);
  }

  /**
   * Evaluates a completed burst of frame predictions.
   * If there was a technical error, returns UNKNOWN.
   * Otherwise evaluates whether positiveFrames >= minPositiveFrames.
   */
  public aggregate(
    predictions: FramePrediction[],
    scheduledAt: string,
    checkedAt: string,
    modelName: string,
    error?: Error | null
  ): PresenceCheckResult {
    // Technical failure -> UNKNOWN (never NOT_DETECTED)
    if (error) {
      const errorReason = (error as any).errorReason as PresenceErrorReason || 'UNKNOWN_ERROR';
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
    const status: PresenceStatus = isPresent ? 'PRESENT' : 'NOT_DETECTED';

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

  /**
   * Determines if a retry burst should be performed.
   * If the first capture produced 0 positive frames and retry hasn't occurred yet,
   * a short retry burst may be performed to avoid false negatives due to brief occlusion.
   */
  public shouldRetry(
    predictions: FramePrediction[],
    alreadyRetried: boolean,
    maxRetries: number = 1
  ): boolean {
    if (alreadyRetried || maxRetries <= 0) return false;
    const positiveFrames = predictions.filter(p => p.hasPerson).length;
    // Retry if zero detections were found on initial pass
    return positiveFrames === 0 && predictions.length > 0;
  }
}

