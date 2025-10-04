import { Response } from 'express';
import { prisma } from '@/utils/database';
import { AuthenticatedRequest } from '@/middleware/auth.middleware';
import { ResponseHelper } from '@/utils/response';
import logger from '@/utils/logger';

export class GroupController {
  async createGroup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { projectId, name, order } = req.body;

      if (!projectId || !name) {
        ResponseHelper.error(res, 'Project ID and name are required');
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

      // Get the next order if not provided
      let groupOrder = order;
      if (groupOrder === undefined || groupOrder === null) {
        const lastGroup = await prisma.videoGroup.findFirst({
          where: { projectId },
          orderBy: { order: 'desc' }
        });
        groupOrder = lastGroup ? lastGroup.order + 1 : 1;
      }

      // Create the group
      const group = await prisma.videoGroup.create({
        data: {
          name,
          order: groupOrder,
          projectId
        }
      });

      ResponseHelper.success(res, group, 'Group created successfully', 201);
    } catch (error) {
      logger.error('Create group error:', error);
      ResponseHelper.serverError(res, 'Failed to create group');
    }
  }

  async updateGroup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { groupId } = req.params;
      const { name, order } = req.body;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      // Verify group ownership
      const group = await prisma.videoGroup.findFirst({
        where: {
          id: groupId,
          project: { userId }
        }
      });

      if (!group) {
        ResponseHelper.notFound(res, 'Group not found');
        return;
      }

      // Update the group
      const updatedGroup = await prisma.videoGroup.update({
        where: { id: groupId },
        data: {
          ...(name && { name }),
          ...(order !== undefined && { order })
        }
      });

      ResponseHelper.success(res, updatedGroup, 'Group updated successfully');
    } catch (error) {
      logger.error('Update group error:', error);
      ResponseHelper.serverError(res, 'Failed to update group');
    }
  }

  async deleteGroup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { groupId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      // Verify group ownership
      const group = await prisma.videoGroup.findFirst({
        where: {
          id: groupId,
          project: { userId }
        }
        // DISABLED: include videoFiles - VideoFile model not in schema
        // include: {
        //   videoFiles: true
        // }
      });

      if (!group) {
        ResponseHelper.notFound(res, 'Group not found');
        return;
      }

      // DISABLED: Unassign all videos from this group - VideoFile model not in schema
      // if (group.videoFiles.length > 0) {
      //   await prisma.videoFile.updateMany({
      //     where: { groupId },
      //     data: { groupId: null }
      //   });
      // }

      // Delete the group
      await prisma.videoGroup.delete({
        where: { id: groupId }
      });

      ResponseHelper.success(res, null, 'Group deleted successfully');
    } catch (error) {
      logger.error('Delete group error:', error);
      ResponseHelper.serverError(res, 'Failed to delete group');
    }
  }

  async getProjectGroups(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { projectId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
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

      // Get all groups with their videos
      const groups = await prisma.videoGroup.findMany({
        where: { projectId },
        // DISABLED: include videoFiles - VideoFile model not in schema
        // include: {
        //   videoFiles: {
        //     select: {
        //       id: true,
        //       originalName: true,
        //       duration: true,
        //       size: true,
        //       uploadedAt: true
        //     }
        //   }
        // },
        orderBy: { order: 'asc' }
      });

      ResponseHelper.success(res, groups);
    } catch (error) {
      logger.error('Get project groups error:', error);
      ResponseHelper.serverError(res, 'Failed to get project groups');
    }
  }

  async reorderGroups(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { projectId } = req.params;
      const { groups } = req.body; // Array of { id: string, order: number }

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
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

      // Update all groups in a transaction
      await prisma.$transaction(
        groups.map((group: { id: string; order: number }) =>
          prisma.videoGroup.update({
            where: { id: group.id },
            data: { order: group.order }
          })
        )
      );

      ResponseHelper.success(res, null, 'Groups reordered successfully');
    } catch (error) {
      logger.error('Reorder groups error:', error);
      ResponseHelper.serverError(res, 'Failed to reorder groups');
    }
  }
}