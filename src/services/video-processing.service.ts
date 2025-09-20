import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs/promises';
import { database, prisma, JobStatus, ProjectStatus } from '@/utils/database';
import { MixingMode, VideoFormat, VideoQuality } from '@/types';
import logger from '@/utils/logger';
import { promisify } from 'util';
import { AutoMixingService, VideoClip, VideoGroup } from './auto-mixing.service';
import { ErrorHandlingService } from './error-handling.service';
import { RetryService } from './retry.service';

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
}

// Prisma client is imported from database adapter

export class VideoProcessingService {
  private activeJobs = new Map<string, boolean>();
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
    // In production, this would use Bull Queue or similar
    // For now, we'll process immediately in background
    setImmediate(() => this.processVideo(jobId, data));
  }

  async cancelJob(jobId: string): Promise<void> {
    this.activeJobs.set(jobId, false);
    logger.info(`Job ${jobId} marked for cancellation`);
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
    this.activeJobs.set(jobId, true);
    let project: any = undefined; // Declare project outside try block

    try {
      await this.updateJobStatusWithDetails(jobId, JobStatus.PROCESSING, 0, 'Initializing video processing');

      project = await prisma.project.findUnique({
        where: { id: data.projectId },
        include: {
          videoFiles: {
            include: {
              group: true
            }
          },
          videoGroups: {
            include: {
              videoFiles: true
            },
            orderBy: { order: 'asc' }
          }
        }
      });

      if (!project) {
        throw new Error('Project not found');
      }

      const settings = data.settings;
      const outputs: string[] = [];

      for (let i = 0; i < data.outputCount; i++) {
        // Check if job was cancelled
        if (!this.activeJobs.get(jobId)) {
          logger.info(`Job ${jobId} was cancelled`);
          return;
        }

        const progress = Math.round((i / data.outputCount) * 80); // Reserve 20% for finalization
        const currentOutput = i + 1;

        // Determine mixing mode based on settings
        // Use group-based mixing only if explicitly enabled AND groups have videos
        const hasGroupsWithVideos = project.videoGroups &&
                                   project.videoGroups.length > 0 &&
                                   project.videoGroups.some((g: any) => g.videoFiles && g.videoFiles.length > 0);

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
          outputPath = await this.processAutoMixing(project, settings, i);
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

      // Log detailed error information
      logger.error(`Job ${jobId} failed:`, {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        ffmpegExitCode: errorObj.ffmpegExitCode,
        ffmpegStderr: errorObj.ffmpegStderr ? errorObj.ffmpegStderr.slice(-500) : undefined
      });

      // Try to schedule retry before marking as failed
      const context = {
        operation: 'video_processing',
        inputFiles: project?.videoFiles?.map((f: any) => f.path) || [],
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
          // Non-FFmpeg error
          const analysisResult = this.errorHandlingService.analyzeError(error as Error, context);
          userMessage = this.errorHandlingService.getUserMessage(analysisResult.id);
        }

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

  private async processAutoMixing(project: any, settings: any, index: number): Promise<string> {
    const videoFiles = project.videoFiles;

    if (videoFiles.length === 0) {
      throw new Error('No video files to process');
    }

    if (videoFiles.length < 2) {
      throw new Error('Minimum 2 videos required for mixing');
    }

    logger.info(`Processing auto-mixing for output ${index + 1}`);

    // Convert video files to VideoClip format for auto-mixing service
    const clips: VideoClip[] = videoFiles.map((file: any) => ({
      id: file.id,
      path: file.path,
      duration: file.duration || 30,
      metadata: {
        resolution: file.resolution,
        format: file.format,
        bitrate: file.metadata?.bitrate
      },
      originalName: file.originalName,
      groupId: file.groupId
    }));

    // Map VideoMixingOptions to MixingSettings for auto-mixing service
    const mixingSettings = {
      // Mixing Options
      orderMixing: settings.orderMixing !== false,
      speedMixing: settings.speedVariations === true,
      differentStartingVideo: settings.differentStartingVideo === true,
      speedRange: settings.speedRange || { min: 0.5, max: 2 },
      allowedSpeeds: settings.allowedSpeeds || [0.5, 0.75, 1, 1.25, 1.5, 2],

      // Group Mixing
      groupMixing: settings.groupMixing === true,
      groupMixingMode: settings.groupMixingMode || 'strict',

      // Transition Variations
      transitionMixing: settings.transitionVariations === true,
      transitionTypes: settings.transitionTypes || ['fade', 'dissolve', 'wipe', 'slide'],
      transitionDuration: settings.transitionDuration || { min: 0.2, max: 0.5 },

      // Color Variations
      colorVariations: settings.colorVariations === true,
      colorIntensity: settings.colorIntensity || 'low',

      // Video Quality - Map from VideoMixingOptions format
      metadataSource: settings.metadataSource || 'normal',
      bitrate: this.mapQualityToBitrate(settings.quality),
      resolution: this.mapQualityToResolution(settings.quality),
      frameRate: settings.frameRate || 30,

      // Aspect Ratio
      aspectRatio: settings.aspectRatio || 'original',

      // Duration
      durationType: settings.durationType || 'original',
      fixedDuration: settings.fixedDuration || 30,

      // Audio
      audioMode: settings.audioMode || 'keep',

      // Output
      outputCount: settings.outputCount || 1
    };

    // Prepare groups if group mixing is enabled
    let groups = undefined;
    if (settings.groupMixing && project.videoGroups && project.videoGroups.length > 0) {
      groups = project.videoGroups.map((group: any) => ({
        id: group.id,
        name: group.name,
        order: group.order,
        videos: clips.filter(clip => clip.groupId === group.id)
      }));

      // Filter out empty groups
      groups = groups.filter((group: any) => group.videos.length > 0);
    }

    // Generate variants based on new mixing settings
    const variants = await this.autoMixingService.generateVariants(clips, mixingSettings, groups);

    if (index >= variants.length) {
      throw new Error(`Not enough variants generated. Requested: ${index + 1}, Available: ${variants.length}`);
    }

    const variant = variants[index];
    logger.info(`Processing variant ${variant.id} with order: ${variant.videoOrder.join(', ')}`);

    // Build output path
    const outputFileName = `output_${index + 1}_${Date.now()}.mp4`;
    const outputPath = path.join(this.outputDir, outputFileName);

    // Build FFmpeg command for this variant
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

      // Log the full command for debugging
      logger.info(`Executing FFmpeg command with ${command.length} arguments`);
      logger.debug(`Full command: ${command.join(' ')}`);

      const proc = child_process.spawn(ffmpegPath, command.slice(1)); // Remove 'ffmpeg' from command array

      let stderr = '';
      let lastProgress = '';
      let errorMessages: string[] = [];

      proc.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        stderr += output;

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
              line.includes('Cannot')
            ).slice(-10); // Get last 10 error lines for more context

            if (errorLines.length > 0) {
              errorMessage = `FFmpeg failed: ${errorLines.join('; ')}`;
            }
          }

          // Log full stderr for debugging
          logger.error(errorMessage);
          if (stderr.length > 0) {
            // Log last 1000 characters of stderr for debugging
            const stderrSnapshot = stderr.length > 1000 ? '...' + stderr.slice(-1000) : stderr;
            logger.debug(`FFmpeg stderr (last 1000 chars): ${stderrSnapshot}`);
          }

          const error = new Error(errorMessage);
          (error as any).ffmpegExitCode = code;
          (error as any).ffmpegStderr = stderr;
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
    const groups = project.videoGroups;

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
      command = this.configureOutputSettings(command, settings);

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
    transitionType: TransitionType
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
      const filterComplex = this.autoMixingService.generateFilterComplex(clips, transitionType, 1.0);

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

  private configureOutputSettings(command: ffmpeg.FfmpegCommand, settings: VideoMixingOptions): ffmpeg.FfmpegCommand {
    // Apply quality settings
    command = this.applyQualitySettings(command, settings.quality);

    // Concatenate videos with crossfade transitions
    const filterComplex = this.buildFilterComplex(settings);
    if (filterComplex) {
      command = command.complexFilter(filterComplex);
    }

    return command;
  }

  private buildFilterComplex(settings: VideoMixingOptions): string[] | undefined {
    // Simple concatenation for now
    // In production, you'd add more sophisticated transitions and effects
    return [
      '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]'
    ];
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
      outputPaths.map(async (outputPath) => {
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

        return {
          jobId,
          filename,
          path: outputPath,
          size: stats.size,
          duration,
          metadata: JSON.stringify({
            ...(settings.metadata?.static || {}),
            format: metadata.format.format_name,
            resolution: `${metadata.streams[0]?.width}x${metadata.streams[0]?.height}`,
            created_at: new Date().toISOString()
          }),
          sourceFiles: JSON.stringify([]) // You'd populate this with actual source file info
        };
      })
    );

    // Save to database
    await prisma.outputFile.createMany({
      data: outputFiles
    });
  }

  private async updateJobStatus(jobId: string, status: JobStatus, progress: number, errorMessage?: string): Promise<void> {
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
    status: JobStatus,
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

  private async updateProjectStatus(projectId: string, status: ProjectStatus): Promise<void> {
    await prisma.project.update({
      where: { id: projectId },
      data: { status }
    });
  }

  // ==================== Helper Functions ====================

  /**
   * Apply quality settings to FFmpeg command
   */
  private applyQualitySettings(command: ffmpeg.FfmpegCommand, quality: VideoQuality): ffmpeg.FfmpegCommand {
    // Set video codec and quality
    command = command.videoCodec('libx264');

    switch (quality) {
      case VideoQuality.LOW:
        command = command.videoBitrate('500k').size('640x360');
        break;
      case VideoQuality.MEDIUM:
        command = command.videoBitrate('1000k').size('1280x720');
        break;
      case VideoQuality.HIGH:
        command = command.videoBitrate('2000k').size('1920x1080');
        break;
      case VideoQuality.ULTRA:
        command = command.videoBitrate('4000k').size('1920x1080');
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
   * Get text position coordinates for watermark
   */
  private getTextPosition(position: string): { x: string; y: string } {
    switch (position) {
      case 'top-left':
        return { x: '10', y: '10' };
      case 'top-right':
        return { x: 'w-tw-10', y: '10' };
      case 'bottom-left':
        return { x: '10', y: 'h-th-10' };
      case 'bottom-right':
        return { x: 'w-tw-10', y: 'h-th-10' };
      case 'center':
        return { x: '(w-tw)/2', y: '(h-th)/2' };
      default:
        return { x: 'w-tw-10', y: 'h-th-10' };
    }
  }

  /**
   * Get image position coordinates for watermark
   */
  private getImagePosition(position: string): { x: string; y: string } {
    switch (position) {
      case 'top-left':
        return { x: '10', y: '10' };
      case 'top-right':
        return { x: 'main_w-overlay_w-10', y: '10' };
      case 'bottom-left':
        return { x: '10', y: 'main_h-overlay_h-10' };
      case 'bottom-right':
        return { x: 'main_w-overlay_w-10', y: 'main_h-overlay_h-10' };
      case 'center':
        return { x: '(main_w-overlay_w)/2', y: '(main_h-overlay_h)/2' };
      default:
        return { x: 'main_w-overlay_w-10', y: 'main_h-overlay_h-10' };
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
   */
  async refundCreditsForFailedJob(jobId: string): Promise<boolean> {
    try {
      const job = await database.processingJob.findUnique({
        where: { id: jobId },
        include: {
          project: {
            include: {
              user: true
            }
          }
        }
      });

      if (!job || !job.creditsUsed || job.creditsUsed === 0 || job.refundedAt) {
        return false; // No refund needed
      }

      // Start transaction to refund credits
      await database.$transaction(async (tx) => {
        // Add credits back to user
        await tx.user.update({
          where: { id: job.project.userId },
          data: {
            credits: { increment: job.creditsUsed }
          }
        });

        // Create refund transaction record
        await tx.creditTransaction.create({
          data: {
            userId: job.project.userId,
            amount: job.creditsUsed,
            type: TransactionType.REFUND,
            description: `Refund for failed processing job: ${job.project.name}`
          }
        });

        // Mark job as refunded
        await tx.processingJob.update({
          where: { id: jobId },
          data: {
            refundedAt: new Date()
          }
        });
      });

      logger.info(`Refunded ${job.creditsUsed} credits for failed job ${jobId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to refund credits for job ${jobId}:`, error);
      return false;
    }
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
    const jobs = await database.processingJob.findMany({
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