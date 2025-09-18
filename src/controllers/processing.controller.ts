import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '@/middleware/auth.middleware';
import { ResponseHelper, createPagination } from '@/utils/response';
import { VideoProcessingService } from '@/services/video-processing.service';
import { JobStatus, ProjectStatus, TransactionType } from '@/types';
import logger from '@/utils/logger';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();
const videoProcessingService = new VideoProcessingService();

export class ProcessingController {
  async startProcessing(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { projectId } = req.params;

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

      // Calculate credit cost
      const settings = project.settings as any;
      const outputCount = settings.outputCount || 1;
      const creditsRequired = this.calculateCreditsRequired(outputCount, settings);

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
        // Deduct credits
        await tx.user.update({
          where: { id: userId },
          data: { credits: { decrement: creditsRequired } }
        });

        // Record transaction
        await tx.creditTransaction.create({
          data: {
            userId,
            amount: -creditsRequired,
            type: TransactionType.USAGE,
            description: `Video processing for project: ${project.name}`
          }
        });

        // Update project status
        await tx.project.update({
          where: { id: projectId },
          data: { status: ProjectStatus.PROCESSING }
        });

        // Create job
        return tx.processingJob.create({
          data: {
            projectId,
            status: JobStatus.PENDING
          }
        });
      });

      // Queue the processing job
      await videoProcessingService.queueProcessingJob(job.id, {
        projectId,
        outputCount,
        settings
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

      // Cancel the job in queue
      await videoProcessingService.cancelJob(jobId);

      // Update job status
      await prisma.processingJob.update({
        where: { id: jobId },
        data: { status: JobStatus.CANCELLED }
      });

      // Update project status back to draft
      await prisma.project.update({
        where: { id: job.projectId },
        data: { status: ProjectStatus.DRAFT }
      });

      ResponseHelper.success(res, null, 'Job cancelled successfully');
    } catch (error) {
      logger.error('Cancel job error:', error);
      ResponseHelper.serverError(res, 'Failed to cancel job');
    }
  }

  async getUserJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { page = 1, limit = 10 } = req.query as any;
      const skip = (page - 1) * limit;

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
          take: limit
        }),
        prisma.processingJob.count({
          where: {
            project: { userId }
          }
        })
      ]);

      const pagination = createPagination(page, limit, total);

      ResponseHelper.success(res, jobs, 'Jobs retrieved successfully', 200, pagination);
    } catch (error) {
      logger.error('Get user jobs error:', error);
      ResponseHelper.serverError(res, 'Failed to get jobs');
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

  private calculateCreditsRequired(outputCount: number, settings: any): number {
    const baseCreditsPerVideo = 2;
    const qualityMultiplier = this.getQualityMultiplier(settings.quality);
    const formatMultiplier = this.getFormatMultiplier(settings.outputFormat);

    return Math.ceil(outputCount * baseCreditsPerVideo * qualityMultiplier * formatMultiplier);
  }

  private getQualityMultiplier(quality: string): number {
    switch (quality) {
      case 'LOW': return 0.5;
      case 'MEDIUM': return 1.0;
      case 'HIGH': return 1.5;
      case 'ULTRA': return 2.0;
      default: return 1.0;
    }
  }

  private getFormatMultiplier(format: string): number {
    switch (format) {
      case 'MP4': return 1.0;
      case 'MOV': return 1.2;
      case 'AVI': return 1.5;
      default: return 1.0;
    }
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