import { Response } from 'express';
import { prisma } from '@/utils/database';
import { AuthenticatedRequest } from '@/middleware/auth.middleware';
import { ResponseHelper } from '@/utils/response';
import { VideoService } from '@/services/video.service';
import logger from '@/utils/logger';
import path from 'path';
import fs from 'fs/promises';
const videoService = new VideoService();

export class VideoController {
  async uploadVideos(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { projectId, groupId } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        ResponseHelper.error(res, 'No files uploaded');
        return;
      }

      // Verify project ownership
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId }
      });

      if (!project) {
        ResponseHelper.notFound(res, 'Project not found');
        return;
      }

      // Verify group if provided
      if (groupId) {
        const group = await prisma.videoGroup.findFirst({
          where: { id: groupId, projectId }
        });

        if (!group) {
          ResponseHelper.notFound(res, 'Group not found');
          return;
        }
      }

      const uploadedVideos = [];
      const errors = [];

      for (const file of files) {
        try {
          const metadata = await videoService.extractMetadata(file.path);

          const videoFile = await prisma.videoFile.create({
            data: {
              originalName: file.originalname,
              filename: file.filename,
              path: file.path,
              size: file.size,
              duration: metadata.duration,
              format: metadata.format,
              resolution: metadata.resolution,
              projectId,
              groupId: groupId || null
            }
          });

          uploadedVideos.push(videoFile);
        } catch (error) {
          logger.error(`Failed to process file ${file.filename}:`, error);
          errors.push({
            filename: file.filename,
            error: 'Failed to process video file'
          });

          // Clean up failed file
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            logger.error(`Failed to clean up file ${file.path}:`, unlinkError);
          }
        }
      }

      const response = {
        uploaded: uploadedVideos,
        errors: errors.length > 0 ? errors : undefined
      };

      ResponseHelper.success(res, response, 'Video upload completed', 201);
    } catch (error) {
      logger.error('Upload videos error:', error);
      ResponseHelper.serverError(res, 'Failed to upload videos');
    }
  }

  async getProjectVideos(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { projectId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const project = await prisma.project.findFirst({
        where: { id: projectId, userId }
      });

      if (!project) {
        ResponseHelper.notFound(res, 'Project not found');
        return;
      }

      const videos = await prisma.videoFile.findMany({
        where: { projectId },
        include: {
          group: {
            select: { id: true, name: true, order: true }
          }
        },
        orderBy: [
          { group: { order: 'asc' } },
          { uploadedAt: 'asc' }
        ]
      });

      ResponseHelper.success(res, videos);
    } catch (error) {
      logger.error('Get project videos error:', error);
      ResponseHelper.serverError(res, 'Failed to get project videos');
    }
  }

  async deleteVideo(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const video = await prisma.videoFile.findFirst({
        where: {
          id,
          project: { userId }
        },
        include: {
          project: {
            select: { status: true }
          }
        }
      });

      if (!video) {
        ResponseHelper.notFound(res, 'Video not found');
        return;
      }

      if (video.project.status === 'PROCESSING') {
        ResponseHelper.error(res, 'Cannot delete video while project is processing', 409);
        return;
      }

      // Delete file from storage
      try {
        await fs.unlink(video.path);
      } catch (error) {
        logger.warn(`Failed to delete file ${video.path}:`, error);
      }

      // Delete from database
      await prisma.videoFile.delete({
        where: { id }
      });

      ResponseHelper.success(res, null, 'Video deleted successfully');
    } catch (error) {
      logger.error('Delete video error:', error);
      ResponseHelper.serverError(res, 'Failed to delete video');
    }
  }

  async getVideoMetadata(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const video = await prisma.videoFile.findFirst({
        where: {
          id,
          project: { userId }
        }
      });

      if (!video) {
        ResponseHelper.notFound(res, 'Video not found');
        return;
      }

      try {
        const metadata = await videoService.extractDetailedMetadata(video.path);
        ResponseHelper.success(res, metadata);
      } catch (error) {
        logger.error('Extract metadata error:', error);
        ResponseHelper.serverError(res, 'Failed to extract metadata');
      }
    } catch (error) {
      logger.error('Get video metadata error:', error);
      ResponseHelper.serverError(res, 'Failed to get video metadata');
    }
  }

  async assignVideoToGroup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { videoId } = req.params;
      const { groupId } = req.body;

      // Verify video ownership
      const video = await prisma.videoFile.findFirst({
        where: {
          id: videoId,
          project: { userId }
        },
        include: {
          project: true
        }
      });

      if (!video) {
        ResponseHelper.notFound(res, 'Video not found');
        return;
      }

      // If groupId is provided, verify group exists in same project
      if (groupId) {
        const group = await prisma.videoGroup.findFirst({
          where: {
            id: groupId,
            projectId: video.projectId
          }
        });

        if (!group) {
          ResponseHelper.notFound(res, 'Group not found in this project');
          return;
        }
      }

      // Update video's group assignment
      const updatedVideo = await prisma.videoFile.update({
        where: { id: videoId },
        data: { groupId: groupId || null },
        include: {
          group: true
        }
      });

      ResponseHelper.success(res, updatedVideo, 'Video group assignment updated');
    } catch (error) {
      logger.error('Assign video to group error:', error);
      ResponseHelper.serverError(res, 'Failed to assign video to group');
    }
  }

  async bulkAssignVideosToGroup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { videoIds, groupId } = req.body;

      if (!Array.isArray(videoIds) || videoIds.length === 0) {
        ResponseHelper.error(res, 'Video IDs must be provided as an array');
        return;
      }

      // Verify all videos belong to user
      const videos = await prisma.videoFile.findMany({
        where: {
          id: { in: videoIds },
          project: { userId }
        }
      });

      if (videos.length !== videoIds.length) {
        ResponseHelper.error(res, 'Some videos not found or not authorized');
        return;
      }

      // Get project ID from first video
      const projectId = videos[0].projectId;

      // Verify all videos are from same project
      const sameProject = videos.every(v => v.projectId === projectId);
      if (!sameProject) {
        ResponseHelper.error(res, 'All videos must be from the same project');
        return;
      }

      // If groupId is provided, verify group exists
      if (groupId) {
        const group = await prisma.videoGroup.findFirst({
          where: {
            id: groupId,
            projectId
          }
        });

        if (!group) {
          ResponseHelper.notFound(res, 'Group not found in this project');
          return;
        }
      }

      // Bulk update videos
      const result = await prisma.videoFile.updateMany({
        where: { id: { in: videoIds } },
        data: { groupId: groupId || null }
      });

      ResponseHelper.success(res, {
        updated: result.count,
        groupId: groupId || null
      }, `${result.count} videos updated`);
    } catch (error) {
      logger.error('Bulk assign videos error:', error);
      ResponseHelper.serverError(res, 'Failed to bulk assign videos to group');
    }
  }
}