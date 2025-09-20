import logger from '@/utils/logger';

export enum ErrorType {
  FFMPEG_NOT_FOUND = 'FFMPEG_NOT_FOUND',
  FFPROBE_NOT_FOUND = 'FFPROBE_NOT_FOUND',
  INPUT_FILE_NOT_FOUND = 'INPUT_FILE_NOT_FOUND',
  INVALID_INPUT_FORMAT = 'INVALID_INPUT_FORMAT',
  CORRUPTED_INPUT_FILE = 'CORRUPTED_INPUT_FILE',
  INSUFFICIENT_DISK_SPACE = 'INSUFFICIENT_DISK_SPACE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CODEC_NOT_SUPPORTED = 'CODEC_NOT_SUPPORTED',
  INVALID_FILTER_GRAPH = 'INVALID_FILTER_GRAPH',
  MEMORY_ALLOCATION_FAILED = 'MEMORY_ALLOCATION_FAILED',
  OUTPUT_ALREADY_EXISTS = 'OUTPUT_ALREADY_EXISTS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface ErrorInfo {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  possibleCauses: string[];
  suggestedActions: string[];
  retryable: boolean;
  maxRetries: number;
  retryDelay: number; // in milliseconds
}

export interface ProcessingError {
  id: string;
  type: ErrorType;
  severity: ErrorSeverity;
  originalError: Error;
  context: {
    operation: string;
    inputFiles?: string[];
    outputFile?: string;
    command?: string;
    timestamp: Date;
  };
  recoveryAttempts: number;
  resolved: boolean;
  userNotified: boolean;
}

export class ErrorHandlingService {
  private errorDatabase = new Map<string, ProcessingError>();
  private errorPatterns = new Map<RegExp, ErrorInfo>();

  constructor() {
    this.initializeErrorPatterns();
  }

  private initializeErrorPatterns(): void {
    // FFmpeg not found
    this.errorPatterns.set(
      /ffmpeg.*not found|Cannot find ffmpeg/i,
      {
        type: ErrorType.FFMPEG_NOT_FOUND,
        severity: ErrorSeverity.CRITICAL,
        message: 'FFmpeg executable not found',
        userMessage: 'Video processing software is not installed or accessible.',
        possibleCauses: [
          'FFmpeg is not installed on the system',
          'FFmpeg is not in the system PATH',
          'Incorrect FFmpeg path configuration'
        ],
        suggestedActions: [
          'Install FFmpeg using the setup script',
          'Verify FFmpeg installation',
          'Check FFmpeg path configuration'
        ],
        retryable: false,
        maxRetries: 0,
        retryDelay: 0
      }
    );

    // FFprobe not found
    this.errorPatterns.set(
      /ffprobe.*not found|Cannot find ffprobe/i,
      {
        type: ErrorType.FFPROBE_NOT_FOUND,
        severity: ErrorSeverity.HIGH,
        message: 'FFprobe executable not found',
        userMessage: 'Video analysis tool is not available.',
        possibleCauses: [
          'FFprobe is not installed',
          'FFprobe is not in the system PATH'
        ],
        suggestedActions: [
          'Install FFmpeg package (includes FFprobe)',
          'Verify FFprobe installation'
        ],
        retryable: false,
        maxRetries: 0,
        retryDelay: 0
      }
    );

    // Input file not found
    this.errorPatterns.set(
      /No such file or directory|Input file.*does not exist/i,
      {
        type: ErrorType.INPUT_FILE_NOT_FOUND,
        severity: ErrorSeverity.HIGH,
        message: 'Input file not found',
        userMessage: 'The video file could not be found.',
        possibleCauses: [
          'File was deleted or moved',
          'Incorrect file path',
          'Network storage issue'
        ],
        suggestedActions: [
          'Verify file exists',
          'Check file permissions',
          'Re-upload the video file'
        ],
        retryable: true,
        maxRetries: 2,
        retryDelay: 5000
      }
    );

    // Invalid input format
    this.errorPatterns.set(
      /Invalid data found when processing input|Unknown format/i,
      {
        type: ErrorType.INVALID_INPUT_FORMAT,
        severity: ErrorSeverity.MEDIUM,
        message: 'Invalid or unsupported input format',
        userMessage: 'The video format is not supported or the file is corrupted.',
        possibleCauses: [
          'Unsupported video format',
          'Corrupted file header',
          'Incomplete file upload'
        ],
        suggestedActions: [
          'Convert to a supported format (MP4, MOV, AVI)',
          'Re-upload the file',
          'Check file integrity'
        ],
        retryable: false,
        maxRetries: 0,
        retryDelay: 0
      }
    );

    // Corrupted input
    this.errorPatterns.set(
      /corrupt|Invalid.*stream|Error reading packet/i,
      {
        type: ErrorType.CORRUPTED_INPUT_FILE,
        severity: ErrorSeverity.MEDIUM,
        message: 'Input file appears to be corrupted',
        userMessage: 'The video file seems to be damaged or corrupted.',
        possibleCauses: [
          'File corruption during upload',
          'Incomplete file transfer',
          'Storage medium error'
        ],
        suggestedActions: [
          'Re-upload the file',
          'Try a different file',
          'Check original file integrity'
        ],
        retryable: true,
        maxRetries: 1,
        retryDelay: 0
      }
    );

    // Insufficient disk space
    this.errorPatterns.set(
      /No space left on device|Disk full|Cannot allocate memory/i,
      {
        type: ErrorType.INSUFFICIENT_DISK_SPACE,
        severity: ErrorSeverity.CRITICAL,
        message: 'Insufficient disk space or memory',
        userMessage: 'Not enough storage space to process the video.',
        possibleCauses: [
          'Disk space exhausted',
          'Memory allocation failed',
          'Temporary directory full'
        ],
        suggestedActions: [
          'Free up disk space',
          'Contact system administrator',
          'Try processing smaller files'
        ],
        retryable: true,
        maxRetries: 1,
        retryDelay: 30000
      }
    );

    // Permission denied
    this.errorPatterns.set(
      /Permission denied|Access denied|Operation not permitted/i,
      {
        type: ErrorType.PERMISSION_DENIED,
        severity: ErrorSeverity.HIGH,
        message: 'Permission denied accessing file or directory',
        userMessage: 'Access to the file or directory was denied.',
        possibleCauses: [
          'Insufficient file permissions',
          'Directory access restrictions',
          'Security policy violation'
        ],
        suggestedActions: [
          'Check file permissions',
          'Contact system administrator',
          'Verify user access rights'
        ],
        retryable: true,
        maxRetries: 1,
        retryDelay: 5000
      }
    );

    // Codec not supported
    this.errorPatterns.set(
      /Codec.*not currently supported|Unknown codec/i,
      {
        type: ErrorType.CODEC_NOT_SUPPORTED,
        severity: ErrorSeverity.MEDIUM,
        message: 'Video codec not supported',
        userMessage: 'The video codec is not supported by the processing engine.',
        possibleCauses: [
          'Rare or proprietary codec',
          'Codec not included in FFmpeg build',
          'Codec license restrictions'
        ],
        suggestedActions: [
          'Convert video to a standard format',
          'Use a different video file',
          'Contact support for codec compatibility'
        ],
        retryable: false,
        maxRetries: 0,
        retryDelay: 0
      }
    );

    // Invalid filter graph
    this.errorPatterns.set(
      /Invalid.*filter|Filter.*not found|Cannot find.*filter/i,
      {
        type: ErrorType.INVALID_FILTER_GRAPH,
        severity: ErrorSeverity.MEDIUM,
        message: 'Invalid filter configuration',
        userMessage: 'Video processing filter configuration error.',
        possibleCauses: [
          'Invalid filter parameters',
          'Incompatible filter chain',
          'Missing filter dependencies'
        ],
        suggestedActions: [
          'Use default processing settings',
          'Simplify video processing options',
          'Contact support for advanced settings'
        ],
        retryable: true,
        maxRetries: 2,
        retryDelay: 1000
      }
    );

    // Output file exists
    this.errorPatterns.set(
      /File.*already exists|Output file.*exists/i,
      {
        type: ErrorType.OUTPUT_ALREADY_EXISTS,
        severity: ErrorSeverity.LOW,
        message: 'Output file already exists',
        userMessage: 'A file with the same name already exists.',
        possibleCauses: [
          'Previous processing attempt',
          'Filename collision',
          'Concurrent processing'
        ],
        suggestedActions: [
          'Use unique filename',
          'Overwrite existing file',
          'Choose different output location'
        ],
        retryable: true,
        maxRetries: 3,
        retryDelay: 1000
      }
    );

    // Network errors
    this.errorPatterns.set(
      /Connection.*refused|Network.*unreachable|Timeout/i,
      {
        type: ErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.MEDIUM,
        message: 'Network connectivity issue',
        userMessage: 'Network connection problem occurred.',
        possibleCauses: [
          'Internet connection lost',
          'Server temporarily unavailable',
          'Network configuration issue'
        ],
        suggestedActions: [
          'Check internet connection',
          'Retry after a few moments',
          'Contact network administrator'
        ],
        retryable: true,
        maxRetries: 3,
        retryDelay: 10000
      }
    );
  }

  /**
   * Analyze and classify an error
   */
  analyzeError(error: Error, context: {
    operation: string;
    inputFiles?: string[];
    outputFile?: string;
    command?: string;
  }): ProcessingError {
    const errorMessage = error.message || error.toString();
    let errorInfo: ErrorInfo | null = null;

    // Match error against known patterns
    for (const [pattern, info] of this.errorPatterns) {
      if (pattern.test(errorMessage)) {
        errorInfo = info;
        break;
      }
    }

    // Default to unknown error if no pattern matches
    if (!errorInfo) {
      errorInfo = {
        type: ErrorType.UNKNOWN_ERROR,
        severity: ErrorSeverity.MEDIUM,
        message: 'Unknown error occurred',
        userMessage: 'An unexpected error occurred during video processing.',
        possibleCauses: ['Unexpected system error', 'Software bug', 'Resource limitation'],
        suggestedActions: ['Retry the operation', 'Contact support if problem persists'],
        retryable: true,
        maxRetries: 2,
        retryDelay: 5000
      };
    }

    const processingError: ProcessingError = {
      id: this.generateErrorId(),
      type: errorInfo.type,
      severity: errorInfo.severity,
      originalError: error,
      context: {
        ...context,
        timestamp: new Date()
      },
      recoveryAttempts: 0,
      resolved: false,
      userNotified: false
    };

    this.errorDatabase.set(processingError.id, processingError);
    this.logError(processingError, errorInfo);

    return processingError;
  }

  /**
   * Determine if an error should be retried
   */
  shouldRetry(errorId: string): boolean {
    const error = this.errorDatabase.get(errorId);
    if (!error) return false;

    const errorInfo = this.getErrorInfo(error.type);
    if (!errorInfo?.retryable) return false;

    return error.recoveryAttempts < errorInfo.maxRetries;
  }

  /**
   * Get retry delay for an error
   */
  getRetryDelay(errorId: string): number {
    const error = this.errorDatabase.get(errorId);
    if (!error) return 0;

    const errorInfo = this.getErrorInfo(error.type);
    if (!errorInfo) return 5000;

    // Exponential backoff with jitter
    const baseDelay = errorInfo.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, error.recoveryAttempts);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter

    return Math.min(exponentialDelay + jitter, 300000); // Max 5 minutes
  }

  /**
   * Record a recovery attempt
   */
  recordRecoveryAttempt(errorId: string): void {
    const error = this.errorDatabase.get(errorId);
    if (error) {
      error.recoveryAttempts++;
      logger.info(`Recovery attempt ${error.recoveryAttempts} for error ${errorId}`);
    }
  }

  /**
   * Mark error as resolved
   */
  markResolved(errorId: string): void {
    const error = this.errorDatabase.get(errorId);
    if (error) {
      error.resolved = true;
      logger.info(`Error ${errorId} marked as resolved after ${error.recoveryAttempts} attempts`);
    }
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(errorId: string): string {
    const error = this.errorDatabase.get(errorId);
    if (!error) return 'An unknown error occurred.';

    const errorInfo = this.getErrorInfo(error.type);
    return errorInfo?.userMessage || 'An unexpected error occurred.';
  }

  /**
   * Get suggested actions for an error
   */
  getSuggestedActions(errorId: string): string[] {
    const error = this.errorDatabase.get(errorId);
    if (!error) return [];

    const errorInfo = this.getErrorInfo(error.type);
    return errorInfo?.suggestedActions || [];
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsBySeverity: Record<string, number>;
    resolvedErrors: number;
    pendingErrors: number;
  } {
    const stats = {
      totalErrors: this.errorDatabase.size,
      errorsByType: {} as Record<string, number>,
      errorsBySeverity: {} as Record<string, number>,
      resolvedErrors: 0,
      pendingErrors: 0
    };

    for (const error of this.errorDatabase.values()) {
      // Count by type
      stats.errorsByType[error.type] = (stats.errorsByType[error.type] || 0) + 1;

      // Count by severity
      stats.errorsBySeverity[error.severity] = (stats.errorsBySeverity[error.severity] || 0) + 1;

      // Count resolved vs pending
      if (error.resolved) {
        stats.resolvedErrors++;
      } else {
        stats.pendingErrors++;
      }
    }

    return stats;
  }

  /**
   * Clean up old resolved errors
   */
  cleanupResolvedErrors(olderThanHours: number = 24): void {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);

    for (const [id, error] of this.errorDatabase) {
      if (error.resolved && error.context.timestamp < cutoffTime) {
        this.errorDatabase.delete(id);
      }
    }

    logger.info(`Cleaned up resolved errors older than ${olderThanHours} hours`);
  }

  /**
   * Generate system health report
   */
  generateHealthReport(): {
    status: 'healthy' | 'warning' | 'critical';
    criticalErrors: number;
    recentErrors: number;
    recommendations: string[];
  } {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    let criticalErrors = 0;
    let recentErrors = 0;

    for (const error of this.errorDatabase.values()) {
      if (error.severity === ErrorSeverity.CRITICAL && !error.resolved) {
        criticalErrors++;
      }
      if (error.context.timestamp > oneHourAgo) {
        recentErrors++;
      }
    }

    const recommendations: string[] = [];

    if (criticalErrors > 0) {
      recommendations.push('Address critical errors immediately');
    }

    if (recentErrors > 10) {
      recommendations.push('High error rate detected - investigate system health');
    }

    const status = criticalErrors > 0 ? 'critical' :
                   recentErrors > 5 ? 'warning' : 'healthy';

    return {
      status,
      criticalErrors,
      recentErrors,
      recommendations
    };
  }

  private getErrorInfo(type: ErrorType): ErrorInfo | null {
    for (const [, info] of this.errorPatterns) {
      if (info.type === type) {
        return info;
      }
    }
    return null;
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private logError(error: ProcessingError, errorInfo: ErrorInfo): void {
    const logData = {
      errorId: error.id,
      type: error.type,
      severity: error.severity,
      operation: error.context.operation,
      message: errorInfo.message,
      retryable: errorInfo.retryable,
      maxRetries: errorInfo.maxRetries
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('Critical error occurred:', logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('High severity error:', logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('Medium severity error:', logData);
        break;
      case ErrorSeverity.LOW:
        logger.info('Low severity error:', logData);
        break;
    }
  }
}