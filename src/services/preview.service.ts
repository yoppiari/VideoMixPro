import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs/promises';
import logger from '@/utils/logger';
import { VideoProcessingService } from './video-processing.service';

// Set FFmpeg and FFprobe paths
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

try {
  const ffprobeStatic = require('ffprobe-static');
  if (ffprobeStatic && ffprobeStatic.path) {
    ffmpeg.setFfprobePath(ffprobeStatic.path);
  }
} catch (error) {
  logger.warn('ffprobe-static not found, using system ffprobe');
}

export interface PreviewOptions {
  thumbnailCount?: number; // Number of thumbnails to generate
  thumbnailSize?: { width: number; height: number };
  previewDuration?: number; // Duration of video preview in seconds
  previewQuality?: 'low' | 'medium' | 'high';
  generateGif?: boolean; // Generate animated GIF preview
  generateSprite?: boolean; // Generate sprite sheet of thumbnails
}

export interface VideoPreview {
  id: string;
  outputFileId: string;
  thumbnails: ThumbnailInfo[];
  previewVideo?: string; // Path to preview video
  animatedGif?: string; // Path to animated GIF
  spriteSheet?: string; // Path to sprite sheet
  metadata: {
    duration: number;
    resolution: string;
    fileSize: number;
    thumbnailCount: number;
  };
  createdAt: Date;
}

export interface ThumbnailInfo {
  path: string;
  timeOffset: number;
  width: number;
  height: number;
  fileSize: number;
}

export class PreviewService {
  private readonly previewDir = process.env.PREVIEW_DIR || 'previews';
  private readonly thumbnailDir = process.env.THUMBNAIL_DIR || 'thumbnails';
  private videoProcessingService: VideoProcessingService;

  constructor() {
    this.videoProcessingService = new VideoProcessingService();
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.previewDir, { recursive: true });
      await fs.mkdir(this.thumbnailDir, { recursive: true });
      await fs.mkdir(path.join(this.previewDir, 'gifs'), { recursive: true });
      await fs.mkdir(path.join(this.previewDir, 'sprites'), { recursive: true });
      await fs.mkdir(path.join(this.previewDir, 'videos'), { recursive: true });
    } catch (error) {
      logger.error('Failed to create preview directories:', error);
    }
  }

  /**
   * Generate comprehensive preview for an output video file
   */
  async generateVideoPreview(
    videoPath: string,
    outputFileId: string,
    options: PreviewOptions = {}
  ): Promise<VideoPreview> {
    try {
      const {
        thumbnailCount = 6,
        thumbnailSize = { width: 320, height: 240 },
        previewDuration = 10,
        previewQuality = 'medium',
        generateGif = true,
        generateSprite = false
      } = options;

      logger.info(`Generating preview for video: ${videoPath}`);

      // Get video metadata
      const metadata = await this.getVideoMetadata(videoPath);
      const duration = metadata.duration;

      // Generate thumbnails at different time intervals
      const thumbnails = await this.generateMultipleThumbnails(
        videoPath,
        thumbnailCount,
        duration,
        thumbnailSize,
        outputFileId
      );

      const preview: VideoPreview = {
        id: `preview_${outputFileId}_${Date.now()}`,
        outputFileId,
        thumbnails,
        metadata: {
          duration,
          resolution: metadata.resolution,
          fileSize: metadata.fileSize,
          thumbnailCount
        },
        createdAt: new Date()
      };

      // Generate preview video (shorter version)
      if (duration > previewDuration) {
        preview.previewVideo = await this.generatePreviewVideo(
          videoPath,
          previewDuration,
          previewQuality,
          outputFileId
        );
      }

      // Generate animated GIF
      if (generateGif) {
        preview.animatedGif = await this.generateAnimatedGif(
          videoPath,
          outputFileId,
          duration
        );
      }

      // Generate sprite sheet
      if (generateSprite) {
        preview.spriteSheet = await this.generateSpriteSheet(
          thumbnails,
          outputFileId
        );
      }

      logger.info(`Preview generated successfully for ${outputFileId}`);
      return preview;

    } catch (error) {
      logger.error('Preview generation failed:', error);
      throw new Error(`Preview generation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate multiple thumbnails at different time intervals
   */
  private async generateMultipleThumbnails(
    videoPath: string,
    count: number,
    duration: number,
    size: { width: number; height: number },
    outputFileId: string
  ): Promise<ThumbnailInfo[]> {
    const thumbnails: ThumbnailInfo[] = [];
    const interval = Math.max(1, Math.floor(duration / (count + 1)));

    for (let i = 1; i <= count; i++) {
      const timeOffset = i * interval;
      const filename = `thumb_${outputFileId}_${i}_${Date.now()}.jpg`;
      const thumbnailPath = path.join(this.thumbnailDir, filename);

      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(videoPath)
            .screenshots({
              timestamps: [timeOffset],
              filename,
              folder: this.thumbnailDir,
              size: `${size.width}x${size.height}`
            })
            .on('end', () => resolve())
            .on('error', reject);
        });

        // Get file size
        const stats = await fs.stat(thumbnailPath);

        thumbnails.push({
          path: thumbnailPath,
          timeOffset,
          width: size.width,
          height: size.height,
          fileSize: stats.size
        });

        logger.info(`Generated thumbnail ${i}/${count} at ${timeOffset}s`);
      } catch (error) {
        logger.error(`Failed to generate thumbnail ${i}:`, error);
      }
    }

    return thumbnails;
  }

  /**
   * Generate a shorter preview video
   */
  private async generatePreviewVideo(
    videoPath: string,
    duration: number,
    quality: string,
    outputFileId: string
  ): Promise<string> {
    const filename = `preview_${outputFileId}_${Date.now()}.mp4`;
    const outputPath = path.join(this.previewDir, 'videos', filename);

    const qualitySettings = {
      low: { bitrate: '500k', scale: '640:360' },
      medium: { bitrate: '1000k', scale: '854:480' },
      high: { bitrate: '2000k', scale: '1280:720' }
    };

    const settings = qualitySettings[quality as keyof typeof qualitySettings] || qualitySettings.medium;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .inputOptions('-ss 0') // Start from beginning
        .outputOptions([
          `-t ${duration}`, // Duration
          `-b:v ${settings.bitrate}`,
          `-vf scale=${settings.scale}`,
          '-preset fast',
          '-crf 23'
        ])
        .output(outputPath)
        .on('end', () => {
          logger.info(`Preview video generated: ${outputPath}`);
          resolve();
        })
        .on('error', reject)
        .run();
    });

    return outputPath;
  }

  /**
   * Generate animated GIF preview
   */
  private async generateAnimatedGif(
    videoPath: string,
    outputFileId: string,
    duration: number
  ): Promise<string> {
    const filename = `preview_${outputFileId}_${Date.now()}.gif`;
    const outputPath = path.join(this.previewDir, 'gifs', filename);

    // Generate GIF from first 5 seconds or 20% of video, whichever is shorter
    const gifDuration = Math.min(5, duration * 0.2);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .inputOptions('-ss 0')
        .outputOptions([
          `-t ${gifDuration}`,
          '-vf scale=320:240:flags=lanczos,fps=10',
          '-loop 0'
        ])
        .output(outputPath)
        .on('end', () => {
          logger.info(`Animated GIF generated: ${outputPath}`);
          resolve();
        })
        .on('error', reject)
        .run();
    });

    return outputPath;
  }

  /**
   * Generate sprite sheet from thumbnails
   */
  private async generateSpriteSheet(
    thumbnails: ThumbnailInfo[],
    outputFileId: string
  ): Promise<string> {
    const filename = `sprite_${outputFileId}_${Date.now()}.jpg`;
    const outputPath = path.join(this.previewDir, 'sprites', filename);

    // Calculate grid dimensions
    const cols = Math.ceil(Math.sqrt(thumbnails.length));
    const rows = Math.ceil(thumbnails.length / cols);

    // Create montage command for ImageMagick-style sprite sheet using FFmpeg
    const inputArgs: string[] = [];
    const filterComplex: string[] = [];

    thumbnails.forEach((thumb, index) => {
      inputArgs.push('-i', thumb.path);
      filterComplex.push(`[${index}:v]`);
    });

    const tileFilter = `tile=${cols}x${rows}`;
    const fullFilter = `${filterComplex.join('')}${tileFilter}[out]`;

    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg();

      // Add all thumbnail inputs
      thumbnails.forEach((thumb) => {
        command.input(thumb.path);
      });

      command
        .complexFilter([fullFilter])
        .outputOptions(['-map [out]'])
        .output(outputPath)
        .on('end', () => {
          logger.info(`Sprite sheet generated: ${outputPath}`);
          resolve();
        })
        .on('error', reject)
        .run();
    });

    return outputPath;
  }

  /**
   * Get video metadata
   */
  private async getVideoMetadata(videoPath: string): Promise<{
    duration: number;
    resolution: string;
    fileSize: number;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, async (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        try {
          const stats = await fs.stat(videoPath);
          resolve({
            duration: metadata.format.duration || 0,
            resolution: `${videoStream.width}x${videoStream.height}`,
            fileSize: stats.size
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Clean up old preview files
   */
  async cleanupOldPreviews(olderThanDays: number = 7): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const directories = [
        this.thumbnailDir,
        path.join(this.previewDir, 'gifs'),
        path.join(this.previewDir, 'sprites'),
        path.join(this.previewDir, 'videos')
      ];

      for (const dir of directories) {
        try {
          const files = await fs.readdir(dir);
          for (const file of files) {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);

            if (stats.mtime < cutoffDate) {
              await fs.unlink(filePath);
              logger.info(`Cleaned up old preview file: ${filePath}`);
            }
          }
        } catch (error) {
          logger.warn(`Failed to cleanup directory ${dir}:`, error);
        }
      }
    } catch (error) {
      logger.error('Preview cleanup failed:', error);
    }
  }

  /**
   * Get preview by output file ID
   */
  async getPreviewByOutputFileId(outputFileId: string): Promise<VideoPreview | null> {
    // This would typically fetch from database
    // For now, we'll implement a file-based lookup
    try {
      const previewFiles = await fs.readdir(this.thumbnailDir);
      const thumbnails = previewFiles
        .filter(file => file.includes(`thumb_${outputFileId}_`))
        .map(file => ({
          path: path.join(this.thumbnailDir, file),
          timeOffset: 0, // Would need to parse from filename
          width: 320,
          height: 240,
          fileSize: 0 // Would need to get actual size
        }));

      if (thumbnails.length === 0) {
        return null;
      }

      return {
        id: `preview_${outputFileId}`,
        outputFileId,
        thumbnails,
        metadata: {
          duration: 0,
          resolution: '320x240',
          fileSize: 0,
          thumbnailCount: thumbnails.length
        },
        createdAt: new Date()
      };
    } catch (error) {
      logger.error('Failed to get preview:', error);
      return null;
    }
  }
}