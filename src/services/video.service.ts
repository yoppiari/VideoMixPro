import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import logger from '@/utils/logger';

export interface VideoMetadata {
  duration: number;
  format: string;
  resolution: string;
  bitrate?: number;
  fps?: number;
  codec?: string;
}

export interface DetailedVideoMetadata extends VideoMetadata {
  size: number;
  audioCodec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
}

export class VideoService {
  constructor() {
    // Set FFmpeg paths if configured
    const ffmpegPath = process.env.FFMPEG_PATH;
    const ffprobePath = process.env.FFPROBE_PATH;

    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
      logger.info(`FFmpeg path set to: ${ffmpegPath}`);
    } else {
      logger.warn('FFMPEG_PATH not set, using system default');
    }

    if (ffprobePath) {
      ffmpeg.setFfprobePath(ffprobePath);
      logger.info(`FFprobe path set to: ${ffprobePath}`);
    } else {
      logger.warn('FFPROBE_PATH not set, using system default');
    }
  }

  async extractMetadata(videoPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          logger.error(`Failed to extract metadata for ${videoPath}:`, err);
          reject(new Error('Failed to extract video metadata'));
          return;
        }

        try {
          const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
          if (!videoStream) {
            throw new Error('No video stream found');
          }

          const duration = metadata.format.duration || 0;
          const format = metadata.format.format_name || 'unknown';
          const resolution = `${videoStream.width}x${videoStream.height}`;
          const bitrate = metadata.format.bit_rate ? parseInt(metadata.format.bit_rate.toString()) : undefined;
          const fps = this.evaluateFPS(videoStream.r_frame_rate);
          const codec = videoStream.codec_name;

          resolve({
            duration,
            format,
            resolution,
            bitrate,
            fps,
            codec
          });
        } catch (parseError) {
          logger.error(`Failed to parse metadata for ${videoPath}:`, parseError);
          reject(new Error('Failed to parse video metadata'));
        }
      });
    });
  }

  async extractDetailedMetadata(videoPath: string): Promise<DetailedVideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          logger.error(`Failed to extract detailed metadata for ${videoPath}:`, err);
          reject(new Error('Failed to extract video metadata'));
          return;
        }

        try {
          const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
          const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');

          if (!videoStream) {
            throw new Error('No video stream found');
          }

          const duration = metadata.format.duration || 0;
          const format = metadata.format.format_name || 'unknown';
          const resolution = `${videoStream.width}x${videoStream.height}`;
          const bitrate = metadata.format.bit_rate ? parseInt(metadata.format.bit_rate.toString()) : undefined;
          const fps = this.evaluateFPS(videoStream.r_frame_rate);
          const codec = videoStream.codec_name;
          const size = metadata.format.size || 0;

          const result: DetailedVideoMetadata = {
            duration,
            format,
            resolution,
            bitrate,
            fps,
            codec,
            size
          };

          if (audioStream) {
            result.audioCodec = audioStream.codec_name;
            result.audioChannels = audioStream.channels;
            result.audioSampleRate = audioStream.sample_rate;
          }

          resolve(result);
        } catch (parseError) {
          logger.error(`Failed to parse detailed metadata for ${videoPath}:`, parseError);
          reject(new Error('Failed to parse video metadata'));
        }
      });
    });
  }

  async validateVideo(videoPath: string): Promise<boolean> {
    try {
      const metadata = await this.extractMetadata(videoPath);

      // Basic validation
      if (metadata.duration <= 0) {
        return false;
      }

      if (!metadata.resolution || metadata.resolution === '0x0') {
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`Video validation failed for ${videoPath}:`, error);
      return false;
    }
  }

  async generateThumbnail(videoPath: string, outputPath: string, timeOffset: number = 1): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          count: 1,
          folder: '',
          filename: outputPath,
          timemarks: [timeOffset]
        })
        .on('end', () => {
          logger.info(`Thumbnail generated: ${outputPath}`);
          resolve();
        })
        .on('error', (err) => {
          logger.error(`Failed to generate thumbnail for ${videoPath}:`, err);
          reject(new Error('Failed to generate thumbnail'));
        });
    });
  }

  private evaluateFPS(rFrameRate: string | undefined): number | undefined {
    if (!rFrameRate) return undefined;

    try {
      if (rFrameRate.includes('/')) {
        const [numerator, denominator] = rFrameRate.split('/').map(Number);
        return Math.round(numerator / denominator);
      }
      return Math.round(parseFloat(rFrameRate));
    } catch (error) {
      logger.warn(`Failed to parse frame rate: ${rFrameRate}`);
      return undefined;
    }
  }
}