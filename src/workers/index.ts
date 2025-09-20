import { config } from 'dotenv';
import { createQueue, queueAdapter, QueueNames } from '@/utils/queue';
import { VideoProcessingService, ProcessingJobData } from '@/services/video-processing.service';
import logger from '@/utils/logger';
import { database } from '@/utils/database';

config();

const videoProcessingService = new VideoProcessingService();

// Create job queue using the adapter (will use in-memory queue in dev, Redis in prod)
const videoProcessingQueue = createQueue(QueueNames.VIDEO_PROCESSING, {
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});

// Process video processing jobs
videoProcessingQueue.process('mix-videos', 5, async (job) => {
  const { jobId, data } = job.data as { jobId: string; data: ProcessingJobData };

  logger.info(`Starting video processing job ${jobId}`);

  try {
    await videoProcessingService.queueProcessingJob(jobId, data);
    logger.info(`Video processing job ${jobId} completed successfully`);
    return { success: true, jobId };
  } catch (error) {
    // Extract detailed error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : '';

    logger.error(`Video processing job ${jobId} failed:`, {
      message: errorMessage,
      stack: errorStack,
      jobData: data
    });

    // Re-throw with enhanced error message for better debugging
    const enhancedError = new Error(`Job ${jobId} failed: ${errorMessage}`);
    if (error instanceof Error) {
      enhancedError.stack = error.stack;
    }
    throw enhancedError;
  }
});

// Process single video operations (metadata extraction, thumbnails, etc.)
videoProcessingQueue.process('extract-metadata', 10, async (job) => {
  const { filePath } = job.data as { filePath: string };

  logger.info(`Extracting metadata from ${filePath}`);

  try {
    const metadata = await videoProcessingService.extractVideoMetadata(filePath);
    logger.info(`Metadata extraction completed for ${filePath}`);
    return { success: true, metadata };
  } catch (error) {
    logger.error(`Metadata extraction failed for ${filePath}:`, error);
    throw error;
  }
});

// Process thumbnail generation jobs
videoProcessingQueue.process('generate-thumbnail', 10, async (job) => {
  const { videoPath, options } = job.data as {
    videoPath: string;
    options?: import('../services/video-processing.service').ThumbnailOptions
  };

  logger.info(`Generating thumbnail for ${videoPath}`);

  try {
    const thumbnailPath = await videoProcessingService.generateThumbnail(videoPath, options);
    logger.info(`Thumbnail generation completed: ${thumbnailPath}`);
    return { success: true, thumbnailPath };
  } catch (error) {
    logger.error(`Thumbnail generation failed for ${videoPath}:`, error);
    throw error;
  }
});

// Process video format conversion jobs
videoProcessingQueue.process('convert-video', 3, async (job) => {
  const { inputPath, options } = job.data as {
    inputPath: string;
    options: import('../services/video-processing.service').ConversionOptions
  };

  logger.info(`Converting video ${inputPath} to ${options.format}`);

  try {
    const outputPath = await videoProcessingService.convertVideoFormat(inputPath, options);
    logger.info(`Video conversion completed: ${outputPath}`);
    return { success: true, outputPath };
  } catch (error) {
    logger.error(`Video conversion failed for ${inputPath}:`, error);
    throw error;
  }
});

// Process watermark addition jobs
videoProcessingQueue.process('add-watermark', 5, async (job) => {
  const { videoPath, watermarkOptions } = job.data as {
    videoPath: string;
    watermarkOptions: import('../services/video-processing.service').WatermarkOptions
  };

  logger.info(`Adding watermark to ${videoPath}`);

  try {
    const outputPath = await videoProcessingService.addWatermark(videoPath, watermarkOptions);
    logger.info(`Watermark addition completed: ${outputPath}`);
    return { success: true, outputPath };
  } catch (error) {
    logger.error(`Watermark addition failed for ${videoPath}:`, error);
    throw error;
  }
});

// Process video concatenation jobs
videoProcessingQueue.process('concatenate-videos', 3, async (job) => {
  const { videoPaths, outputOptions } = job.data as {
    videoPaths: string[];
    outputOptions: import('../services/video-processing.service').VideoMixingOptions
  };

  logger.info(`Concatenating ${videoPaths.length} videos`);

  try {
    const outputPath = await videoProcessingService.concatenateVideos(videoPaths, outputOptions);
    logger.info(`Video concatenation completed: ${outputPath}`);
    return { success: true, outputPath };
  } catch (error) {
    logger.error(`Video concatenation failed:`, error);
    throw error;
  }
});

// Queue event handlers
videoProcessingQueue.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed successfully`, {
    jobName: job.name,
    result: result
  });
});

videoProcessingQueue.on('failed', (job, err) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error ? err.stack : '';

  logger.error(`Job ${job.id} failed`, {
    jobName: job.name,
    error: errorMessage,
    stack: errorStack,
    attempts: job.attemptsMade,
    data: job.data
  });
});

videoProcessingQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`, {
    jobName: job.name,
    data: job.data
  });
});

videoProcessingQueue.on('error', (error) => {
  logger.error('Queue error occurred:', {
    error: error.message,
    stack: error.stack
  });
});

videoProcessingQueue.on('active', (job) => {
  logger.info(`Job ${job.id} started processing`, {
    jobName: job.name
  });
});

// Export queue for use in controllers
export { videoProcessingQueue };

// Health check endpoint for workers
const startWorker = async (): Promise<void> => {
  try {
    // Connect to database
    await database.connect();
    logger.info('Database connected successfully');

    // Check FFmpeg availability
    const ffmpegAvailable = await videoProcessingService.checkFFmpegAvailability();
    if (!ffmpegAvailable) {
      logger.error('FFmpeg is not available! Video processing will fail.');
      logger.error('Please run: npm run setup:ffmpeg');
      process.exit(1);
    }
    logger.info('FFmpeg is available and working');

    // Log queue type being used
    const queueType = queueAdapter.isUsingInMemory() ? 'In-Memory Queue' : 'Redis Queue';
    logger.info(`Using ${queueType} for job processing`);

    // Log worker configuration
    logger.info('Video processing worker started');
    logger.info('Worker concurrency limits:');
    logger.info('  - Video mixing: 5 concurrent jobs');
    logger.info('  - Metadata extraction: 10 concurrent jobs');
    logger.info('  - Thumbnail generation: 10 concurrent jobs');
    logger.info('  - Video conversion: 3 concurrent jobs');
    logger.info('  - Watermark addition: 5 concurrent jobs');
    logger.info('  - Video concatenation: 3 concurrent jobs');
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Start periodic cleanup of temp files
    const cleanupInterval = setInterval(async () => {
      try {
        await videoProcessingService.cleanupTempFiles(1); // Clean files older than 1 hour
        logger.debug('Periodic temp file cleanup completed');
      } catch (error) {
        logger.error('Periodic cleanup failed:', error);
      }
    }, 60 * 60 * 1000); // Every hour

    // Log processing statistics periodically
    const statsInterval = setInterval(async () => {
      try {
        const stats = await videoProcessingService.getProcessingStats();
        logger.info(`Processing Stats - Active: ${stats.activeJobs}, Total: ${stats.totalProcessed}, Avg Time: ${stats.averageProcessingTime}s`);
      } catch (error) {
        logger.error('Failed to get processing stats:', error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down worker...');

      // Clear intervals
      clearInterval(cleanupInterval);
      clearInterval(statsInterval);

      // Close queue and connections
      await videoProcessingQueue.close();
      await database.disconnect();
      await queueAdapter.closeAll();

      logger.info('Worker shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in worker:', error);
      shutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection in worker:', reason);
      shutdown();
    });

  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startWorker();
}