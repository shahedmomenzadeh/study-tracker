/**
 * Periodic Human Presence Detection Module
 * Public API Entry Point
 */

export * from './types';
export * from './presence-detector';
export * from './webcam-service';
export * from './presence-aggregator';
export * from './presence-scheduler';

import { PresenceCheckConfig } from './types';
import { PresenceDetector } from './presence-detector';
import { WebcamService } from './webcam-service';
import { PresenceAggregator } from './presence-aggregator';
import { PresenceScheduler, PresenceSchedulerCallbacks } from './presence-scheduler';

export class PresenceService {
  public detector: PresenceDetector;
  public webcam: WebcamService;
  public aggregator: PresenceAggregator;
  public scheduler: PresenceScheduler;

  constructor(callbacks: PresenceSchedulerCallbacks, config: Partial<PresenceCheckConfig> = {}) {
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

  public start(): void {
    this.scheduler.start();
  }

  public stop(): void {
    this.scheduler.stop();
  }

  public checkNow() {
    return this.scheduler.performManualCheck();
  }

  public setEnabled(enabled: boolean): void {
    this.scheduler.setEnabled(enabled);
  }

  public isEnabled(): boolean {
    return this.scheduler.isEnabled();
  }

  public getLatestStatus() {
    return this.scheduler.getLatestStatus();
  }

  public getLastCheckTime() {
    return this.scheduler.getLastCheckTime();
  }

  public updateConfig(newConfig: Partial<PresenceCheckConfig>): void {
    this.scheduler.updateConfig(newConfig);
  }

  public dispose(): void {
    this.scheduler.stop();
    this.detector.close();
  }
}

