/**
 * Reusable MediaPipe Tasks Vision ObjectDetector Service
 * Runs on CPU using WASM, evaluates individual frames in IMAGE mode.
 */

import {
  PresenceCheckConfig,
  PersonDetection,
  FramePrediction
} from './types';

// Interface matching MediaPipe Tasks Vision types
interface MediaPipeVisionModule {
  FilesetResolver: {
    forVisionTasks(wasmPath: string): Promise<any>;
  };
  ObjectDetector: {
    createFromOptions(vision: any, options: any): Promise<any>;
  };
}

export class PresenceDetector {
  private detector: any = null;
  private visionInstance: any = null;
  private isInitializing: boolean = false;
  private initPromise: Promise<void> | null = null;
  private modelName: string = 'efficientdet_lite0_int8';
  private config: PresenceCheckConfig;

  constructor(config: Partial<PresenceCheckConfig> = {}) {
    this.config = {
      enabled: true,
      checkIntervalMs: 5 * 60 * 1000,
      framesPerCheck: 5,
      frameIntervalMs: 250,
      scoreThreshold: 0.5,
      minPositiveFrames: 3,
      maxRetries: 1,
      retryDelayMs: 1500,
      modelPath: './models/efficientdet_lite0_int8.tflite',
      wasmPath: './mediapipe/wasm',
      categoryAllowlist: ['person'],
      ...config
    };
  }

  public getModelName(): string {
    return this.modelName;
  }

  public isReady(): boolean {
    return this.detector !== null;
  }

  /**
   * Resolve MediaPipe Tasks Vision library from global scope or import
   */
  private async getVisionModule(): Promise<MediaPipeVisionModule> {
    if (typeof window !== 'undefined' && (window as any).Vision) {
      return (window as any).Vision;
    }
    if (typeof window !== 'undefined' && (window as any).tasksVision) {
      return (window as any).tasksVision;
    }

    try {
      const module = await import('@mediapipe/tasks-vision');
      return module as unknown as MediaPipeVisionModule;
    } catch (err: any) {
      throw new Error(`MediaPipe Tasks Vision library failed to load: ${err?.message || err}`);
    }
  }

  /**
   * Initialize MediaPipe WASM and ObjectDetector once.
   * Reuses the existing detector instance on subsequent calls.
   */
  public async initialize(): Promise<void> {
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
      } catch (err: any) {
        this.detector = null;
        throw new Error(`ObjectDetector initialization error: ${err?.message || err}`);
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  /**
   * Update configuration (e.g. score threshold)
   */
  public updateConfig(newConfig: Partial<PresenceCheckConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (this.detector && newConfig.scoreThreshold !== undefined) {
      try {
        this.detector.setOptions({
          scoreThreshold: this.config.scoreThreshold
        });
      } catch (e) {
        console.warn('Failed to update detector scoreThreshold option:', e);
      }
    }
  }

  /**
   * Run inference on a single video element frame.
   * Guaranteed to be non-destructive (no saving of frames or images).
   */
  public detectFrame(
    imageSource: HTMLVideoElement | HTMLCanvasElement | ImageData,
    frameIndex: number = 0
  ): FramePrediction {
    if (!this.detector) {
      throw new Error('Detector is not initialized. Call initialize() first.');
    }

    try {
      const result = this.detector.detect(imageSource);
      const personDetections: PersonDetection[] = [];
      let maxScore = 0;

      if (result && Array.isArray(result.detections)) {
        for (const detection of result.detections) {
          const personCategory = detection.categories?.find(
            (c: any) => c.categoryName.toLowerCase() === 'person' && c.score >= this.config.scoreThreshold
          );

          if (personCategory) {
            if (personCategory.score > maxScore) {
              maxScore = personCategory.score;
            }
            personDetections.push({
              score: personCategory.score,
              categoryName: personCategory.categoryName,
              boundingBox: detection.boundingBox
                ? {
                    originX: detection.boundingBox.originX,
                    originY: detection.boundingBox.originY,
                    width: detection.boundingBox.width,
                    height: detection.boundingBox.height
                  }
                : undefined
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
    } catch (err: any) {
      throw new Error(`Inference execution failed on frame ${frameIndex}: ${err?.message || err}`);
    }
  }

  /**
   * Dispose detector resources
   */
  public close(): void {
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

