import { Response } from 'express';
import { prisma } from '@/utils/database';
import { AuthenticatedRequest } from '@/middleware/auth.middleware';
import { ResponseHelper, createPagination } from '@/utils/response';
import { VideoProcessingService } from '@/services/video-processing.service';
import { JobStatus, ProjectStatus, TransactionType } from '@/types';
import logger from '@/utils/logger';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { pipeline } from 'stream/promises';
const videoProcessingService = new VideoProcessingService();

export class ProcessingController {
  async startProcessing(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { projectId } = req.params;
      const { settings: mixingSettings } = req.body;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
        include: {
          videoFiles: true,
          videoGroups: {
            include: { videoFiles: true }
          }
        }
      });

      if (!project) {
        ResponseHelper.notFound(res, 'Project not found');
        return;
      }

      if (project.status === ProjectStatus.PROCESSING) {
        ResponseHelper.error(res, 'Project is already being processed', 409);
        return;
      }

      if (project.videoFiles.length === 0) {
        ResponseHelper.error(res, 'Project has no video files', 400);
        return;
      }

      // Minimum 2 videos required for mixing
      if (project.videoFiles.length < 2) {
        ResponseHelper.error(res, 'Minimum 2 videos required for mixing. Please upload more videos.', 400);
        return;
      }

      // Validate and sanitize mixing settings
      if (!mixingSettings) {
        ResponseHelper.error(res, 'Processing settings are required', 400);
        return;
      }

      // Validate required fields and types
      if (typeof mixingSettings !== 'object') {
        ResponseHelper.error(res, 'Settings must be an object', 400);
        return;
      }

      // Validate output count
      const outputCount = Math.max(1, Math.min(100, Number(mixingSettings.outputCount) || 1));
      if (isNaN(outputCount)) {
        ResponseHelper.error(res, 'Output count must be a valid number', 400);
        return;
      }

      // Sanitize settings with safe defaults (removing problematic properties)
      const processingSettings = {
        // Core mixing options with validation
        orderMixing: Boolean(mixingSettings.orderMixing),
        speedMixing: Boolean(mixingSettings.speedMixing),
        differentStartingVideo: Boolean(mixingSettings.differentStartingVideo),
        groupMixing: Boolean(mixingSettings.groupMixing),

        // Speed settings with validation
        speedRange: (mixingSettings.speedRange && typeof mixingSettings.speedRange === 'object')
          ? mixingSettings.speedRange
          : { min: 0.5, max: 2 },
        allowedSpeeds: Array.isArray(mixingSettings.allowedSpeeds)
          ? mixingSettings.allowedSpeeds.filter(s => typeof s === 'number' && s > 0)
          : [0.5, 0.75, 1, 1.25, 1.5, 2],

        // Quality settings with validation
        metadataSource: ['normal', 'capcut', 'vn', 'inshot'].includes(mixingSettings.metadataSource)
          ? mixingSettings.metadataSource
          : 'normal',
        bitrate: ['low', 'medium', 'high'].includes(mixingSettings.bitrate)
          ? mixingSettings.bitrate
          : 'medium',
        resolution: ['sd', 'hd', 'fullhd'].includes(mixingSettings.resolution)
          ? mixingSettings.resolution
          : 'hd',
        frameRate: [24, 30, 60].includes(Number(mixingSettings.frameRate))
          ? Number(mixingSettings.frameRate)
          : 30,

        // Duration and other settings
        aspectRatio: mixingSettings.aspectRatio || 'original',
        durationType: ['original', 'fixed'].includes(mixingSettings.durationType)
          ? mixingSettings.durationType
          : 'original',
        fixedDuration: typeof mixingSettings.fixedDuration === 'number' && mixingSettings.fixedDuration > 0
          ? Math.min(600, Math.max(5, mixingSettings.fixedDuration))
          : 30,
        smartTrimming: Boolean(mixingSettings.smartTrimming),
        durationDistributionMode: ['proportional', 'equal', 'weighted'].includes(mixingSettings.durationDistributionMode)
          ? mixingSettings.durationDistributionMode
          : 'proportional',
        audioMode: mixingSettings.audioMode === 'mute' ? 'mute' : 'keep',

        // Force removed features to safe defaults
        transitionMixing: false,
        colorVariations: false,

        // Validated output count
        outputCount
      };

      // Log settings for debugging and validation
      logger.info('[Settings Received] Processing controller received settings:', JSON.stringify({
        hasCustomSettings: !!mixingSettings,
        durationType: processingSettings.durationType,
        fixedDuration: processingSettings.fixedDuration,
        smartTrimming: processingSettings.smartTrimming,
        durationDistributionMode: processingSettings.durationDistributionMode,
        outputCount: outputCount,
        videoCount: project.videoFiles.length
      }));

      // Calculate credit cost using the actual settings that will be used for processing
      const creditsRequired = this.calculateCreditsRequired(outputCount, processingSettings);

      // Check user credits
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true }
      });

      if (!user || user.credits < creditsRequired) {
        ResponseHelper.error(res, `Insufficient credits. Required: ${creditsRequired}, Available: ${user?.credits || 0}`, 402);
        return;
      }

      // Create processing job
      const job = await prisma.$transaction(async (tx) => {
        // Deduct credits - FIX: Use actual creditsRequired amount
        await tx.user.update({
          where: { id: userId },
          data: { credits: { decrement: creditsRequired } }
        });

        // Record transaction with correct amount
        await tx.creditTransaction.create({
          data: {
            userId,
            amount: -creditsRequired,
            type: TransactionType.USAGE,
            description: `Video processing for project: ${project.name} (${outputCount} videos)`
          }
        });

        // Update project status
        await tx.project.update({
          where: { id: projectId },
          data: { status: ProjectStatus.PROCESSING }
        });

        // Create job with credits tracking and settings
        return tx.processingJob.create({
          data: {
            projectId,
            status: JobStatus.PENDING,
            creditsUsed: creditsRequired, // Track credits used for potential refund
            outputCount: outputCount,
            settings: JSON.stringify(processingSettings) // Store settings for reference
          }
        });
      });

      // Queue the processing job with the same settings used for credit calculation
      await videoProcessingService.queueProcessingJob(job.id, {
        projectId,
        outputCount: outputCount,
        settings: processingSettings
      });

      ResponseHelper.success(res, {
        jobId: job.id,
        creditsDeducted: creditsRequired,
        estimatedDuration: this.estimateProcessingTime(project.videoFiles, outputCount)
      }, 'Processing started successfully', 202);
    } catch (error) {
      logger.error('Start processing error:', error);
      ResponseHelper.serverError(res, 'Failed to start processing');
    }
  }

  async getJobStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const job = await prisma.processingJob.findFirst({
        where: {
          id: jobId,
          project: { userId }
        },
        include: {
          project: {
            select: { id: true, name: true }
          },
          outputFiles: {
            select: { id: true, filename: true, size: true, createdAt: true }
          }
        }
      });

      if (!job) {
        ResponseHelper.notFound(res, 'Job not found');
        return;
      }

      ResponseHelper.success(res, job);
    } catch (error) {
      logger.error('Get job status error:', error);
      ResponseHelper.serverError(res, 'Failed to get job status');
    }
  }

  async cancelJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const job = await prisma.processingJob.findFirst({
        where: {
          id: jobId,
          project: { userId }
        }
      });

      if (!job) {
        ResponseHelper.notFound(res, 'Job not found');
        return;
      }

      if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
        ResponseHelper.error(res, 'Cannot cancel completed or failed job', 409);
        return;
      }

      // Cancel the job - this will update database and kill FFmpeg process
      await videoProcessingService.cancelJob(jobId);

      ResponseHelper.success(res, null, 'Job cancelled successfully');
    } catch (error) {
      logger.error('Cancel job error:', error);
      ResponseHelper.serverError(res, 'Failed to cancel job');
    }
  }

  async getProjectJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { projectId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      // Verify user owns the project
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId }
      });

      if (!project) {
        ResponseHelper.notFound(res, 'Project not found');
        return;
      }

      const jobs = await prisma.processingJob.findMany({
        where: { projectId },
        include: {
          project: {
            select: { id: true, name: true }
          },
          outputFiles: {
            select: { id: true, filename: true, size: true, createdAt: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Parse settings for each job
      const jobsWithParsedSettings = jobs.map(job => ({
        ...job,
        settings: job.settings ? (() => {
          try {
            return JSON.parse(job.settings);
          } catch {
            return {};
          }
        })() : {}
      }));

      ResponseHelper.success(res, jobsWithParsedSettings);
    } catch (error) {
      logger.error('Get project jobs error:', error);
      ResponseHelper.serverError(res, 'Failed to get project jobs');
    }
  }

  async getUserJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { page = '1', limit = '10' } = req.query as any;
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      const [jobs, total] = await Promise.all([
        prisma.processingJob.findMany({
          where: {
            project: { userId }
          },
          include: {
            project: {
              select: { id: true, name: true }
            },
            outputFiles: {
              select: { id: true, filename: true, size: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum
        }),
        prisma.processingJob.count({
          where: {
            project: { userId }
          }
        })
      ]);

      // Parse settings for each job
      const jobsWithParsedSettings = jobs.map(job => ({
        ...job,
        settings: job.settings ? (() => {
          try {
            return JSON.parse(job.settings);
          } catch {
            return {};
          }
        })() : {}
      }));

      const pagination = createPagination(pageNum, limitNum, total);

      ResponseHelper.success(res, jobsWithParsedSettings, 'Jobs retrieved successfully', 200, pagination);
    } catch (error) {
      logger.error('Get user jobs error:', error);
      ResponseHelper.serverError(res, 'Failed to get jobs');
    }
  }

  async getCreditsEstimate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { outputCount, settings } = req.body;

      if (!outputCount || outputCount < 1) {
        ResponseHelper.error(res, 'Invalid output count', 400);
        return;
      }

      const creditsRequired = this.calculateCreditsRequired(outputCount, settings || {});

      // Get user's current credits
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true }
      });

      const hasEnoughCredits = user ? user.credits >= creditsRequired : false;

      ResponseHelper.success(res, {
        creditsRequired,
        userCredits: user?.credits || 0,
        hasEnoughCredits,
        breakdown: this.getCreditBreakdown(outputCount, settings || {})
      });
    } catch (error) {
      logger.error('Get credits estimate error:', error);
      ResponseHelper.serverError(res, 'Failed to calculate credits estimate');
    }
  }

  async getJobDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      // Get job with full details including error information
      const job = await prisma.processingJob.findFirst({
        where: {
          id: jobId,
          project: { userId }
        },
        include: {
          project: {
            select: { id: true, name: true }
          },
          outputFiles: true
        }
      });

      if (!job) {
        ResponseHelper.error(res, 'Job not found', 404);
        return;
      }

      // Parse error details if available
      let errorDetails = null;
      if (job.errorMessage) {
        try {
          // Try to parse if it's JSON
          errorDetails = JSON.parse(job.errorMessage);
        } catch {
          // Otherwise use as plain text
          errorDetails = {
            message: job.errorMessage,
            type: 'processing_error'
          };
        }
      }

      // Parse settings if available
      let settings = null;
      if (job.settings) {
        try {
          settings = JSON.parse(job.settings);
        } catch {
          // If parsing fails, use raw string
          settings = job.settings;
        }
      }

      ResponseHelper.success(res, {
        id: job.id,
        projectId: job.projectId,
        projectName: job.project.name,
        status: job.status,
        outputCount: job.outputCount,
        creditsUsed: job.creditsUsed,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        errorDetails,
        outputFiles: job.outputFiles,
        settings,
        duration: job.completedAt ?
          Math.floor((job.completedAt.getTime() - job.createdAt.getTime()) / 1000) : null
      });
    } catch (error) {
      logger.error('Get job details error:', error);
      ResponseHelper.serverError(res, 'Failed to get job details');
    }
  }

  async getJobOutputs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const job = await prisma.processingJob.findFirst({
        where: {
          id: jobId,
          project: { userId }
        },
        include: {
          outputFiles: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!job) {
        ResponseHelper.notFound(res, 'Job not found');
        return;
      }

      ResponseHelper.success(res, job.outputFiles);
    } catch (error) {
      logger.error('Get job outputs error:', error);
      ResponseHelper.serverError(res, 'Failed to get job outputs');
    }
  }

  async downloadOutput(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { outputId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const output = await prisma.outputFile.findFirst({
        where: {
          id: outputId,
          job: {
            project: { userId }
          }
        }
      });

      if (!output) {
        ResponseHelper.notFound(res, 'Output file not found');
        return;
      }

      if (!fs.existsSync(output.path)) {
        ResponseHelper.notFound(res, 'File not found on disk');
        return;
      }

      res.setHeader('Content-Disposition', `attachment; filename="${output.filename}"`);
      res.setHeader('Content-Type', 'video/mp4');

      const fileStream = fs.createReadStream(output.path);
      fileStream.pipe(res);
    } catch (error) {
      logger.error('Download output error:', error);
      ResponseHelper.serverError(res, 'Failed to download output');
    }
  }

  async downloadBatch(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId } = req.params;
      const { outputIds, mode = 'all' } = req.body; // mode: 'all', 'selected', 'batch'

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      // Get job with outputs
      const job = await prisma.processingJob.findFirst({
        where: {
          id: jobId,
          project: { userId }
        },
        include: {
          outputFiles: true,
          project: true
        }
      });

      if (!job) {
        ResponseHelper.error(res, 'Job not found', 404);
        return;
      }

      // Determine which files to include
      let filesToZip = job.outputFiles;

      if (mode === 'selected' && outputIds && outputIds.length > 0) {
        filesToZip = job.outputFiles.filter(f => outputIds.includes(f.id));
      }

      if (filesToZip.length === 0) {
        ResponseHelper.error(res, 'No files to download', 400);
        return;
      }

      // Set response headers for ZIP download
      const zipFilename = `${job.project.name}_${job.id}_batch.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

      // Create ZIP archive
      const archive = archiver('zip', {
        zlib: { level: 6 } // Compression level (0-9)
      });

      // Handle archive errors
      archive.on('error', (err) => {
        logger.error('Archive error:', err);
        throw err;
      });

      // Pipe archive to response
      archive.pipe(res);

      // Add files to archive
      for (const file of filesToZip) {
        if (fs.existsSync(file.path)) {
          archive.file(file.path, { name: file.filename });
        }
      }

      // Finalize the archive
      await archive.finalize();

    } catch (error) {
      logger.error('Batch download error:', error);
      ResponseHelper.serverError(res, 'Failed to create batch download');
    }
  }

  async downloadBatchChunked(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId } = req.params;
      const { chunkSize = 50, chunkIndex = 0 } = req.query;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      // Get job with outputs
      const job = await prisma.processingJob.findFirst({
        where: {
          id: jobId,
          project: { userId }
        },
        include: {
          outputFiles: {
            skip: Number(chunkIndex) * Number(chunkSize),
            take: Number(chunkSize)
          },
          project: true
        }
      });

      if (!job || job.outputFiles.length === 0) {
        ResponseHelper.error(res, 'No files found for this chunk', 404);
        return;
      }

      // Set response headers for ZIP download
      const zipFilename = `${job.project.name}_${job.id}_chunk${Number(chunkIndex) + 1}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

      // Create ZIP archive
      const archive = archiver('zip', {
        zlib: { level: 6 }
      });

      archive.on('error', (err) => {
        logger.error('Archive error:', err);
        throw err;
      });

      archive.pipe(res);

      // Add files to archive
      for (const file of job.outputFiles) {
        if (fs.existsSync(file.path)) {
          archive.file(file.path, { name: file.filename });
        }
      }

      await archive.finalize();

    } catch (error) {
      logger.error('Chunked batch download error:', error);
      ResponseHelper.serverError(res, 'Failed to create chunked download');
    }
  }

  async getBatchDownloadInfo(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { jobId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      // Get job with output count and total size
      const job = await prisma.processingJob.findFirst({
        where: {
          id: jobId,
          project: { userId }
        },
        include: {
          outputFiles: {
            select: {
              id: true,
              size: true
            }
          }
        }
      });

      if (!job) {
        ResponseHelper.error(res, 'Job not found', 404);
        return;
      }

      // Calculate total size and recommended chunks
      const totalSize = job.outputFiles.reduce((sum, file) => sum + file.size, 0);
      const totalFiles = job.outputFiles.length;
      const recommendedChunkSize = totalFiles > 100 ? 50 : totalFiles > 50 ? 25 : totalFiles;
      const numberOfChunks = Math.ceil(totalFiles / recommendedChunkSize);

      ResponseHelper.success(res, {
        totalFiles,
        totalSize,
        totalSizeFormatted: this.formatFileSize(totalSize),
        recommendedChunkSize,
        numberOfChunks,
        estimatedZipSize: Math.round(totalSize * 0.9), // ZIP compression estimate
        downloadOptions: {
          singleZip: totalFiles <= 100,
          chunkedZip: totalFiles > 100,
          cloudUpload: totalFiles > 500
        }
      });
    } catch (error) {
      logger.error('Get batch download info error:', error);
      ResponseHelper.serverError(res, 'Failed to get download info');
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private calculateCreditsRequired(outputCount: number, settings: any): number {
    // Base cost: 1 credit per output video
    let baseCredits = outputCount;

    // Output count multipliers (volume pricing)
    const volumeMultiplier = this.getVolumeMultiplier(outputCount);

    // Quality multipliers (resolution + bitrate + framerate)
    const qualityMultiplier = this.getQualityMultiplier(settings);

    // Mixing complexity multipliers
    const mixingMultiplier = this.getMixingComplexityMultiplier(settings);

    // Apply all multipliers
    const totalCredits = baseCredits * volumeMultiplier * qualityMultiplier * mixingMultiplier;

    return Math.ceil(totalCredits);
  }

  private getVolumeMultiplier(outputCount: number): number {
    if (outputCount <= 5) return 1.0;        // 1-5 videos: no penalty
    if (outputCount <= 10) return 1.5;       // 6-10 videos: 1.5x cost
    if (outputCount <= 20) return 2.0;       // 11-20 videos: 2x cost
    return 3.0;                              // 21+ videos: 3x cost
  }

  private getQualityMultiplier(settings: any): number {
    let multiplier = 1.0;

    // Resolution multiplier
    const resolution = settings.resolution || 'HD';
    switch (resolution) {
      case 'SD': multiplier *= 0.8; break;     // 480p: 0.8x
      case 'HD': multiplier *= 1.0; break;     // 720p: 1.0x
      case 'FULL_HD': multiplier *= 1.5; break; // 1080p: 1.5x
      default: multiplier *= 1.0; break;
    }

    // Bitrate multiplier
    const bitrate = settings.bitrate || 'MEDIUM';
    switch (bitrate) {
      case 'LOW': multiplier *= 0.7; break;    // 1 Mbps: 0.7x
      case 'MEDIUM': multiplier *= 1.0; break; // 4 Mbps: 1.0x
      case 'HIGH': multiplier *= 1.3; break;   // 8 Mbps: 1.3x
      default: multiplier *= 1.0; break;
    }

    // Frame rate multiplier
    const frameRate = settings.frameRate || 30;
    if (frameRate >= 60) {
      multiplier *= 1.2; // 60 FPS: 1.2x cost
    }

    return multiplier;
  }

  private getMixingComplexityMultiplier(settings: any): number {
    let complexityScore = 0;

    // Count enabled mixing options (anti-fingerprinting features)
    if (settings.orderMixing !== false) complexityScore += 1;           // Order mixing
    if (settings.speedVariations) complexityScore += 1;                 // Speed variations
    if (settings.differentStartingVideo) complexityScore += 1;          // Different starting video
    if (settings.groupMixing) complexityScore += 1;                     // Group-based mixing
    if (settings.transitionVariations) complexityScore += 1;            // Transition variations
    if (settings.colorVariations) complexityScore += 1;                 // Color variations

    // Complexity multipliers based on anti-fingerprinting strength
    switch (complexityScore) {
      case 0: return 0.5;  // No variations: 0.5x (basic processing)
      case 1: return 0.8;  // Weak: 0.8x
      case 2: return 1.0;  // Fair: 1.0x (base cost)
      case 3: return 1.2;  // Good: 1.2x
      case 4: return 1.5;  // Strong: 1.5x
      case 5: return 1.8;  // Very Strong: 1.8x
      case 6: return 2.2;  // Maximum: 2.2x (all features enabled)
      default: return 1.0;
    }
  }

  private getCreditBreakdown(outputCount: number, settings: any): any {
    const baseCredits = outputCount;
    const volumeMultiplier = this.getVolumeMultiplier(outputCount);
    const qualityMultiplier = this.getQualityMultiplier(settings);
    const mixingMultiplier = this.getMixingComplexityMultiplier(settings);

    // Calculate step-by-step costs
    const afterVolume = baseCredits * volumeMultiplier;
    const afterQuality = afterVolume * qualityMultiplier;
    const totalCredits = afterQuality * mixingMultiplier;

    // Get anti-fingerprinting strength
    let complexityScore = 0;
    const enabledFeatures = [];

    if (settings.orderMixing !== false) { complexityScore += 1; enabledFeatures.push('Order Mixing'); }
    if (settings.speedVariations) { complexityScore += 1; enabledFeatures.push('Speed Variations'); }
    if (settings.differentStartingVideo) { complexityScore += 1; enabledFeatures.push('Different Starting Video'); }
    if (settings.groupMixing) { complexityScore += 1; enabledFeatures.push('Group-Based Mixing'); }
    if (settings.transitionVariations) { complexityScore += 1; enabledFeatures.push('Transition Variations'); }
    if (settings.colorVariations) { complexityScore += 1; enabledFeatures.push('Color Variations'); }

    const strengthLevels = ['None', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong', 'Maximum'];
    const strengthLevel = strengthLevels[complexityScore] || 'Fair';

    return {
      baseCredits,
      outputCount,
      multipliers: {
        volume: {
          value: volumeMultiplier,
          reason: this.getVolumeReason(outputCount)
        },
        quality: {
          value: qualityMultiplier,
          reason: this.getQualityReason(settings)
        },
        mixing: {
          value: mixingMultiplier,
          reason: `${strengthLevel} anti-fingerprinting (${complexityScore}/6 features)`
        }
      },
      steps: {
        base: baseCredits,
        afterVolume: Math.ceil(afterVolume),
        afterQuality: Math.ceil(afterQuality),
        final: Math.ceil(totalCredits)
      },
      enabledFeatures,
      antiFingerprintingStrength: strengthLevel
    };
  }

  private getVolumeReason(outputCount: number): string {
    if (outputCount <= 5) return '1-5 videos: No volume penalty';
    if (outputCount <= 10) return '6-10 videos: 1.5x volume penalty';
    if (outputCount <= 20) return '11-20 videos: 2x volume penalty';
    return '21+ videos: 3x volume penalty';
  }

  private getQualityReason(settings: any): string {
    const factors = [];

    const resolution = settings.resolution || 'HD';
    switch (resolution) {
      case 'SD': factors.push('480p (-20%)'); break;
      case 'HD': factors.push('720p (base)'); break;
      case 'FULL_HD': factors.push('1080p (+50%)'); break;
      default: factors.push('720p (base)'); break;
    }

    const bitrate = settings.bitrate || 'MEDIUM';
    switch (bitrate) {
      case 'LOW': factors.push('1 Mbps (-30%)'); break;
      case 'MEDIUM': factors.push('4 Mbps (base)'); break;
      case 'HIGH': factors.push('8 Mbps (+30%)'); break;
      default: factors.push('4 Mbps (base)'); break;
    }

    const frameRate = settings.frameRate || 30;
    if (frameRate >= 60) {
      factors.push('60 FPS (+20%)');
    }

    return factors.join(', ');
  }

  private estimateProcessingTime(videoFiles: any[], outputCount: number): string {
    const totalDuration = videoFiles.reduce((sum, file) => sum + file.duration, 0);
    const estimatedMinutes = Math.ceil((totalDuration * outputCount) / 60 / 4); // Assume 4x real-time processing

    if (estimatedMinutes < 60) {
      return `${estimatedMinutes} minutes`;
    } else {
      const hours = Math.floor(estimatedMinutes / 60);
      const minutes = estimatedMinutes % 60;
      return `${hours}h ${minutes}m`;
    }
  }
}