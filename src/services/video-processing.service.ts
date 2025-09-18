import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs/promises';
import { PrismaClient } from '@prisma/client';
import { JobStatus, ProjectStatus, MixingMode, VideoFormat, VideoQuality } from '@/types';
import logger from '@/utils/logger';
import { promisify } from 'util';

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

const prisma = new PrismaClient();

export class VideoProcessingService {
  private activeJobs = new Map<string, boolean>();
  private readonly tempDir = process.env.TEMP_DIR || 'temp';
  private readonly outputDir = process.env.OUTPUT_DIR || 'outputs';
  private readonly thumbnailDir = process.env.THUMBNAIL_DIR || 'thumbnails';

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

    try {
      await this.updateJobStatus(jobId, JobStatus.PROCESSING, 0);

      const project = await prisma.project.findUnique({
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

        const progress = Math.round((i / data.outputCount) * 100);
        await this.updateJobStatus(jobId, JobStatus.PROCESSING, progress);

        let outputPath: string;

        if (settings.mixingMode === MixingMode.AUTO) {
          outputPath = await this.processAutoMixing(project, settings, i);
        } else {
          outputPath = await this.processManualMixing(project, settings, i);
        }

        if (outputPath) {
          outputs.push(outputPath);
        }
      }

      // Save output files to database
      await this.saveOutputFiles(jobId, outputs, settings);

      await this.updateJobStatus(jobId, JobStatus.COMPLETED, 100);
      await this.updateProjectStatus(data.projectId, ProjectStatus.COMPLETED);

      logger.info(`Job ${jobId} completed successfully with ${outputs.length} outputs`);
    } catch (error) {
      logger.error(`Job ${jobId} failed:`, error);
      await this.updateJobStatus(jobId, JobStatus.FAILED, 0, (error as Error).message);
      await this.updateProjectStatus(data.projectId, ProjectStatus.FAILED);
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private async processAutoMixing(project: any, settings: VideoMixingOptions, index: number): Promise<string> {
    const videoFiles = project.videoFiles;

    if (videoFiles.length === 0) {
      throw new Error('No video files to process');
    }

    // Randomly select and shuffle videos
    const shuffledVideos = [...videoFiles].sort(() => Math.random() - 0.5);
    const selectedVideos = shuffledVideos.slice(0, Math.min(shuffledVideos.length, 5)); // Max 5 videos per output

    return this.combineVideos(selectedVideos, settings, `auto_mix_${index + 1}`);
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
          metadata: {
            ...settings.metadata.static,
            format: metadata.format.format_name,
            resolution: `${metadata.streams[0]?.width}x${metadata.streams[0]?.height}`,
            created_at: new Date().toISOString()
          },
          sourceFiles: [] // You'd populate this with actual source file info
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