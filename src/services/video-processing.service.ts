import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs/promises';
import { database, prisma } from '@/utils/database';
import { MixingMode, VideoFormat, VideoQuality, JobStatus as JobStatusType, ProjectStatus as ProjectStatusType, TransactionType as TransactionTypeType } from '@/types';
import { JobStatus, ProjectStatus, TransactionType } from '@/utils/database';
import logger from '@/utils/logger';
import { promisify } from 'util';
import { AutoMixingService, VideoClip, VideoGroup } from './auto-mixing.service';
import processingMonitor from './processing-monitor.service';
import { ErrorHandlingService } from './error-handling.service';
import { RetryService } from './retry.service';
import { voiceOverService } from './voice-over.service';

// Set FFmpeg and FFprobe paths
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// Set FFprobe path
try {
  const ffprobeStatic = require('ffprobe-static');
  if (ffprobeStatic && ffprobeStatic.path) {
    ffmpeg.setFfprobePath(ffprobeStatic.path);
  }
} catch (error) {
  logger.warn('ffprobe-static not found, using system ffprobe');
}

export interface ProcessingJobData {
  projectId: string;
  outputCount: number;
  settings: VideoMixingOptions;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  resolution: string;
  format: string;
  bitrate: number;
  fps: number;
  codec: string;
  fileSize: number;
  audioCodec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
}

export interface ThumbnailOptions {
  timeOffset?: number; // Time in seconds
  width?: number;
  height?: number;
  quality?: number; // 1-31, lower is better
  format?: 'png' | 'jpg';
}

export interface WatermarkOptions {
  text?: string;
  imagePath?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity?: number; // 0-1
  fontSize?: number;
  fontColor?: string;
}

export interface ConversionOptions {
  format: VideoFormat;
  quality: VideoQuality;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: string;
  audioCodec?: string;
  videoCodec?: string;
}

export interface VideoMixingOptions {
  mixingMode: MixingMode;
  outputFormat: VideoFormat;
  quality: VideoQuality;
  metadata: {
    static: Record<string, string>;
    includeDynamic: boolean;
    fields: string[];
  };
  watermark?: WatermarkOptions;
  crossfadeDuration?: number; // Duration in seconds
  enableTransitions?: boolean;

  // Core mixing options
  orderMixing?: boolean;
  speedMixing?: boolean;
  differentStartingVideo?: boolean;
  groupMixing?: boolean;

  // Audio options
  audioMode?: 'keep' | 'mute' | 'voiceover';
  voiceOverMode?: boolean;

  // Speed settings
  speedRange?: { min: number; max: number };
  speedVariations?: boolean;

  // Duration settings
  durationDistributionMode?: 'proportional' | 'equal' | 'weighted';
  smartTrimming?: boolean;

  // Transition and color options
  transitionMixing?: boolean;
  transitionVariations?: boolean;
  colorVariations?: boolean;
}

// Prisma client is imported from database adapter

export class VideoProcessingService {
  private activeJobs = new Map<string, boolean>();
  private ffmpegProcesses = new Map<string, any>(); // Store FFmpeg child processes for cancellation
  private readonly tempDir = process.env.TEMP_DIR || 'temp';
  private readonly outputDir = process.env.OUTPUT_DIR || 'outputs';
  private readonly thumbnailDir = process.env.THUMBNAIL_DIR || 'thumbnails';
  private autoMixingService = new AutoMixingService();
  private errorHandlingService = new ErrorHandlingService();
  private retryService = new RetryService(this.errorHandlingService);

  constructor() {
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    await Promise.all([
      fs.mkdir(this.tempDir, { recursive: true }),
      fs.mkdir(this.outputDir, { recursive: true }),
      fs.mkdir(this.thumbnailDir, { recursive: true })
    ]);
  }

  async queueProcessingJob(jobId: string, data: ProcessingJobData): Promise<void> {
    try {
      logger.info(`[QUEUE] Starting queue for job ${jobId}`);

      // Check if job is already cancelled or completed
      const job = await prisma.processingJob.findUnique({
        where: { id: jobId },
        select: { status: true }
      });

      if (!job) {
        logger.error(`Job ${jobId} not found in database`);
        return;
      }

      logger.info(`[QUEUE] Job ${jobId} found with status: ${job.status}`);

      // Don't process cancelled, completed, or failed jobs
      if (job.status === JobStatus.CANCELLED) {
        logger.info(`Job ${jobId} is cancelled, skipping processing`);
        return;
      }

      if (job.status === JobStatus.COMPLETED) {
        logger.info(`Job ${jobId} is already completed, skipping processing`);
        return;
      }

      if (job.status === JobStatus.FAILED) {
        logger.info(`Job ${jobId} has failed, skipping processing`);
        return;
      }

      // Mark job as active
      this.activeJobs.set(jobId, true);

      logger.info(`[QUEUE] Scheduling processVideo for job ${jobId} via setImmediate`);

      // In production, this would use Bull Queue or similar
      // For now, we'll process immediately in background
      setImmediate(async () => {
        try {
          logger.info(`[SETIMMEDIATE] Starting processVideo for job ${jobId}`);
          await this.processVideo(jobId, data);
          logger.info(`[SETIMMEDIATE] Completed processVideo for job ${jobId}`);
        } catch (error) {
          // Catch any unhandled errors from processVideo
          logger.error(`[SETIMMEDIATE] Unhandled error in processVideo for job ${jobId}:`, error);
          console.error('CRITICAL: Unhandled error in setImmediate:', error);

          // Try to update job status with the actual error
          try {
            await prisma.processingJob.update({
              where: { id: jobId },
              data: {
                status: JobStatus.FAILED,
                errorMessage: error instanceof Error ? error.message : 'Unknown error in setImmediate',
                completedAt: new Date()
              }
            });
          } catch (updateError) {
            logger.error(`Failed to update job ${jobId} after unhandled error:`, updateError);
          }
        }
      });
    } catch (error) {
      logger.error(`Failed to queue job ${jobId}:`, error);
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    // Mark job as cancelled in memory
    this.activeJobs.set(jobId, false);

    // Kill FFmpeg process if running
    const ffmpegProcess = this.ffmpegProcesses.get(jobId);
    if (ffmpegProcess) {
      logger.info(`Killing FFmpeg process for job ${jobId}`);
      try {
        // Kill the process and all its children
        if (process.platform === 'win32') {
          // On Windows, use taskkill to kill process tree
          const { exec } = await import('child_process');
          exec(`taskkill //pid ${ffmpegProcess.pid} //T //F`, (error) => {
            if (error) {
              logger.error(`Failed to kill FFmpeg process: ${error.message}`);
            }
          });
        } else {
          // On Unix-like systems
          ffmpegProcess.kill('SIGKILL');
        }
        this.ffmpegProcesses.delete(jobId);
      } catch (error) {
        logger.error(`Error killing FFmpeg process for job ${jobId}:`, error);
      }
    }

    // Update database to ensure cancellation persists
    try {
      await prisma.processingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.CANCELLED,
          completedAt: new Date()
        }
      });

      // Update project status
      const job = await prisma.processingJob.findUnique({
        where: { id: jobId },
        select: { projectId: true }
      });

      if (job) {
        // DISABLED: Project status field doesn't exist in schema
        // await prisma.project.update({
        //   where: { id: job.projectId },
        //   data: { status: ProjectStatus.DRAFT }
        // });
      }
    } catch (error) {
      logger.error(`Failed to update cancelled job ${jobId} in database:`, error);
    }

    logger.info(`Job ${jobId} cancelled and database updated`);
  }

  /**
   * Extract comprehensive metadata from a video file
   */
  async extractVideoMetadata(filePath: string): Promise<VideoMetadata> {
    try {
      logger.info(`Extracting metadata from: ${filePath}`);

      const metadata = await new Promise<any>((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      const videoStream = metadata.streams.find((stream: any) => stream.codec_type === 'video');
      const audioStream = metadata.streams.find((stream: any) => stream.codec_type === 'audio');
      const format = metadata.format;

      if (!videoStream) {
        throw new Error('No video stream found in file');
      }

      const stats = await fs.stat(filePath);

      const result: VideoMetadata = {
        duration: parseFloat(format.duration) || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        resolution: `${videoStream.width}x${videoStream.height}`,
        format: format.format_name || 'unknown',
        bitrate: parseInt(format.bit_rate) || 0,
        fps: this.parseFPS(videoStream.r_frame_rate || videoStream.avg_frame_rate) || 0,
        codec: videoStream.codec_name || 'unknown',
        fileSize: stats.size,
        audioCodec: audioStream?.codec_name,
        audioChannels: audioStream?.channels,
        audioSampleRate: audioStream?.sample_rate
      };

      logger.info(`Metadata extracted successfully: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      logger.error(`Failed to extract metadata from ${filePath}:`, error);
      throw new Error(`Metadata extraction failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate thumbnail from video at specified time
   */
  async generateThumbnail(videoPath: string, options: ThumbnailOptions = {}): Promise<string> {
    try {
      const {
        timeOffset = 1,
        width = 320,
        height = 240,
        quality = 2,
        format = 'jpg'
      } = options;

      const filename = `thumb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${format}`;
      const outputPath = path.join(this.thumbnailDir, filename);

      logger.info(`Generating thumbnail for ${videoPath} at ${timeOffset}s`);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .screenshots({
            timestamps: [timeOffset],
            filename,
            folder: this.thumbnailDir,
            size: `${width}x${height}`
          })
          .on('end', () => {
            logger.info(`Thumbnail generated: ${outputPath}`);
            resolve();
          })
          .on('error', (err) => {
            logger.error('Thumbnail generation failed:', err);
            reject(err);
          });
      });

      return outputPath;
    } catch (error) {
      logger.error('Thumbnail generation error:', error);
      throw new Error(`Thumbnail generation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Convert video to different format
   */
  async convertVideoFormat(inputPath: string, options: ConversionOptions): Promise<string> {
    try {
      const timestamp = Date.now();
      const outputFilename = `converted_${timestamp}.${options.format.toLowerCase()}`;
      const outputPath = path.join(this.outputDir, outputFilename);

      logger.info(`Converting ${inputPath} to ${options.format}`);

      await new Promise<void>((resolve, reject) => {
        let command = ffmpeg(inputPath);

        // Set video codec and quality
        command = this.applyQualitySettings(command, options.quality);

        // Set custom dimensions if provided
        if (options.width && options.height) {
          command = command.size(`${options.width}x${options.height}`);
        }

        // Set FPS if provided
        if (options.fps) {
          command = command.fps(options.fps);
        }

        // Set custom bitrate if provided
        if (options.bitrate) {
          command = command.videoBitrate(options.bitrate);
        }

        // Set codecs if provided
        if (options.videoCodec) {
          command = command.videoCodec(options.videoCodec);
        }
        if (options.audioCodec) {
          command = command.audioCodec(options.audioCodec);
        }

        command
          .output(outputPath)
          .on('start', (commandLine) => {
            logger.info(`FFmpeg conversion started: ${commandLine}`);
          })
          .on('progress', (progress) => {
            logger.debug(`Conversion progress: ${progress.percent}%`);
          })
          .on('end', () => {
            logger.info(`Video conversion completed: ${outputPath}`);
            resolve();
          })
          .on('error', (err) => {
            logger.error('Video conversion failed:', err);
            reject(err);
          })
          .run();
      });

      return outputPath;
    } catch (error) {
      logger.error('Video conversion error:', error);
      throw new Error(`Video conversion failed: ${(error as Error).message}`);
    }
  }

  /**
   * Add watermark to video
   */
  async addWatermark(videoPath: string, watermarkOptions: WatermarkOptions): Promise<string> {
    try {
      const timestamp = Date.now();
      const outputFilename = `watermarked_${timestamp}.mp4`;
      const outputPath = path.join(this.outputDir, outputFilename);

      logger.info(`Adding watermark to ${videoPath}`);

      await new Promise<void>((resolve, reject) => {
        let command = ffmpeg(videoPath);
        let filterComplex: string[] = [];

        if (watermarkOptions.text) {
          // Text watermark
          const position = this.getTextPosition(watermarkOptions.position || 'bottom-right');
          const fontSize = watermarkOptions.fontSize || 24;
          const fontColor = watermarkOptions.fontColor || 'white';
          const opacity = watermarkOptions.opacity || 0.7;

          filterComplex.push(
            `drawtext=text='${watermarkOptions.text}':fontsize=${fontSize}:fontcolor=${fontColor}@${opacity}:x=${position.x}:y=${position.y}`
          );
        } else if (watermarkOptions.imagePath) {
          // Image watermark
          command = command.input(watermarkOptions.imagePath);
          const position = this.getImagePosition(watermarkOptions.position || 'bottom-right');
          const opacity = watermarkOptions.opacity || 0.7;

          filterComplex.push(
            `[0:v][1:v]overlay=${position.x}:${position.y}:format=auto,format=yuv420p`
          );
        }

        if (filterComplex.length > 0) {
          command = command.complexFilter(filterComplex);
        }

        command
          .output(outputPath)
          .on('start', (commandLine) => {
            logger.info(`FFmpeg watermark process started: ${commandLine}`);
          })
          .on('progress', (progress) => {
            logger.debug(`Watermark progress: ${progress.percent}%`);
          })
          .on('end', () => {
            logger.info(`Watermark added successfully: ${outputPath}`);
            resolve();
          })
          .on('error', (err) => {
            logger.error('Watermark addition failed:', err);
            reject(err);
          })
          .run();
      });

      return outputPath;
    } catch (error) {
      logger.error('Watermark addition error:', error);
      throw new Error(`Watermark addition failed: ${(error as Error).message}`);
    }
  }

  /**
   * Concatenate multiple videos with optional transitions
   */
  async concatenateVideos(videoPaths: string[], outputOptions: VideoMixingOptions): Promise<string> {
    try {
      const timestamp = Date.now();
      const outputFilename = `concatenated_${timestamp}.${outputOptions.outputFormat.toLowerCase()}`;
      const outputPath = path.join(this.outputDir, outputFilename);

      logger.info(`Concatenating ${videoPaths.length} videos`);

      // Create temporary concat file for FFmpeg
      const concatFilePath = path.join(this.tempDir, `concat_${timestamp}.txt`);
      const concatContent = videoPaths.map(path => `file '${path.replace(/'/g, "\\'")}'`).join('\n');
      await fs.writeFile(concatFilePath, concatContent);

      await new Promise<void>((resolve, reject) => {
        let command = ffmpeg()
          .input(concatFilePath)
          .inputOptions(['-f', 'concat', '-safe', '0']);

        // Apply quality settings
        command = this.applyQualitySettings(command, outputOptions.quality);

        // Add metadata if specified
        if (outputOptions.metadata) {
          command = this.addMetadata(command, outputOptions.metadata, []);
        }

        command
          .output(outputPath)
          .on('start', (commandLine) => {
            logger.info(`FFmpeg concatenation started: ${commandLine}`);
          })
          .on('progress', (progress) => {
            logger.debug(`Concatenation progress: ${progress.percent}%`);
          })
          .on('end', async () => {
            // Clean up temporary file
            await fs.unlink(concatFilePath).catch(() => {});
            logger.info(`Video concatenation completed: ${outputPath}`);
            resolve();
          })
          .on('error', async (err) => {
            // Clean up temporary file
            await fs.unlink(concatFilePath).catch(() => {});
            logger.error('Video concatenation failed:', err);
            reject(err);
          })
          .run();
      });

      return outputPath;
    } catch (error) {
      logger.error('Video concatenation error:', error);
      throw new Error(`Video concatenation failed: ${(error as Error).message}`);
    }
  }

  private async processVideo(jobId: string, data: ProcessingJobData): Promise<void> {
    logger.info(`[PROCESS] processVideo started for job ${jobId}, projectId: ${data.projectId}`);
    this.activeJobs.set(jobId, true);
    let project: any = undefined; // Declare project outside try block

    try {
      logger.info(`[PROCESS] Updating job status to PROCESSING for job ${jobId}`);
      await this.updateJobStatusWithDetails(jobId, JobStatus.PROCESSING, 0, 'Initializing video processing');

      logger.info(`[PROCESS] Fetching project ${data.projectId} from database`);
      project = await prisma.project.findUnique({
        where: { id: data.projectId },
        include: {
          videos: {
            include: {
              group: true
            }
          },
          groups: {
            include: {
              videos: true
            },
            orderBy: { order: 'asc' }
          }
          // voiceOverFiles disabled - feature incomplete
        }
      });

      logger.info(`[PROCESS] Project fetched. Project exists: ${!!project}`);

      if (!project) {
        throw new Error('Project not found');
      }

      // Debug logging: check what data we got from database
      console.log('=== PROJECT DATA DEBUG ===');
      console.log('Project ID:', project.id);
      console.log('Project Name:', project.name);
      console.log('Videos count:', project.videos?.length || 0);
      console.log('Videos:', JSON.stringify(project.videos || [], null, 2));
      console.log('Groups count:', project.groups?.length || 0);
      console.log('=== END PROJECT DATA ===');

      // Store debug info in job for troubleshooting
      await prisma.processingJob.update({
        where: { id: jobId },
        data: {
          errorMessage: `[DEBUG] Starting - ${project.videos?.length || 0} videos, ${project.groups?.length || 0} groups`
        }
      });

      const settings = data.settings;
      const outputs: string[] = [];

      // Check if this is voice over mode processing
      const isVoiceOverMode = (settings as any).voiceOverMode === true || (settings as any).audioMode === 'voiceover';

      // Start monitoring this job
      const expectedVideoCount = project.videos.length;
      processingMonitor.startMonitoring(jobId, expectedVideoCount, settings);
      processingMonitor.logStage(jobId, 'PROJECT_LOADED', {
        videoCount: expectedVideoCount,
        projectName: project.name,
        settings,
        isVoiceOverMode,
        voiceOverCount: 0 // project.voiceOverFiles?.length || 0 - disabled
      });

      // Voice Over Mode Processing
      if (isVoiceOverMode) {
        logger.info(`[Voice Over Mode] Processing ${data.outputCount} outputs with voice over`);

        // Voice-over feature disabled - incomplete implementation
        throw new Error('Voice over mode is currently disabled');
        /*
        if (!project.voiceOverFiles || project.voiceOverFiles.length === 0) {
          throw new Error('Voice over mode requires at least one voice over file');
        }

        // Assign voice overs to outputs using round-robin
        const voiceOverAssignments = voiceOverService.assignVoiceOversToOutputs(
          project.voiceOverFiles,
          data.outputCount
        );
        */

        for (let i = 0; i < data.outputCount; i++) {
          // Check if job was cancelled
          const jobStatus = await prisma.processingJob.findUnique({
            where: { id: jobId },
            select: { status: true }
          });

          if (!this.activeJobs.get(jobId) || jobStatus?.status === JobStatus.CANCELLED) {
            logger.info(`Job ${jobId} was cancelled`);
            return;
          }

          const progress = Math.round((i / data.outputCount) * 80);
          const currentOutput = i + 1;
          // const voiceOver = voiceOverAssignments[i]; // Disabled

          await this.updateJobStatusWithDetails(
            jobId,
            JobStatus.PROCESSING,
            progress,
            `Processing voice over output ${currentOutput}/${data.outputCount}`
          );

          // logger.info(`[Voice Over] Output ${currentOutput}: Using voice over "${voiceOver.originalName}"`);

          // Process video with voice over - DISABLED
          throw new Error('Voice over mode is currently disabled');
          /*
          const outputPath = await this.processVoiceOverOutput(
            project,
            voiceOver,
            settings,
            i,
            jobId
          );

          outputs.push(outputPath);

          // Note: Output files will be saved to database later via saveOutputFiles()
          // to avoid duplication
          */
        }
      } else {
        // Normal processing mode
        // CRITICAL FIX: Pre-generate all variants for "Different Starting Video" feature
        let preGeneratedVariants: any[] | null = null;
        if (settings.differentStartingVideo && !settings.groupMixing) {
          logger.info(`[Pre-Generation] Generating all variants upfront for Different Starting Video feature`);
          preGeneratedVariants = await this.preGenerateVariants(project, settings, data.outputCount);
          logger.info(`[Pre-Generation] Generated ${preGeneratedVariants.length} variants for ${data.outputCount} outputs`);
        }

        for (let i = 0; i < data.outputCount; i++) {
        // Check if job was cancelled - check both memory and database
        const jobStatus = await prisma.processingJob.findUnique({
          where: { id: jobId },
          select: { status: true }
        });

        if (!this.activeJobs.get(jobId) || jobStatus?.status === JobStatus.CANCELLED) {
          logger.info(`Job ${jobId} was cancelled`);
          // Clean up FFmpeg process if exists
          const ffmpegProcess = this.ffmpegProcesses.get(jobId);
          if (ffmpegProcess) {
            this.ffmpegProcesses.delete(jobId);
          }
          return;
        }

        const progress = Math.round((i / data.outputCount) * 80); // Reserve 20% for finalization
        const currentOutput = i + 1;

        // Determine mixing mode based on settings
        // Use group-based mixing only if explicitly enabled AND groups have videos
        const hasGroupsWithVideos = project.groups &&
                                   project.groups.length > 0 &&
                                   project.groups.some((g: any) => g.videos && g.videos.length > 0);

        const useGroupMixing = settings.groupMixing === true && hasGroupsWithVideos;
        const mixingMode = useGroupMixing ? 'manual' : 'auto';

        const statusMessage = `Processing output ${currentOutput} of ${data.outputCount} (${mixingMode} mode)`;

        await this.updateJobStatusWithDetails(jobId, JobStatus.PROCESSING, progress, statusMessage);

        let outputPath: string;

        if (!useGroupMixing) {
          await this.updateJobStatusWithDetails(
            jobId,
            JobStatus.PROCESSING,
            progress + 5,
            `Analyzing content for intelligent auto-mixing (${currentOutput}/${data.outputCount})`
          );
          outputPath = await this.processAutoMixing(project, settings, i, preGeneratedVariants);
        } else {
          await this.updateJobStatusWithDetails(
            jobId,
            JobStatus.PROCESSING,
            progress + 5,
            `Processing manual group-based mixing (${currentOutput}/${data.outputCount})`
          );
          outputPath = await this.processManualMixing(project, settings, i);
        }

        if (outputPath) {
          outputs.push(outputPath);
          await this.updateJobStatusWithDetails(
            jobId,
            JobStatus.PROCESSING,
            progress + 15,
            `Completed output ${currentOutput}/${data.outputCount} - ${path.basename(outputPath)}`
          );
        }
      }
      } // End of else block (Normal processing mode)

      // Save output files to database
      await this.updateJobStatusWithDetails(jobId, JobStatus.PROCESSING, 90, 'Saving output files to database');
      await this.saveOutputFiles(jobId, outputs, settings);

      await this.updateJobStatusWithDetails(
        jobId,
        JobStatus.COMPLETED,
        100,
        `Successfully processed ${outputs.length} output file(s)`
      );
      await this.updateProjectStatus(data.projectId, ProjectStatus.COMPLETED);

      // Mark any pending retries as successful
      await this.markJobSuccessful(jobId);

      logger.info(`Job ${jobId} completed successfully with ${outputs.length} outputs`);
    } catch (error) {
      const errorObj = error as any;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Enhanced error logging with more context
      const errorDetails = {
        jobId,
        projectId: data.projectId,
        errorMessage,
        errorType: error?.constructor?.name || 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        ffmpegExitCode: errorObj.ffmpegExitCode,
        ffmpegStderr: errorObj.ffmpegStderr ? errorObj.ffmpegStderr.slice(-1000) : undefined,
        settings: data.settings,
        outputCount: data.outputCount,
        timestamp: new Date().toISOString(),
        processMemory: process.memoryUsage(),
        nodeVersion: process.version
      };

      logger.error(`Job ${jobId} failed with detailed context:`, errorDetails);
      console.error('=== PROCESSING ERROR DETAILS ===');
      console.error(JSON.stringify(errorDetails, null, 2));
      console.error('=== END PROCESSING ERROR ===');

      // Try to schedule retry before marking as failed
      const context = {
        operation: 'video_processing',
        inputFiles: project?.videos?.map((f: any) => f.path) || [],
        outputFile: undefined,
        command: `Processing job ${jobId}`
      };

      const retryScheduled = await this.retryService.scheduleRetry(
        jobId,
        error as Error,
        context
      );

      if (!retryScheduled) {
        // Build user-friendly error message
        let userMessage = 'Video processing failed';

        // Check for specific FFmpeg errors
        if (errorObj.ffmpegExitCode !== undefined) {
          if (errorMessage.includes('No such file')) {
            userMessage = 'Input video files not found. Please re-upload your videos.';
          } else if (errorMessage.includes('Invalid data found')) {
            userMessage = 'Invalid video format detected. Please ensure your videos are in a supported format.';
          } else if (errorMessage.includes('codec parameters')) {
            userMessage = 'Unable to read video codec. The video file may be corrupted.';
          } else if (errorMessage.includes('moov atom')) {
            userMessage = 'Video file is incomplete or corrupted. Please re-upload.';
          } else if (errorMessage.includes('Unknown encoder')) {
            userMessage = 'Video codec not supported. Please convert to H.264 format.';
          } else if (errorMessage.includes('Conversion failed')) {
            userMessage = 'Failed to process video. This may be due to incompatible video formats.';
          } else {
            userMessage = `Video processing failed: ${errorMessage.substring(0, 200)}`;
          }
        } else {
          // Non-FFmpeg error - SHOW ACTUAL ERROR MESSAGE
          logger.error(`[PROCESS] Non-FFmpeg error for job ${jobId}: ${errorMessage}`);

          // Use actual error message instead of generic one
          userMessage = `Error: ${errorMessage}`;

          // Add stack trace first line for debugging
          if (error instanceof Error && error.stack) {
            const firstStackLine = error.stack.split('\n')[1]?.trim() || '';
            if (firstStackLine) {
              userMessage += ` | At: ${firstStackLine}`;
            }
          }
        }

        logger.info(`[PROCESS] Updating job ${jobId} with error: ${userMessage}`);

        await this.updateJobStatusWithDetails(
          jobId,
          JobStatus.FAILED,
          0,
          'Processing failed',
          userMessage
        );
        await this.updateProjectStatus(data.projectId, ProjectStatus.FAILED);

        // Refund credits if job failed
        await this.refundCreditsForFailedJob(jobId);
      } else {
        logger.info(`Job ${jobId} scheduled for retry due to error: ${errorMessage}`);
        // Job will remain in processing state until retry
      }
    } finally {
      if (!await this.isJobBeingRetried(jobId)) {
        this.activeJobs.delete(jobId);
      }
    }
  }

  private async preGenerateVariants(project: any, settings: any, outputCount: number): Promise<any[]> {
    const videoFiles = project.videos;

    // Convert video files to VideoClip format for auto-mixing service
    const clips: VideoClip[] = videoFiles.map((file: any) => ({
      id: file.id,
      path: file.path || `uploads/${file.filename}`, // Construct path from filename if not present
      duration: file.duration || 30,
      metadata: {
        resolution: file.resolution,
        format: file.format,
        bitrate: file.metadata?.bitrate
      },
      originalName: file.originalName,
      groupId: file.groupId
    }));

    // Check if voice over mode is enabled
    const isVoiceOverMode = (settings as any).voiceOverMode === true || (settings as any).audioMode === 'voiceover';

    // Sanitize settings (same as in processAutoMixing)
    const sanitizedSettings = {
      // Core mixing options
      orderMixing: Boolean(settings.orderMixing),
      // Force speedMixing to false in voice over mode
      speedMixing: isVoiceOverMode ? false : Boolean(settings.speedMixing),
      differentStartingVideo: Boolean(settings.differentStartingVideo),
      groupMixing: Boolean(settings.groupMixing),

      // Speed settings with validation
      speedRange: settings.speedRange || { min: 0.5, max: 2 },
      allowedSpeeds: Array.isArray(settings.allowedSpeeds) ? settings.allowedSpeeds : [0.5, 0.75, 1, 1.25, 1.5, 2],

      // Group mixing settings
      groupMixingMode: (settings.groupMixingMode === 'random' ? 'random' : 'strict') as 'strict' | 'random',

      // Removed features - force to safe defaults
      transitionMixing: false,
      transitionTypes: [],
      transitionDuration: { min: 0, max: 0 },
      colorVariations: false,
      colorIntensity: 'low' as const,

      // Quality settings with validation
      metadataSource: ['normal', 'capcut', 'vn', 'inshot'].includes(settings.metadataSource) ? settings.metadataSource : 'normal',
      bitrate: ['low', 'medium', 'high'].includes(settings.bitrate) ? settings.bitrate : 'medium',
      resolution: ['sd', 'hd', 'fullhd'].includes(settings.resolution) ? settings.resolution : 'hd',
      frameRate: [24, 30, 60].includes(settings.frameRate) ? settings.frameRate : 30,

      // Duration and audio settings
      aspectRatio: settings.aspectRatio || 'original',
      durationType: settings.durationType || 'original',
      fixedDuration: typeof settings.fixedDuration === 'number' ? settings.fixedDuration : 30,
      durationDistributionMode: settings.durationDistributionMode || 'proportional',
      smartTrimming: Boolean(settings.smartTrimming),
      audioMode: (settings.audioMode === 'mute' ? 'mute' : 'keep') as 'keep' | 'mute',

      // Output count with validation
      outputCount: Math.max(1, Math.min(100, Number(outputCount) || 5))
    };

    // Map sanitized settings to auto-mixing service format
    const mixingSettings = {
      ...sanitizedSettings,
      bitrate: this.mapQualityToBitrate(sanitizedSettings.bitrate),
      resolution: this.mapQualityToResolution(sanitizedSettings.resolution)
    };

    // Generate ALL variants at once
    const variants = await this.autoMixingService.generateVariants(clips, mixingSettings);

    logger.info(`[Pre-Generation] Generated ${variants.length} total variants for Different Starting Video selection`);

    return variants;
  }

  private async processAutoMixing(project: any, settings: any, index: number, preGeneratedVariants?: any[]): Promise<string> {
    const videoFiles = project.videos;

    // Enhanced logging for debugging
    logger.info(`[Auto-Mixing] Starting auto-mixing for output ${index + 1}`);
    logger.info(`[Auto-Mixing] Project "${project.name}" has ${videoFiles.length} video files`);

    if (videoFiles.length === 0) {
      throw new Error('No video files to process');
    }

    // Allow single video processing - just duplicate or loop it
    // No minimum requirement, we'll handle single video case in processing

    // Log details of each video file
    videoFiles.forEach((file: any, idx: number) => {
      logger.info(`[Auto-Mixing] Video ${idx + 1}/${videoFiles.length}: ${file.originalName} - ID: ${file.id}, Path: ${file.path}, Duration: ${file.duration}s`);
    });

    // Convert video files to VideoClip format for auto-mixing service
    const clips: VideoClip[] = videoFiles.map((file: any) => ({
      id: file.id,
      path: file.path || `uploads/${file.filename}`, // Construct path from filename if not present
      duration: file.duration || 30,
      metadata: {
        resolution: file.resolution,
        format: file.format,
        bitrate: file.metadata?.bitrate
      },
      originalName: file.originalName,
      groupId: file.groupId
    }));

    logger.info(`[Auto-Mixing] Converted ${videoFiles.length} video files to ${clips.length} clips for processing`);

    // Check if voice over mode is enabled
    const isVoiceOverMode = (settings as any).voiceOverMode === true || (settings as any).audioMode === 'voiceover';

    // Validate and sanitize settings with fallbacks for removed properties
    const sanitizedSettings = {
      // Core mixing options
      orderMixing: Boolean(settings.orderMixing),
      // Force speedMixing to false in voice over mode
      speedMixing: isVoiceOverMode ? false : Boolean(settings.speedMixing),
      differentStartingVideo: Boolean(settings.differentStartingVideo),
      groupMixing: Boolean(settings.groupMixing),

      // Speed settings with validation
      speedRange: settings.speedRange || { min: 0.5, max: 2 },
      allowedSpeeds: Array.isArray(settings.allowedSpeeds) ? settings.allowedSpeeds : [0.5, 0.75, 1, 1.25, 1.5, 2],

      // Group mixing settings
      groupMixingMode: (settings.groupMixingMode === 'random' ? 'random' : 'strict') as 'strict' | 'random',

      // Removed features - force to safe defaults
      transitionMixing: false,
      transitionTypes: [],
      transitionDuration: { min: 0, max: 0 },
      colorVariations: false,
      colorIntensity: 'low' as const,

      // Quality settings with validation
      metadataSource: ['normal', 'capcut', 'vn', 'inshot'].includes(settings.metadataSource) ? settings.metadataSource : 'normal',
      bitrate: ['low', 'medium', 'high'].includes(settings.bitrate) ? settings.bitrate : 'medium',
      resolution: ['sd', 'hd', 'fullhd'].includes(settings.resolution) ? settings.resolution : 'hd',
      frameRate: [24, 30, 60].includes(settings.frameRate) ? settings.frameRate : 30,

      // Duration and audio settings
      aspectRatio: settings.aspectRatio || 'original',
      durationType: settings.durationType || 'original',
      fixedDuration: typeof settings.fixedDuration === 'number' ? settings.fixedDuration : 30,
      durationDistributionMode: settings.durationDistributionMode || 'proportional',
      smartTrimming: Boolean(settings.smartTrimming),
      audioMode: (settings.audioMode === 'mute' ? 'mute' : 'keep') as 'keep' | 'mute',

      // Output count with validation
      outputCount: Math.max(1, Math.min(100, Number(settings.outputCount) || 5))
    };

    // Log sanitized settings for debugging
    logger.info('[ProcessAutoMixing] Sanitized settings:', {
      original: settings,
      sanitized: sanitizedSettings,
      note: 'Transition and color features disabled for stability'
    });

    // Map sanitized settings to auto-mixing service format
    const mixingSettings = {
      // Use sanitized settings for safety
      ...sanitizedSettings,

      // Override specific mappings for compatibility
      bitrate: this.mapQualityToBitrate(sanitizedSettings.bitrate),
      resolution: this.mapQualityToResolution(sanitizedSettings.resolution)
    };

    // Log complete settings for debugging
    logger.info('[Settings Validation] Processing with settings:', JSON.stringify({
      durationType: mixingSettings.durationType,
      fixedDuration: mixingSettings.fixedDuration,
      smartTrimming: mixingSettings.smartTrimming,
      durationDistributionMode: mixingSettings.durationDistributionMode,
      videoCount: clips.length,
      outputCount: mixingSettings.outputCount
    }));

    // Track settings in monitor
    processingMonitor.logStage('current-job', 'AUTO_MIXING_SETTINGS', {
      settings: mixingSettings,
      videoCount: clips.length,
      hasSmartTrimming: mixingSettings.smartTrimming,
      durationType: mixingSettings.durationType
    });

    // Prepare groups if group mixing is enabled
    let groups = undefined;
    if (settings.groupMixing && project.groups && project.groups.length > 0) {
      groups = project.groups.map((group: any) => ({
        id: group.id,
        name: group.name,
        order: group.order,
        videos: clips.filter(clip => clip.groupId === group.id)
      }));

      // Filter out empty groups
      groups = groups.filter((group: any) => group.videos.length > 0);
    }

    // Use pre-generated variants if available (for Different Starting Video feature)
    let variants;
    if (preGeneratedVariants) {
      logger.info(`[Auto-Mixing] Using pre-generated variants for Different Starting Video (${preGeneratedVariants.length} available)`);
      variants = preGeneratedVariants;
    } else {
      // Generate variants based on new mixing settings (fallback)
      logger.info(`[Auto-Mixing] Generating variants with ${clips.length} clips`);
      variants = await this.autoMixingService.generateVariants(clips, mixingSettings, groups);
      logger.info(`[Auto-Mixing] Generated ${variants.length} variants`);
    }

    if (index >= variants.length) {
      throw new Error(`Not enough variants generated. Requested: ${index + 1}, Available: ${variants.length}`);
    }

    const variant = variants[index];
    logger.info(`[Auto-Mixing] Selected variant ${variant.id} with ${variant.videoOrder.length} videos in order: [${variant.videoOrder.join(', ')}]`);

    // Verify all videos in variant order exist in clips
    const clipIds = clips.map(c => c.id);
    variant.videoOrder.forEach(vid => {
      if (!clipIds.includes(vid)) {
        logger.error(`[Auto-Mixing] ERROR: Variant contains video ID ${vid} which is not in clips array!`);
      }
    });

    // Build output path
    const outputFileName = `output_${index + 1}_${Date.now()}.mp4`;
    const outputPath = path.join(this.outputDir, outputFileName);
    logger.info(`[Auto-Mixing] Output will be saved to: ${outputPath}`);

    // Build FFmpeg command for this variant
    logger.info(`[Auto-Mixing] Building FFmpeg command with ${clips.length} clips for variant`);
    const ffmpegCommand = this.autoMixingService.buildFFmpegCommand(
      variant,
      clips,
      outputPath
    );

    // Execute FFmpeg command
    await this.executeFFmpegCommand(ffmpegCommand);

    logger.info(`Successfully generated variant ${index + 1}`);
    return outputPath;
  }

  private async executeFFmpegCommand(command: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
      const child_process = require('child_process');

      // Log the full command for debugging - ALWAYS log this for troubleshooting
      logger.info(`Executing FFmpeg command with ${command.length} arguments`);
      logger.info(`Full FFmpeg command: ${command.join(' ')}`);

      // Extract input count from command for verification
      const inputCount = command.filter(arg => arg === '-i').length;
      logger.info(`[FFmpeg Verification] Processing ${inputCount} input videos`);

      // Track FFmpeg command in monitor
      processingMonitor.logFFmpegCommand('current-job', `${ffmpegPath} ${command.join(' ')}`);

      const proc = child_process.spawn(ffmpegPath, command); // Use command array directly (no 'ffmpeg' in array)

      let stderr = '';
      let fullStderr = ''; // Capture complete stderr for debugging
      let lastProgress = '';
      let errorMessages: string[] = [];

      proc.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        fullStderr += output; // Capture complete stderr

        // Capture specific error patterns
        const errorPatterns = [
          /Error.*?: (.*)/i,
          /Invalid.*?: (.*)/i,
          /No such file or directory: (.*)/i,
          /Unknown encoder '(.*)'/i,
          /Conversion failed!/i,
          /could not find codec parameters/i,
          /moov atom not found/i,
          /Invalid data found when processing input/i
        ];

        errorPatterns.forEach(pattern => {
          const match = output.match(pattern);
          if (match) {
            errorMessages.push(match[0]);
            logger.error(`FFmpeg error detected: ${match[0]}`);
          }
        });

        // Log progress if needed
        const progress = output.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (progress && progress[1] !== lastProgress) {
          lastProgress = progress[1];
          logger.debug(`FFmpeg progress: ${progress[1]}`);
        }
      });

      proc.on('close', (code: number) => {
        if (code === 0) {
          logger.info('FFmpeg command completed successfully');
          resolve();
        } else {
          // Build detailed error message
          let errorMessage = `FFmpeg process failed with exit code ${code}`;

          // Add Windows-specific error code descriptions
          if (code === 3221225794) {
            errorMessage += ' (0xC0000142 - Application failed to initialize properly, command may be malformed)';
          } else if (code === 3221225477) {
            errorMessage += ' (0xC0000005 - Access violation)';
          } else if (code === 1) {
            errorMessage += ' (General error - check input files and parameters)';
          }

          if (errorMessages.length > 0) {
            errorMessage = `FFmpeg error: ${errorMessages.join('; ')}`;
          } else {
            // Try to extract meaningful error from stderr
            const errorLines = stderr.split('\n').filter(line =>
              line.includes('Error') ||
              line.includes('Invalid') ||
              line.includes('No such') ||
              line.includes('failed') ||
              line.includes('Unable') ||
              line.includes('Cannot') ||
              line.includes('not found') ||
              line.includes('does not exist')
            ).slice(-15); // Get last 15 error lines for more context

            if (errorLines.length > 0) {
              errorMessage = `FFmpeg failed: ${errorLines.join('; ')}`;
            }
          }

          // Log full stderr for debugging with command details
          logger.error(errorMessage);
          logger.error(`FFmpeg command was: ${ffmpegPath} ${command.join(' ')}`);
          if (fullStderr.length > 0) {
            // Log complete FFmpeg output for troubleshooting
            logger.error(`[FFmpeg Full Output] Complete stderr output:\n${fullStderr}`);

            // Also check for trim issues
            const trimWarnings = fullStderr.match(/trim.*?invalid|trim.*?exceed|trim.*?out of range/gi);
            if (trimWarnings) {
              logger.error(`[FFmpeg Trim Issues] Found trim problems: ${trimWarnings.join('; ')}`);
            }
          }

          const error = new Error(errorMessage);
          (error as any).ffmpegExitCode = code;
          (error as any).ffmpegStderr = fullStderr || stderr;
          reject(error);
        }
      });

      proc.on('error', (err: Error) => {
        const errorMessage = `Failed to start FFmpeg process: ${err.message}`;
        logger.error(errorMessage, {
          error: err.message,
          stack: err.stack,
          ffmpegPath: ffmpegPath
        });
        const error = new Error(errorMessage);
        (error as any).originalError = err;
        reject(error);
      });
    });
  }

  private async processManualMixing(project: any, settings: VideoMixingOptions, index: number): Promise<string> {
    const groups = project.groups;

    if (groups.length === 0) {
      throw new Error('No video groups configured for manual mixing');
    }

    const selectedVideos: any[] = [];

    // Select one random video from each group in order
    for (const group of groups) {
      if (group.videoFiles.length > 0) {
        const randomVideo = group.videoFiles[Math.floor(Math.random() * group.videoFiles.length)];
        selectedVideos.push(randomVideo);
      }
    }

    if (selectedVideos.length === 0) {
      throw new Error('No videos found in groups');
    }

    return this.combineVideos(selectedVideos, settings, `manual_mix_${index + 1}`);
  }

  /**
   * Process a single output with voice over
   */
  private async processVoiceOverOutput(
    project: any,
    voiceOver: any,
    settings: any,
    outputIndex: number,
    jobId: string
  ): Promise<string> {
    try {
      const timestamp = Date.now();
      const outputName = `voice_over_output_${outputIndex + 1}_${timestamp}`;

      // Create a variant with different starting video for variety
      const videos = project.videoFiles;
      let orderedVideos = [...videos];

      // Rotate videos for different starting points if enabled
      if (settings.differentStartingVideo && videos.length > 1) {
        const rotations = outputIndex % videos.length;
        for (let i = 0; i < rotations; i++) {
          orderedVideos.push(orderedVideos.shift()!);
        }
        logger.info(`[Voice Over] Rotated videos ${rotations} times for output ${outputIndex + 1}`);
      }

      // First, create the mixed video without voice over
      const mixedVideoPath = await this.combineVideos(orderedVideos, settings, `temp_${outputName}`);

      // Get durations
      const videoDuration = await this.getVideoDuration(mixedVideoPath);
      const voiceDuration = voiceOver.duration;

      logger.info(`[Voice Over] Video duration: ${videoDuration}s, Voice duration: ${voiceDuration}s`);

      // Calculate optimal speed for matching durations
      const optimalSpeed = voiceOverService.calculateOptimalSpeed(videoDuration, voiceDuration);

      let finalVideoPath = mixedVideoPath;

      // Apply speed adjustment if needed
      if (Math.abs(optimalSpeed - 1.0) > 0.05) {
        logger.info(`[Voice Over] Applying speed adjustment: ${optimalSpeed}x`);
        const speedAdjustedPath = path.join(
          this.outputDir,
          `speed_adjusted_${outputName}.mp4`
        );
        finalVideoPath = await voiceOverService.applySpeedToVideo(
          mixedVideoPath,
          optimalSpeed,
          speedAdjustedPath
        );

        // Clean up temp mixed video
        try {
          await fs.unlink(mixedVideoPath);
        } catch (error) {
          logger.warn(`Failed to delete temp file: ${mixedVideoPath}`);
        }
      }

      // Merge video with voice over
      const outputPath = path.join(
        this.outputDir,
        `${outputName}_final.mp4`
      );

      const mergedPath = await voiceOverService.mergeVideoWithVoiceOver(
        finalVideoPath,
        voiceOver.path,
        outputPath
      );

      // Clean up intermediate files
      if (finalVideoPath !== mixedVideoPath) {
        try {
          await fs.unlink(finalVideoPath);
        } catch (error) {
          logger.warn(`Failed to delete temp file: ${finalVideoPath}`);
        }
      }

      logger.info(`[Voice Over] Output ${outputIndex + 1} completed: ${mergedPath}`);
      return mergedPath;
    } catch (error) {
      logger.error(`[Voice Over] Failed to process output ${outputIndex + 1}:`, error);
      throw error;
    }
  }

  /**
   * Get video duration using ffprobe
   */
  private async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          logger.error(`Failed to get video duration for ${videoPath}:`, err);
          reject(err);
        } else {
          const duration = metadata.format?.duration || 0;
          resolve(duration);
        }
      });
    });
  }

  private async combineVideos(videos: any[], settings: VideoMixingOptions, outputName: string): Promise<string> {
    const timestamp = Date.now();
    const outputPath = path.join(this.outputDir, `${outputName}_${timestamp}.${settings.outputFormat.toLowerCase()}`);

    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      // Add input videos
      videos.forEach(video => {
        command = command.input(video.path);
      });

      // Configure output settings
      command = this.configureOutputSettings(command, settings, videos.length);

      // Add metadata
      command = this.addMetadata(command, settings.metadata, videos);

      // Add watermark if specified
      if (settings.watermark) {
        command = this.applyWatermarkToCommand(command, settings.watermark);
      }

      // Set output
      command = command.output(outputPath);

      // Handle events
      command
        .on('start', (commandLine) => {
          logger.info(`FFmpeg process started: ${commandLine}`);
        })
        .on('progress', (progress) => {
          logger.debug(`Processing progress: ${progress.percent}%`);
        })
        .on('end', () => {
          logger.info(`Video combination completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          logger.error('FFmpeg error:', err);
          logger.error('FFmpeg stderr:', stderr);
          reject(new Error(`Video processing failed: ${err.message}`));
        });

      // Start processing
      command.run();
    });
  }

  private async combineVideosWithTransitions(
    clips: VideoClip[],
    settings: VideoMixingOptions,
    outputName: string,
    transitionType: string
  ): Promise<string> {
    const timestamp = Date.now();
    const outputPath = path.join(this.outputDir, `${outputName}_${timestamp}.${settings.outputFormat.toLowerCase()}`);

    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      // Add input videos from clips
      clips.forEach(clip => {
        command = command.input(clip.path);
      });

      // Generate advanced filter complex using auto-mixing service
      // Note: This method is currently unused as transitions are disabled
      const filterComplex: string[] = []; // this.autoMixingService.generateFilterComplex would go here

      // Apply the intelligent filter complex
      if (filterComplex.length > 0) {
        command = command.complexFilter(filterComplex);
        command = command.map('[outv]').map('[outa]');
      }

      // Apply quality settings
      command = this.applyQualitySettings(command, settings.quality);

      // Add metadata
      command = this.addMetadata(command, settings.metadata, clips);

      // Add watermark if specified
      if (settings.watermark) {
        command = this.applyWatermarkToCommand(command, settings.watermark);
      }

      // Set output
      command = command.output(outputPath);

      // Handle events with enhanced progress tracking
      command
        .on('start', (commandLine) => {
          logger.info(`FFmpeg enhanced mixing started: ${commandLine}`);
          logger.info(`Using ${transitionType} transitions for ${clips.length} clips`);
        })
        .on('progress', (progress) => {
          logger.debug(`Enhanced mixing progress: ${progress.percent}%`);
        })
        .on('end', () => {
          logger.info(`Enhanced video mixing completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          logger.error('Enhanced mixing FFmpeg error:', err);
          logger.error('FFmpeg stderr:', stderr);
          reject(new Error(`Enhanced video processing failed: ${err.message}`));
        });

      // Start processing
      command.run();
    });
  }

  private configureOutputSettings(command: ffmpeg.FfmpegCommand, settings: VideoMixingOptions, videoCount: number): ffmpeg.FfmpegCommand {
    // Build filter complex with quality settings integrated
    const filterComplex = this.buildFilterComplex(settings, videoCount);
    if (filterComplex && filterComplex.length > 0) {
      command = command.complexFilter(filterComplex);

      // Map outputs based on whether audio is included
      const hasAudio = settings.audioMode !== 'mute' && videoCount > 0;
      if (hasAudio) {
        command = command.outputOptions(['-map', '[outv]', '-map', '[outa]']);
      } else {
        command = command.outputOptions(['-map', '[outv]']);
      }

      // Apply bitrate settings without filter (since filter is in complex)
      command = this.applyBitrateSettings(command, settings.quality);
    } else {
      // No complex filter, apply quality settings normally
      command = this.applyQualitySettings(command, settings.quality);
    }

    return command;
  }

  private buildFilterComplex(settings: VideoMixingOptions, videoCount: number): string[] | undefined {
    // Handle edge cases
    if (videoCount === 0) {
      return undefined;
    }

    const hasAudio = settings.audioMode !== 'mute';
    const filters: string[] = [];

    // Get scale filter for quality
    const scaleFilter = this.getScaleFilter(settings.quality);

    if (videoCount === 1) {
      // For single video, we can still apply filters or duplicate it
      // Check if we need to loop/duplicate for mixing effect
      if (settings.orderMixing || settings.differentStartingVideo) {
        // Duplicate the single video to create variation
        filters.push('[0:v]split=2[v0][v1]');
        if (hasAudio) {
          filters.push('[0:a]asplit=2[a0][a1]');
          filters.push(`[v0][a0][v1][a1]concat=n=2:v=1:a=1[tmpv][tmpa]`);
          // Apply scale if needed
          if (scaleFilter) {
            filters.push(`[tmpv]${scaleFilter}[outv]`);
            filters.push('[tmpa]anull[outa]');
          } else {
            filters.push('[tmpv]copy[outv]');
            filters.push('[tmpa]anull[outa]');
          }
        } else {
          filters.push(`[v0][v1]concat=n=2:v=1:a=0[tmpv]`);
          // Apply scale if needed
          if (scaleFilter) {
            filters.push(`[tmpv]${scaleFilter}[outv]`);
          } else {
            filters.push('[tmpv]copy[outv]');
          }
        }
      } else {
        // For simple single video, apply scale if needed
        if (scaleFilter) {
          filters.push(`[0:v]${scaleFilter}[outv]`);
        } else {
          filters.push('[0:v]copy[outv]');
        }
        if (hasAudio) {
          filters.push('[0:a]anull[outa]');
        }
      }
      return filters;
    }

    // Build dynamic filter for multiple videos
    const inputs: string[] = [];

    for (let i = 0; i < videoCount; i++) {
      if (hasAudio) {
        inputs.push(`[${i}:v][${i}:a]`);
      } else {
        inputs.push(`[${i}:v]`);
      }
    }

    // Create concat filter with correct number of inputs
    if (hasAudio) {
      const concatString = `${inputs.join('')}concat=n=${videoCount}:v=1:a=1[tmpv][tmpa]`;
      filters.push(concatString);

      // Apply scale filter to video output
      if (scaleFilter) {
        filters.push(`[tmpv]${scaleFilter}[outv]`);
      } else {
        filters.push('[tmpv]copy[outv]');
      }
      filters.push('[tmpa]anull[outa]');
    } else {
      // No audio processing needed
      const concatString = `${inputs.join('')}concat=n=${videoCount}:v=1:a=0[tmpv]`;
      filters.push(concatString);

      // Apply scale filter to video output
      if (scaleFilter) {
        filters.push(`[tmpv]${scaleFilter}[outv]`);
      } else {
        filters.push('[tmpv]copy[outv]');
      }
    }

    return filters;
  }

  private addMetadata(command: ffmpeg.FfmpegCommand, metadata: any, sourceVideos: any[]): ffmpeg.FfmpegCommand {
    // Add static metadata
    if (metadata.static) {
      Object.entries(metadata.static).forEach(([key, value]) => {
        command = command.outputOption(`-metadata`).outputOption(`${key}=${value}`);
      });
    }

    // Add dynamic metadata
    if (metadata.includeDynamic) {
      const sourceFiles = sourceVideos.map(v => v.originalName || path.basename(v.path || '')).join(', ');
      command = command.outputOption(`-metadata`).outputOption(`source_files=${sourceFiles}`);
      command = command.outputOption(`-metadata`).outputOption(`creation_time=${new Date().toISOString()}`);
      command = command.outputOption(`-metadata`).outputOption(`creator=VideoMixPro`);
    }

    return command;
  }

  private async saveOutputFiles(jobId: string, outputPaths: string[], settings: any): Promise<void> {
    const outputFiles = await Promise.all(
      outputPaths.map(async (outputPath, index) => {
        const stats = await fs.stat(outputPath);
        const filename = path.basename(outputPath);

        // Extract metadata from output file
        const ffmpeg = require('fluent-ffmpeg');
        const metadata = await new Promise<any>((resolve, reject) => {
          ffmpeg.ffprobe(outputPath, (err: any, data: any) => {
            if (err) reject(err);
            else resolve(data);
          });
        });

        const duration = metadata.format.duration || 0;
        const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');

        // Check if this is voice-over mode
        const isVoiceOverMode = settings.voiceOverMode === 'enabled' || settings.voiceOverMode === true;

        // Build settings object for database
        const settingsObj: any = {
          ...(settings.metadata?.static || {}),
          format: metadata.format.format_name,
          resolution: `${videoStream?.width || 0}x${videoStream?.height || 0}`,
          created_at: new Date().toISOString()
        };

        // Add voice-over specific metadata if applicable - DISABLED
        /*
        if (isVoiceOverMode && settings.voiceOverFiles && settings.voiceOverFiles[index]) {
          const voiceOver = settings.voiceOverFiles[index];
          settingsObj.voiceOverFile = voiceOver.originalName || voiceOver.filename;
          settingsObj.voiceOverDuration = voiceOver.duration;
          settingsObj.outputIndex = index;
        }
        */

        return {
          jobId,
          filename,
          originalVideoIds: '', // Empty for now - could be populated with source video IDs if needed
          size: stats.size,
          duration,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          fps: videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : 30,
          bitrate: parseInt(metadata.format.bit_rate || '0'),
          settings: JSON.stringify(settingsObj)
        };
      })
    );

    // Save to database using ProcessedVideo model
    await prisma.processedVideo.createMany({
      data: outputFiles
    });
  }

  private async updateJobStatus(jobId: string, status: JobStatusType, progress: number, errorMessage?: string): Promise<void> {
    const updateData: any = {
      status,
      progress
    };

    if (status === JobStatus.PROCESSING && progress === 0) {
      updateData.startedAt = new Date();
    }

    if (status === JobStatus.COMPLETED || status === JobStatus.FAILED) {
      updateData.completedAt = new Date();
    }

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    await prisma.processingJob.update({
      where: { id: jobId },
      data: updateData
    });
  }

  private async updateJobStatusWithDetails(
    jobId: string,
    status: JobStatusType,
    progress: number,
    statusMessage?: string,
    errorMessage?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      progress
    };

    if (status === JobStatus.PROCESSING && progress === 0) {
      updateData.startedAt = new Date();
    }

    if (status === JobStatus.COMPLETED || status === JobStatus.FAILED) {
      updateData.completedAt = new Date();
    }

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    // Note: Metadata field not available in ProcessingJob model
    // Status message is logged but not stored in DB for now

    await prisma.processingJob.update({
      where: { id: jobId },
      data: updateData
    });

    logger.info(`Job ${jobId}: ${status} (${progress}%) - ${statusMessage || 'Processing'}`);
  }

  private async updateProjectStatus(projectId: string, status: ProjectStatusType): Promise<void> {
    // Note: Project model doesn't have status field in current schema
    // This method is disabled until schema is updated
    logger.info(`Would update project ${projectId} to status: ${status}`);
  }

  // ==================== Helper Functions ====================

  /**
   * Get scale filter string for quality setting
   */
  private getScaleFilter(quality: VideoQuality): string | null {
    switch (quality) {
      case VideoQuality.LOW:
        return 'scale=640:-2';
      case VideoQuality.MEDIUM:
        return 'scale=-2:720';
      case VideoQuality.HIGH:
        return 'scale=-2:1080';
      case VideoQuality.ULTRA:
        return 'scale=min(3840\\,iw):min(2160\\,ih):force_original_aspect_ratio=decrease';
      default:
        return null;
    }
  }

  /**
   * Apply bitrate settings without video filter
   */
  private applyBitrateSettings(command: ffmpeg.FfmpegCommand, quality: VideoQuality): ffmpeg.FfmpegCommand {
    // Set video codec
    command = command.videoCodec('libx264');

    // Set bitrate based on quality
    switch (quality) {
      case VideoQuality.LOW:
        command = command.videoBitrate('500k');
        break;
      case VideoQuality.MEDIUM:
        command = command.videoBitrate('1000k');
        break;
      case VideoQuality.HIGH:
        command = command.videoBitrate('2000k');
        break;
      case VideoQuality.ULTRA:
        command = command.videoBitrate('4000k');
        break;
      default:
        command = command.videoBitrate('1000k');
    }

    // Set audio codec
    command = command.audioCodec('aac').audioBitrate('128k');

    return command;
  }

  /**
   * Apply quality settings to FFmpeg command
   */
  private applyQualitySettings(command: ffmpeg.FfmpegCommand, quality: VideoQuality): ffmpeg.FfmpegCommand {
    // Set video codec and quality
    command = command.videoCodec('libx264');

    switch (quality) {
      case VideoQuality.LOW:
        // Use scale filter to maintain aspect ratio with max width
        command = command.videoBitrate('500k')
          .outputOption('-vf', 'scale=640:-2');
        break;
      case VideoQuality.MEDIUM:
        // Scale to 720p height maintaining aspect ratio
        command = command.videoBitrate('1000k')
          .outputOption('-vf', 'scale=-2:720');
        break;
      case VideoQuality.HIGH:
        // Scale to 1080p height maintaining aspect ratio
        command = command.videoBitrate('2000k')
          .outputOption('-vf', 'scale=-2:1080');
        break;
      case VideoQuality.ULTRA:
        // Scale to 4K if needed, but don't upscale
        command = command.videoBitrate('4000k')
          .outputOption('-vf', 'scale=\'min(3840,iw)\':\'min(2160,ih)\':force_original_aspect_ratio=decrease');
        break;
      default:
        command = command.videoBitrate('1000k');
    }

    // Set audio codec
    command = command.audioCodec('aac').audioBitrate('128k');

    return command;
  }

  /**
   * Parse frame rate from FFmpeg string format
   */
  private parseFPS(fpsString: string): number {
    if (!fpsString) return 0;

    // Handle fraction format like "30/1" or "25/1"
    if (fpsString.includes('/')) {
      const [numerator, denominator] = fpsString.split('/').map(Number);
      return denominator ? numerator / denominator : 0;
    }

    return parseFloat(fpsString) || 0;
  }

  /**
   * Get text position coordinates for watermark (responsive to video size)
   */
  private getTextPosition(position: string): { x: string; y: string } {
    // Use percentage-based padding (2% of video dimensions)
    const padding = 'min(w*0.02,h*0.02)';

    switch (position) {
      case 'top-left':
        return { x: padding, y: padding };
      case 'top-right':
        return { x: `w-tw-${padding}`, y: padding };
      case 'bottom-left':
        return { x: padding, y: `h-th-${padding}` };
      case 'bottom-right':
        return { x: `w-tw-${padding}`, y: `h-th-${padding}` };
      case 'center':
        return { x: '(w-tw)/2', y: '(h-th)/2' };
      default:
        return { x: `w-tw-${padding}`, y: `h-th-${padding}` };
    }
  }

  /**
   * Get image position coordinates for watermark (responsive to video size)
   */
  private getImagePosition(position: string): { x: string; y: string } {
    // Use percentage-based padding (2% of video dimensions)
    const padding = 'min(main_w*0.02,main_h*0.02)';

    switch (position) {
      case 'top-left':
        return { x: padding, y: padding };
      case 'top-right':
        return { x: `main_w-overlay_w-${padding}`, y: padding };
      case 'bottom-left':
        return { x: padding, y: `main_h-overlay_h-${padding}` };
      case 'bottom-right':
        return { x: `main_w-overlay_w-${padding}`, y: `main_h-overlay_h-${padding}` };
      case 'center':
        return { x: '(main_w-overlay_w)/2', y: '(main_h-overlay_h)/2' };
      default:
        return { x: `main_w-overlay_w-${padding}`, y: `main_h-overlay_h-${padding}` };
    }
  }

  /**
   * Apply watermark settings to FFmpeg command
   */
  private applyWatermarkToCommand(command: ffmpeg.FfmpegCommand, watermark: WatermarkOptions): ffmpeg.FfmpegCommand {
    if (watermark.text) {
      const position = this.getTextPosition(watermark.position || 'bottom-right');
      const fontSize = watermark.fontSize || 24;
      const fontColor = watermark.fontColor || 'white';
      const opacity = watermark.opacity || 0.7;

      command = command.complexFilter([
        `drawtext=text='${watermark.text}':fontsize=${fontSize}:fontcolor=${fontColor}@${opacity}:x=${position.x}:y=${position.y}`
      ]);
    }

    return command;
  }

  /**
   * Validate video file format
   */
  /**
   * Check if job is currently being retried
   */
  private async isJobBeingRetried(jobId: string): Promise<boolean> {
    const stats = await this.retryService.getRetryStatistics(jobId);
    return stats.pendingAttempts > 0;
  }

  /**
   * Enhanced FFmpeg operation with error handling
   */
  private async executeFFmpegOperation<T>(
    operation: () => Promise<T>,
    context: {
      operation: string;
      inputFiles?: string[];
      outputFile?: string;
      command?: string;
    }
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const processingError = this.errorHandlingService.analyzeError(error as Error, context);
      logger.error(`FFmpeg operation failed: ${processingError.type}`, {
        errorId: processingError.id,
        context
      });
      throw error; // Re-throw to allow higher-level retry logic
    }
  }

  /**
   * Generate video thumbnails with error handling
   */
  async generateThumbnailSafe(videoPath: string, options: ThumbnailOptions = {}): Promise<string> {
    return this.executeFFmpegOperation(
      () => this.generateThumbnail(videoPath, options),
      {
        operation: 'thumbnail_generation',
        inputFiles: [videoPath],
        command: `Generating thumbnail for ${videoPath}`
      }
    );
  }

  /**
   * Mark retry as successful when job completes
   */
  async markJobSuccessful(jobId: string): Promise<void> {
    await this.retryService.markRetrySuccessful(jobId);
  }

  /**
   * Get error handling service for external access
   */
  getErrorHandlingService(): ErrorHandlingService {
    return this.errorHandlingService;
  }

  /**
   * Get retry service for external access
   */
  getRetryService(): RetryService {
    return this.retryService;
  }

  private isValidVideoFormat(filePath: string): boolean {
    const validExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'];
    const ext = path.extname(filePath).toLowerCase();
    return validExtensions.includes(ext);
  }

  /**
   * Get safe file path for FFmpeg operations
   */
  private getSafeFilePath(filePath: string): string {
    // Escape special characters for FFmpeg
    return filePath.replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  /**
   * Map quality enum to bitrate for auto-mixing service
   */
  private mapQualityToBitrate(quality: VideoQuality | undefined): 'low' | 'medium' | 'high' {
    switch (quality) {
      case VideoQuality.LOW:
        return 'low';
      case VideoQuality.HIGH:
      case VideoQuality.ULTRA:
        return 'high';
      case VideoQuality.MEDIUM:
      default:
        return 'medium';
    }
  }

  /**
   * Map quality enum to resolution for auto-mixing service
   */
  private mapQualityToResolution(quality: VideoQuality | undefined): 'sd' | 'hd' | 'fullhd' {
    switch (quality) {
      case VideoQuality.LOW:
        return 'sd';
      case VideoQuality.HIGH:
      case VideoQuality.ULTRA:
        return 'fullhd';
      case VideoQuality.MEDIUM:
      default:
        return 'hd';
    }
  }

  /**
   * Refund credits for failed job
   * DISABLED: Credit system temporarily disabled
   */
  async refundCreditsForFailedJob(jobId: string): Promise<boolean> {
    logger.info(`[Credit System] DISABLED - Skipping refund for job ${jobId}`);
    return true; // Always return true since credit system is disabled

    // DISABLED CODE BELOW:
    // try {
    //   const job = await prisma.processingJob.findUnique({
    //     where: { id: jobId },
    //     include: {
    //       project: {
    //         include: {
    //           user: true
    //         }
    //       }
    //     }
    //   });

    //   if (!job || !job.creditsUsed || job.creditsUsed === 0 || job.refundedAt) {
    //     return false; // No refund needed
    //   }

    //   // Start transaction to refund credits
    //   await prisma.$transaction(async (tx) => {
    //     // Add credits back to user
    //     await tx.user.update({
    //       where: { id: job.project.userId },
    //       data: {
    //         credits: { increment: job.creditsUsed }
    //       }
    //     });

    //     // Create refund transaction record
    //     await tx.creditTransaction.create({
    //       data: {
    //         userId: job.project.userId,
    //         amount: job.creditsUsed,
    //         type: TransactionType.REFUND,
    //         description: `Refund for failed processing job: ${job.project.name}`,
    //         referenceId: jobId // Link to the failed job
    //       }
    //     });

    //     // Mark job as refunded
    //     await tx.processingJob.update({
    //       where: { id: jobId },
    //       data: {
    //         refundedAt: new Date()
    //       }
    //     });
    //   });

    //   logger.info(`Refunded ${job.creditsUsed} credits for failed job ${jobId}`);
    //   return true;
    // } catch (error) {
    //   logger.error(`Failed to refund credits for job ${jobId}:`, error);
    //   return false;
    // }
  }

  /**
   * Check if FFmpeg is available and working
   */
  async checkFFmpegAvailability(): Promise<boolean> {
    try {
      // Simple check: if ffmpeg-static is available, we're good
      if (ffmpegStatic) {
        logger.info(`FFmpeg binary found at: ${ffmpegStatic}`);
        return true;
      }

      // If no ffmpeg-static, try to run system ffmpeg
      const { execSync } = require('child_process');
      try {
        execSync('ffmpeg -version', { stdio: 'ignore' });
        logger.info('System FFmpeg found and working');
        return true;
      } catch {
        logger.error('No FFmpeg found (neither ffmpeg-static nor system)');
        return false;
      }
    } catch (error) {
      logger.error('FFmpeg availability check failed:', error);
      return false;
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(olderThanHours: number = 24): Promise<void> {
    try {
      const tempFiles = await fs.readdir(this.tempDir);
      const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);

      for (const file of tempFiles) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtimeMs < cutoffTime) {
          await fs.unlink(filePath);
          logger.info(`Cleaned up temp file: ${filePath}`);
        }
      }
    } catch (error) {
      logger.error('Temp file cleanup failed:', error);
    }
  }

  /**
   * Get video processing statistics
   */
  async getProcessingStats(): Promise<{
    activeJobs: number;
    totalProcessed: number;
    averageProcessingTime: number;
  }> {
    const activeJobs = this.activeJobs.size;

    // Get stats from database
    const jobs = await prisma.processingJob.findMany({
      where: {
        status: { in: [JobStatus.COMPLETED, JobStatus.FAILED] },
        completedAt: { not: null },
        startedAt: { not: null }
      },
      select: {
        startedAt: true,
        completedAt: true,
        status: true
      }
    });

    const totalProcessed = jobs.length;
    const completedJobs = jobs.filter(job => job.status === JobStatus.COMPLETED);

    const averageProcessingTime = completedJobs.length > 0
      ? completedJobs.reduce((sum, job) => {
          const duration = job.completedAt!.getTime() - job.startedAt!.getTime();
          return sum + duration;
        }, 0) / completedJobs.length
      : 0;

    return {
      activeJobs,
      totalProcessed,
      averageProcessingTime: Math.round(averageProcessingTime / 1000) // Convert to seconds
    };
  }
}
