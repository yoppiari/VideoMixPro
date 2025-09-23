import { Response } from 'express';
import { prisma, database } from '@/utils/database';
import { AuthenticatedRequest } from '@/middleware/auth.middleware';
import { ResponseHelper, createPagination } from '@/utils/response';
import { ProjectStatus } from '@/types';
import logger from '@/utils/logger';

export class ProjectController {
  async getProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where: { userId },
          include: {
            videoFiles: {
              select: { id: true, originalName: true, size: true, duration: true }
            },
            videoGroups: {
              select: { id: true, name: true, order: true }
            },
            processingJobs: {
              select: { id: true, status: true, progress: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limitNum
        }),
        prisma.project.count({ where: { userId } })
      ]);

      const pagination = createPagination(pageNum, limitNum, total);

      // Parse settings for each project and add counts
      const projectsWithParsedSettings = projects.map(project => ({
        ...project,
        settings: database.parseJson(project.settings),
        videoCount: project.videoFiles.length,
        groupCount: project.videoGroups.length
      }));

      ResponseHelper.success(res, projectsWithParsedSettings, 'Projects retrieved successfully', 200, pagination);
    } catch (error) {
      logger.error('Get projects error:', error);
      ResponseHelper.serverError(res, 'Failed to get projects');
    }
  }

  async getProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const project = await prisma.project.findFirst({
        where: { id, userId },
        include: {
          videoFiles: {
            include: {
              group: {
                select: { id: true, name: true }
              }
            }
          },
          videoGroups: {
            orderBy: { order: 'asc' }
          },
          processingJobs: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!project) {
        ResponseHelper.notFound(res, 'Project not found');
        return;
      }

      // Parse settings before sending response
      const projectWithParsedSettings = {
        ...project,
        settings: database.parseJson(project.settings)
      };

      ResponseHelper.success(res, projectWithParsedSettings);
    } catch (error) {
      logger.error('Get project error:', error);
      ResponseHelper.serverError(res, 'Failed to get project');
    }
  }

  async createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { name, description, settings } = req.body;

      const project = await prisma.project.create({
        data: {
          name,
          description,
          userId,
          settings: database.stringifyJson(settings),
          status: ProjectStatus.DRAFT
        },
        include: {
          videoGroups: true
        }
      });

      // Create default groups for manual mode
      if (settings.mixingMode === 'MANUAL' && settings.groups) {
        await Promise.all(
          settings.groups.map((group: any) =>
            prisma.videoGroup.create({
              data: {
                name: group.name,
                order: group.order,
                projectId: project.id
              }
            })
          )
        );
      }

      // Parse settings back to object before sending response
      const responseProject = {
        ...project,
        settings: database.parseJson(project.settings)
      };

      ResponseHelper.success(res, responseProject, 'Project created successfully', 201);
    } catch (error) {
      logger.error('Create project error:', error);
      ResponseHelper.serverError(res, 'Failed to create project');
    }
  }

  async updateProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const existingProject = await prisma.project.findFirst({
        where: { id, userId }
      });

      if (!existingProject) {
        ResponseHelper.notFound(res, 'Project not found');
        return;
      }

      if (existingProject.status === ProjectStatus.PROCESSING) {
        ResponseHelper.error(res, 'Cannot update project while processing', 409);
        return;
      }

      const { name, description, settings } = req.body;

      const project = await prisma.project.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(settings && { settings: database.stringifyJson(settings) })
        },
        include: {
          videoFiles: true,
          videoGroups: true
        }
      });

      // Parse settings before sending response
      const projectWithParsedSettings = {
        ...project,
        settings: database.parseJson(project.settings)
      };

      ResponseHelper.success(res, projectWithParsedSettings, 'Project updated successfully');
    } catch (error) {
      logger.error('Update project error:', error);
      ResponseHelper.serverError(res, 'Failed to update project');
    }
  }

  async deleteProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const project = await prisma.project.findFirst({
        where: { id, userId },
        include: {
          processingJobs: {
            where: {
              status: { in: ['PENDING', 'PROCESSING'] }
            }
          }
        }
      });

      if (!project) {
        ResponseHelper.notFound(res, 'Project not found');
        return;
      }

      if (project.processingJobs.length > 0) {
        ResponseHelper.error(res, 'Cannot delete project with active processing jobs', 409);
        return;
      }

      await prisma.project.delete({
        where: { id }
      });

      ResponseHelper.success(res, null, 'Project deleted successfully');
    } catch (error) {
      logger.error('Delete project error:', error);
      ResponseHelper.serverError(res, 'Failed to delete project');
    }
  }

  async createGroup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;
      const { name, order } = req.body;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const project = await prisma.project.findFirst({
        where: { id, userId }
      });

      if (!project) {
        ResponseHelper.notFound(res, 'Project not found');
        return;
      }

      const group = await prisma.videoGroup.create({
        data: {
          name,
          order: order || 0,
          projectId: id
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
      const { id, groupId } = req.params;
      const { name, order } = req.body;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const project = await prisma.project.findFirst({
        where: { id, userId }
      });

      if (!project) {
        ResponseHelper.notFound(res, 'Project not found');
        return;
      }

      const group = await prisma.videoGroup.update({
        where: { id: groupId },
        data: {
          ...(name && { name }),
          ...(order !== undefined && { order })
        }
      });

      ResponseHelper.success(res, group, 'Group updated successfully');
    } catch (error) {
      logger.error('Update group error:', error);
      ResponseHelper.serverError(res, 'Failed to update group');
    }
  }

  async deleteGroup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id, groupId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const project = await prisma.project.findFirst({
        where: { id, userId }
      });

      if (!project) {
        ResponseHelper.notFound(res, 'Project not found');
        return;
      }

      // Check if group has videos
      const videoCount = await prisma.videoFile.count({
        where: { groupId }
      });

      if (videoCount > 0) {
        ResponseHelper.error(res, 'Cannot delete group with videos. Move videos first.', 409);
        return;
      }

      await prisma.videoGroup.delete({
        where: { id: groupId }
      });

      ResponseHelper.success(res, null, 'Group deleted successfully');
    } catch (error) {
      logger.error('Delete group error:', error);
      ResponseHelper.serverError(res, 'Failed to delete group');
    }
  }
}