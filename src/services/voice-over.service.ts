import { prisma } from '@/utils/database';
import logger from '@/utils/logger';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

export class VoiceOverService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'voiceovers');

  constructor() {
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create voice over upload directory:', error);
    }
  }

  /**
   * Get audio file duration using FFprobe
   */
  async getAudioDuration(audioPath: string): Promise<number> {
    try {
      const ffprobePath = process.env.FFMPEG_PATH ?
        path.join(path.dirname(process.env.FFMPEG_PATH), 'ffprobe.exe') :
        'ffprobe';

      const command = `"${ffprobePath}" -v quiet -print_format json -show_format "${audioPath}"`;
      const { stdout } = await execAsync(command);
      const metadata = JSON.parse(stdout);

      const duration = parseFloat(metadata.format?.duration || '0');
      logger.info(`Audio duration for ${path.basename(audioPath)}: ${duration}s`);

      return duration;
    } catch (error) {
      logger.error('Failed to get audio duration:', error);
      throw new Error(`Failed to analyze audio file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate optimal speed for auto-match strategy
   * Clamps between 0.8x and 1.5x
   */
  calculateOptimalSpeed(videoDuration: number, voiceDuration: number): number {
    const ratio = videoDuration / voiceDuration;

    // Clamp to acceptable range
    if (ratio < 0.8) return 0.8;
    if (ratio > 1.5) return 1.5;

    // Round to nearest 0.05 for cleaner values
    return Math.round(ratio * 20) / 20;
  }

  /**
   * Save uploaded voice over file
   */
  async saveVoiceOverFile(
    file: Express.Multer.File,
    projectId: string,
    order: number = 0
  ): Promise<any> {
    try {
      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${projectId}_${timestamp}_${sanitizedName}`;
      const filepath = path.join(this.uploadDir, filename);

      // Save file
      await fs.writeFile(filepath, file.buffer);

      // Get audio duration
      const duration = await this.getAudioDuration(filepath);

      // Save to database
      const voiceOverFile = await prisma.voiceOverFile.create({
        data: {
          projectId,
          originalName: file.originalname,
          filename,
          path: filepath,
          size: file.size,
          duration,
          format: path.extname(file.originalname).substring(1).toLowerCase(),
          order
        }
      });

      logger.info(`Voice over file saved: ${filename} (duration: ${duration}s)`);
      return voiceOverFile;
    } catch (error) {
      logger.error('Failed to save voice over file:', error);
      throw error;
    }
  }

  /**
   * Get all voice over files for a project
   */
  async getProjectVoiceOvers(projectId: string): Promise<any[]> {
    return prisma.voiceOverFile.findMany({
      where: { projectId },
      orderBy: { order: 'asc' }
    });
  }

  /**
   * Delete voice over file
   */
  async deleteVoiceOver(voiceOverId: string): Promise<boolean> {
    try {
      const voiceOver = await prisma.voiceOverFile.findUnique({
        where: { id: voiceOverId }
      });

      if (!voiceOver) {
        return false;
      }

      // Delete file from disk
      try {
        await fs.unlink(voiceOver.path);
      } catch (error) {
        logger.warn(`Failed to delete voice over file from disk: ${voiceOver.path}`);
      }

      // Delete from database
      await prisma.voiceOverFile.delete({
        where: { id: voiceOverId }
      });

      logger.info(`Voice over deleted: ${voiceOverId}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete voice over:', error);
      throw error;
    }
  }

  /**
   * Update voice over order (for reordering)
   */
  async updateVoiceOverOrder(projectId: string, orders: { id: string; order: number }[]): Promise<void> {
    try {
      await prisma.$transaction(
        orders.map(({ id, order }) =>
          prisma.voiceOverFile.update({
            where: { id },
            data: { order }
          })
        )
      );
      logger.info(`Voice over order updated for project: ${projectId}`);
    } catch (error) {
      logger.error('Failed to update voice over order:', error);
      throw error;
    }
  }

  /**
   * Merge video with voice over using FFmpeg
   */
  async mergeVideoWithVoiceOver(
    videoPath: string,
    voiceOverPath: string,
    outputPath: string,
    options?: { fadeIn?: number; fadeOut?: number }
  ): Promise<string> {
    try {
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

      // Build filter for audio fade if needed
      let audioFilter = '';
      if (options?.fadeIn || options?.fadeOut) {
        const filters = [];
        if (options.fadeIn) {
          filters.push(`afade=t=in:st=0:d=${options.fadeIn}`);
        }
        if (options.fadeOut) {
          // Need to get duration first for fade out
          const duration = await this.getAudioDuration(voiceOverPath);
          filters.push(`afade=t=out:st=${duration - options.fadeOut}:d=${options.fadeOut}`);
        }
        if (filters.length > 0) {
          audioFilter = `-af "${filters.join(',')}"`;
        }
      }

      // FFmpeg command to merge video with voice over
      // -c:v copy - copy video stream without re-encoding
      // -c:a aac - encode audio as AAC
      // -map 0:v - take video from first input
      // -map 1:a - take audio from second input (voice over)
      // -shortest - match output duration to shortest input
      const command = `"${ffmpegPath}" -i "${videoPath}" -i "${voiceOverPath}" -c:v copy -c:a aac -b:a 192k ${audioFilter} -map 0:v -map 1:a -shortest -y "${outputPath}"`;

      logger.info('Merging video with voice over...');
      const { stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });

      // Check if output file was created
      const stats = await fs.stat(outputPath);
      if (stats.size === 0) {
        throw new Error('Output file is empty');
      }

      logger.info(`Video merged with voice over successfully: ${outputPath}`);
      return outputPath;
    } catch (error) {
      logger.error('Failed to merge video with voice over:', error);
      throw new Error(`Failed to merge video with voice over: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Apply speed to video while maintaining audio sync
   */
  async applySpeedToVideo(videoPath: string, speed: number, outputPath: string): Promise<string> {
    try {
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

      // Calculate PTS value (inverse of speed for video)
      const pts = 1 / speed;

      // Build filter complex for video speed
      // Note: For audio, we'll use atempo which has limitations (0.5 to 2.0 range)
      let audioFilter = '';
      if (speed >= 0.5 && speed <= 2.0) {
        audioFilter = `atempo=${speed}`;
      } else if (speed < 0.5) {
        // Chain multiple atempo filters for speeds < 0.5
        audioFilter = `atempo=0.5,atempo=${speed / 0.5}`;
      } else if (speed > 2.0) {
        // Chain multiple atempo filters for speeds > 2.0
        audioFilter = `atempo=2.0,atempo=${speed / 2.0}`;
      }

      const command = `"${ffmpegPath}" -i "${videoPath}" -filter:v "setpts=${pts}*PTS" -filter:a "${audioFilter}" -y "${outputPath}"`;

      logger.info(`Applying speed ${speed}x to video...`);
      await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });

      logger.info(`Speed applied successfully: ${outputPath}`);
      return outputPath;
    } catch (error) {
      logger.error('Failed to apply speed to video:', error);
      throw new Error(`Failed to apply speed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Estimate total duration needed for all voice overs with current settings
   */
  async estimateTotalDuration(projectId: string, outputCount: number): Promise<number> {
    const voiceOvers = await this.getProjectVoiceOvers(projectId);

    if (voiceOvers.length === 0) {
      return 0;
    }

    // Calculate total duration based on distribution
    let totalDuration = 0;
    for (let i = 0; i < outputCount; i++) {
      const voIndex = i % voiceOvers.length; // Round-robin assignment
      totalDuration += voiceOvers[voIndex].duration;
    }

    return totalDuration;
  }

  /**
   * Assign voice overs to outputs using round-robin
   */
  assignVoiceOversToOutputs(voiceOvers: any[], outputCount: number): any[] {
    const assignments = [];

    for (let i = 0; i < outputCount; i++) {
      const voIndex = i % voiceOvers.length;
      assignments.push(voiceOvers[voIndex]);
    }

    return assignments;
  }
}

// Export singleton instance
export const voiceOverService = new VoiceOverService();