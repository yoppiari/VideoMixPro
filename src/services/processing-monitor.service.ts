import logger from '@/utils/logger';
import crypto from 'crypto';

interface ProcessingStage {
  stage: string;
  timestamp: Date;
  settings?: any;
  videoCount?: number;
  details?: any;
  error?: string;
}

interface JobMonitorData {
  jobId: string;
  startTime: Date;
  stages: ProcessingStage[];
  settingsChecksum?: string;
  expectedVideoCount: number;
  actualVideoCount?: number;
  ffmpegCommand?: string;
  errors: string[];
}

export class ProcessingMonitorService {
  private static instance: ProcessingMonitorService;
  private monitors: Map<string, JobMonitorData> = new Map();
  private debugMode: boolean = process.env.DEBUG_MIXING === 'true';

  private constructor() {
    logger.info('[ProcessingMonitor] Service initialized, Debug mode:', this.debugMode);
  }

  public static getInstance(): ProcessingMonitorService {
    if (!ProcessingMonitorService.instance) {
      ProcessingMonitorService.instance = new ProcessingMonitorService();
    }
    return ProcessingMonitorService.instance;
  }

  /**
   * Start monitoring a new job
   */
  public startMonitoring(jobId: string, expectedVideoCount: number, initialSettings?: any): void {
    const monitorData: JobMonitorData = {
      jobId,
      startTime: new Date(),
      stages: [],
      expectedVideoCount,
      errors: []
    };

    if (initialSettings) {
      monitorData.settingsChecksum = this.calculateChecksum(initialSettings);
      this.logStage(jobId, 'INITIALIZATION', { settings: initialSettings });
    }

    this.monitors.set(jobId, monitorData);
    logger.info(`[ProcessingMonitor] Started monitoring job ${jobId}, expected ${expectedVideoCount} videos`);
  }

  /**
   * Log a processing stage
   */
  public logStage(jobId: string, stage: string, details?: any): void {
    const monitor = this.monitors.get(jobId);
    if (!monitor) {
      logger.warn(`[ProcessingMonitor] No monitor found for job ${jobId}`);
      return;
    }

    const stageData: ProcessingStage = {
      stage,
      timestamp: new Date(),
      details
    };

    // Extract video count if provided
    if (details?.videoCount !== undefined) {
      stageData.videoCount = details.videoCount;

      // Check for video count mismatch
      if (details.videoCount !== monitor.expectedVideoCount) {
        const error = `Video count mismatch at ${stage}: expected ${monitor.expectedVideoCount}, got ${details.videoCount}`;
        this.logError(jobId, error);
      }
    }

    // Extract settings if provided
    if (details?.settings) {
      stageData.settings = details.settings;

      // Verify settings checksum
      const checksum = this.calculateChecksum(details.settings);
      if (monitor.settingsChecksum && checksum !== monitor.settingsChecksum) {
        this.logError(jobId, `Settings checksum mismatch at ${stage}`);
      }
    }

    monitor.stages.push(stageData);

    if (this.debugMode) {
      logger.info(`[ProcessingMonitor][${jobId}] Stage: ${stage}`, JSON.stringify(details, null, 2));
    }
  }

  /**
   * Log an error
   */
  public logError(jobId: string, error: string): void {
    const monitor = this.monitors.get(jobId);
    if (!monitor) return;

    monitor.errors.push(error);
    logger.error(`[ProcessingMonitor][${jobId}] ERROR: ${error}`);
  }

  /**
   * Log FFmpeg command
   */
  public logFFmpegCommand(jobId: string, command: string): void {
    const monitor = this.monitors.get(jobId);
    if (!monitor) return;

    monitor.ffmpegCommand = command;

    // Analyze command for video inputs
    const inputCount = (command.match(/-i /g) || []).length;
    this.logStage(jobId, 'FFMPEG_COMMAND', {
      inputCount,
      commandLength: command.length,
      hasConcat: command.includes('concat'),
      hasTrim: command.includes('trim='),
      hasDuration: command.includes('-t ')
    });

    if (this.debugMode) {
      logger.info(`[ProcessingMonitor][${jobId}] FFmpeg Command:`, command);
    }
  }

  /**
   * Verify final output
   */
  public verifyOutput(jobId: string, outputPath: string, actualVideoCount: number): boolean {
    const monitor = this.monitors.get(jobId);
    if (!monitor) return false;

    monitor.actualVideoCount = actualVideoCount;

    const isValid = actualVideoCount === monitor.expectedVideoCount;

    if (!isValid) {
      this.logError(jobId, `Final output verification failed: expected ${monitor.expectedVideoCount} videos, got ${actualVideoCount}`);
    } else {
      this.logStage(jobId, 'OUTPUT_VERIFIED', {
        outputPath,
        videoCount: actualVideoCount,
        success: true
      });
    }

    return isValid;
  }

  /**
   * Get job report
   */
  public getReport(jobId: string): any {
    const monitor = this.monitors.get(jobId);
    if (!monitor) return null;

    const duration = new Date().getTime() - monitor.startTime.getTime();

    return {
      jobId,
      duration: `${duration}ms`,
      expectedVideoCount: monitor.expectedVideoCount,
      actualVideoCount: monitor.actualVideoCount,
      stagesCount: monitor.stages.length,
      errorsCount: monitor.errors.length,
      stages: monitor.stages,
      errors: monitor.errors,
      ffmpegCommand: monitor.ffmpegCommand,
      settingsChecksum: monitor.settingsChecksum,
      success: monitor.errors.length === 0 && monitor.actualVideoCount === monitor.expectedVideoCount
    };
  }

  /**
   * Clean up old monitors
   */
  public cleanup(jobId: string): void {
    const report = this.getReport(jobId);
    if (report) {
      logger.info(`[ProcessingMonitor] Job ${jobId} completed:`, JSON.stringify({
        success: report.success,
        duration: report.duration,
        errors: report.errorsCount,
        videoCount: `${report.actualVideoCount}/${report.expectedVideoCount}`
      }));
    }

    this.monitors.delete(jobId);
  }

  /**
   * Calculate checksum for settings
   */
  private calculateChecksum(settings: any): string {
    const normalized = JSON.stringify(settings, Object.keys(settings).sort());
    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  /**
   * Enable/disable debug mode
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    logger.info(`[ProcessingMonitor] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }
}

export default ProcessingMonitorService.getInstance();