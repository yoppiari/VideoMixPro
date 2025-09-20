import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import logger from '@/utils/logger';

export interface MemoryUsageInfo {
  totalMemory: number;
  freeMemory: number;
  usedMemory: number;
  memoryUsagePercent: number;
  recommendedMaxFileSize: number;
  recommendedChunkSize: number;
}

export interface ProcessingChunk {
  startTime: number;
  duration: number;
  outputPath: string;
  inputFiles: string[];
}

export interface OptimizationSettings {
  maxMemoryUsagePercent: number; // Max memory usage percentage (default: 70%)
  chunkSizeSeconds: number; // Size of each processing chunk in seconds
  maxConcurrentOperations: number; // Max concurrent FFmpeg operations
  enableTempCleanup: boolean; // Auto cleanup temp files
  compressionLevel: 'low' | 'medium' | 'high'; // Video compression level
}

export class MemoryOptimizationService {
  private readonly tempDir = process.env.TEMP_DIR || 'temp';
  private activeOperations = new Set<string>();
  private tempFiles = new Set<string>();

  private defaultSettings: OptimizationSettings = {
    maxMemoryUsagePercent: 70,
    chunkSizeSeconds: 30, // Process in 30-second chunks
    maxConcurrentOperations: 2,
    enableTempCleanup: true,
    compressionLevel: 'medium'
  };

  constructor() {
    this.ensureTempDirectory();
    this.startMemoryMonitoring();
  }

  /**
   * Get current memory usage information
   */
  getMemoryUsage(): MemoryUsageInfo {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    // Recommend max file size based on available memory
    // Rule of thumb: video processing can use 3-5x the file size in memory
    const availableMemory = freeMemory * 0.8; // Use 80% of free memory
    const recommendedMaxFileSize = Math.floor(availableMemory / 4); // Conservative estimate

    // Recommend chunk size based on memory constraints
    const recommendedChunkSize = Math.min(
      this.defaultSettings.chunkSizeSeconds,
      Math.max(10, Math.floor(availableMemory / (100 * 1024 * 1024))) // 10s minimum
    );

    return {
      totalMemory,
      freeMemory,
      usedMemory,
      memoryUsagePercent,
      recommendedMaxFileSize,
      recommendedChunkSize
    };
  }

  /**
   * Check if system has enough memory for processing
   */
  canProcessFile(fileSizeBytes: number, settings?: Partial<OptimizationSettings>): boolean {
    const memoryInfo = this.getMemoryUsage();
    const maxUsagePercent = settings?.maxMemoryUsagePercent || this.defaultSettings.maxMemoryUsagePercent;

    // Estimate memory needed for processing (4x file size)
    const estimatedMemoryNeeded = fileSizeBytes * 4;
    const memoryAfterProcessing = (memoryInfo.usedMemory + estimatedMemoryNeeded) / memoryInfo.totalMemory * 100;

    return memoryAfterProcessing <= maxUsagePercent;
  }

  /**
   * Determine optimal processing strategy for a video file
   */
  async determineProcessingStrategy(
    videoPath: string,
    targetOutputSize?: number,
    settings?: Partial<OptimizationSettings>
  ): Promise<{
    strategy: 'direct' | 'chunked' | 'compressed' | 'stream';
    chunkCount?: number;
    chunkDuration?: number;
    compressionNeeded: boolean;
    estimatedMemoryUsage: number;
  }> {
    try {
      const fileStats = await fs.stat(videoPath);
      const fileSize = fileStats.size;
      const memoryInfo = this.getMemoryUsage();
      const config = { ...this.defaultSettings, ...settings };

      // Get video metadata
      const metadata = await this.getVideoMetadata(videoPath);
      const duration = metadata.duration || 0;

      const estimatedMemoryUsage = fileSize * 3; // Conservative estimate

      // Strategy 1: Direct processing if file is small enough
      if (this.canProcessFile(fileSize, config) && estimatedMemoryUsage < memoryInfo.freeMemory * 0.5) {
        return {
          strategy: 'direct',
          compressionNeeded: false,
          estimatedMemoryUsage
        };
      }

      // Strategy 2: Compression if file is moderately large
      if (fileSize > 500 * 1024 * 1024 && config.compressionLevel !== 'low') { // > 500MB
        return {
          strategy: 'compressed',
          compressionNeeded: true,
          estimatedMemoryUsage: estimatedMemoryUsage * 0.6 // Compression reduces memory usage
        };
      }

      // Strategy 3: Chunked processing for large files
      if (duration > config.chunkSizeSeconds * 2) {
        const chunkDuration = Math.min(config.chunkSizeSeconds, duration / 4);
        const chunkCount = Math.ceil(duration / chunkDuration);

        return {
          strategy: 'chunked',
          chunkCount,
          chunkDuration,
          compressionNeeded: fileSize > 1024 * 1024 * 1024, // > 1GB
          estimatedMemoryUsage: estimatedMemoryUsage / chunkCount
        };
      }

      // Strategy 4: Streaming for very large files
      return {
        strategy: 'stream',
        compressionNeeded: true,
        estimatedMemoryUsage: Math.min(estimatedMemoryUsage, memoryInfo.freeMemory * 0.3)
      };

    } catch (error) {
      logger.error('Failed to determine processing strategy:', error);
      return {
        strategy: 'direct',
        compressionNeeded: false,
        estimatedMemoryUsage: 0
      };
    }
  }

  /**
   * Process video in chunks to optimize memory usage
   */
  async processVideoInChunks(
    inputPath: string,
    outputPath: string,
    chunkDuration: number,
    settings?: Partial<OptimizationSettings>
  ): Promise<string> {
    try {
      const config = { ...this.defaultSettings, ...settings };
      const metadata = await this.getVideoMetadata(inputPath);
      const totalDuration = metadata.duration || 0;

      if (totalDuration <= chunkDuration) {
        // File is small enough to process directly
        return this.processVideoWithCompression(inputPath, outputPath, config);
      }

      const chunks: ProcessingChunk[] = [];
      const chunkPaths: string[] = [];

      // Create chunks
      for (let startTime = 0; startTime < totalDuration; startTime += chunkDuration) {
        const duration = Math.min(chunkDuration, totalDuration - startTime);
        const chunkOutputPath = this.generateTempPath(`chunk_${startTime}_${Date.now()}.mp4`);

        chunks.push({
          startTime,
          duration,
          outputPath: chunkOutputPath,
          inputFiles: [inputPath]
        });
      }

      logger.info(`Processing ${chunks.length} chunks for ${inputPath}`);

      // Process chunks with concurrency control
      const semaphore = new Array(config.maxConcurrentOperations).fill(null);
      let chunkIndex = 0;

      await Promise.all(semaphore.map(async () => {
        while (chunkIndex < chunks.length) {
          const currentIndex = chunkIndex++;
          const chunk = chunks[currentIndex];

          try {
            await this.processChunk(inputPath, chunk, config);
            chunkPaths.push(chunk.outputPath);
            this.tempFiles.add(chunk.outputPath);

            logger.info(`Completed chunk ${currentIndex + 1}/${chunks.length}`);
          } catch (error) {
            logger.error(`Failed to process chunk ${currentIndex + 1}:`, error);
            throw error;
          }
        }
      }));

      // Concatenate all chunks
      logger.info('Concatenating processed chunks');
      const finalOutput = await this.concatenateChunks(chunkPaths, outputPath);

      // Cleanup temp files
      if (config.enableTempCleanup) {
        await this.cleanupTempFiles(chunkPaths);
      }

      return finalOutput;

    } catch (error) {
      logger.error('Chunked processing failed:', error);
      throw error;
    }
  }

  /**
   * Apply memory-optimized compression to video
   */
  async processVideoWithCompression(
    inputPath: string,
    outputPath: string,
    settings: OptimizationSettings
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const compressionSettings = this.getCompressionSettings(settings.compressionLevel);

      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(compressionSettings.videoBitrate)
        .audioBitrate(compressionSettings.audioBitrate)
        .size(compressionSettings.resolution)
        .outputOptions([
          '-preset', compressionSettings.preset,
          '-crf', compressionSettings.crf.toString(),
          '-movflags', '+faststart', // Enable streaming
          '-threads', Math.min(os.cpus().length, 4).toString() // Limit threads
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          logger.info('FFmpeg compression started:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.debug(`Compression progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          logger.info(`Compression completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error('Compression failed:', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Process video using streaming approach for minimal memory usage
   */
  async processVideoWithStreaming(
    inputPath: string,
    outputPath: string,
    settings: OptimizationSettings
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const compressionSettings = this.getCompressionSettings(settings.compressionLevel);

      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(compressionSettings.videoBitrate)
        .audioBitrate(compressionSettings.audioBitrate)
        .size(compressionSettings.resolution)
        .outputOptions([
          '-preset', 'veryfast', // Fastest encoding for streaming
          '-crf', '25', // Balanced quality/size
          '-movflags', '+faststart',
          '-threads', '1', // Single thread for low memory
          '-bufsize', '1M', // Small buffer
          '-maxrate', compressionSettings.videoBitrate,
          '-streaming'
        ])
        .output(outputPath)
        .on('start', () => {
          logger.info('Streaming processing started');
        })
        .on('end', () => {
          logger.info(`Streaming completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error('Streaming failed:', err);
          reject(err);
        })
        .run();
    });
  }

  private async processChunk(
    inputPath: string,
    chunk: ProcessingChunk,
    settings: OptimizationSettings
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions([`-ss ${chunk.startTime}`])
        .outputOptions([`-t ${chunk.duration}`])
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset', 'medium',
          '-crf', '23',
          '-threads', '1' // Single thread per chunk to manage memory
        ])
        .output(chunk.outputPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
  }

  private async concatenateChunks(chunkPaths: string[], outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Add all chunk inputs
      chunkPaths.forEach(chunkPath => {
        command.input(chunkPath);
      });

      // Create filter complex for concatenation
      const filterComplex = chunkPaths
        .map((_, index) => `[${index}:v][${index}:a]`)
        .join('') + `concat=n=${chunkPaths.length}:v=1:a=1[outv][outa]`;

      command
        .complexFilter([filterComplex])
        .outputOptions(['-map [outv]', '-map [outa]'])
        .output(outputPath)
        .on('end', () => {
          logger.info(`Chunks concatenated: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', reject)
        .run();
    });
  }

  private getCompressionSettings(level: 'low' | 'medium' | 'high') {
    switch (level) {
      case 'low':
        return {
          videoBitrate: '2000k',
          audioBitrate: '128k',
          resolution: '1280x720',
          preset: 'fast',
          crf: 28
        };
      case 'medium':
        return {
          videoBitrate: '1000k',
          audioBitrate: '96k',
          resolution: '854x480',
          preset: 'medium',
          crf: 25
        };
      case 'high':
        return {
          videoBitrate: '500k',
          audioBitrate: '64k',
          resolution: '640x360',
          preset: 'slow',
          crf: 22
        };
    }
  }

  private async getVideoMetadata(videoPath: string): Promise<{ duration: number }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          duration: metadata.format.duration || 0
        });
      });
    });
  }

  private generateTempPath(filename: string): string {
    return path.join(this.tempDir, filename);
  }

  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory:', error);
    }
  }

  private async cleanupTempFiles(filePaths: string[]): Promise<void> {
    await Promise.all(filePaths.map(async (filePath) => {
      try {
        await fs.unlink(filePath);
        this.tempFiles.delete(filePath);
        logger.debug(`Cleaned up temp file: ${filePath}`);
      } catch (error) {
        logger.warn(`Failed to cleanup temp file ${filePath}:`, error);
      }
    }));
  }

  private startMemoryMonitoring(): void {
    // Monitor memory usage every 30 seconds
    setInterval(() => {
      const memoryInfo = this.getMemoryUsage();
      if (memoryInfo.memoryUsagePercent > 85) {
        logger.warn(`High memory usage detected: ${memoryInfo.memoryUsagePercent.toFixed(1)}%`);
      }
    }, 30000);
  }

  /**
   * Get optimization recommendations based on current system state
   */
  getOptimizationRecommendations(): {
    memoryStatus: 'good' | 'warning' | 'critical';
    recommendations: string[];
    suggestedSettings: Partial<OptimizationSettings>;
  } {
    const memoryInfo = this.getMemoryUsage();
    const recommendations: string[] = [];
    let memoryStatus: 'good' | 'warning' | 'critical' = 'good';

    const suggestedSettings: Partial<OptimizationSettings> = {
      ...this.defaultSettings
    };

    if (memoryInfo.memoryUsagePercent > 85) {
      memoryStatus = 'critical';
      recommendations.push('System memory usage is critically high');
      recommendations.push('Consider processing smaller files or using chunked processing');
      suggestedSettings.maxMemoryUsagePercent = 60;
      suggestedSettings.chunkSizeSeconds = 15;
      suggestedSettings.maxConcurrentOperations = 1;
      suggestedSettings.compressionLevel = 'high';
    } else if (memoryInfo.memoryUsagePercent > 70) {
      memoryStatus = 'warning';
      recommendations.push('Memory usage is elevated');
      recommendations.push('Consider using compression for large files');
      suggestedSettings.maxMemoryUsagePercent = 65;
      suggestedSettings.chunkSizeSeconds = 20;
      suggestedSettings.compressionLevel = 'medium';
    } else {
      recommendations.push('System memory usage is healthy');
      recommendations.push('Can process files using standard settings');
    }

    return {
      memoryStatus,
      recommendations,
      suggestedSettings
    };
  }

  /**
   * Cleanup all temp files and resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up memory optimization service');
    await this.cleanupTempFiles(Array.from(this.tempFiles));
    this.activeOperations.clear();
  }
}