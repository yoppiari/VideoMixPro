import { Response } from 'express';
import { prisma, database } from '@/utils/database';
import { AuthenticatedRequest } from '@/middleware/auth.middleware';
import { ResponseHelper, createPagination } from '@/utils/response';
import { ProjectStatus } from '@/types';
import logger from '@/utils/logger';

export class ProjectController {
  async getProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      logger.info('[getProjects] Starting...');

      const userId = req.user?.userId;
      logger.info('[getProjects] userId:', userId);

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const { page = '1', limit = '10' } = req.query as any;
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      logger.info('[getProjects] About to query database...');

      // Simplified query to isolate issue
      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limitNum
        }),
        prisma.project.count({ where: { userId } })
      ]);

      logger.info('[getProjects] Query successful, projects:', projects.length, 'total:', total);

      const pagination = createPagination(pageNum, limitNum, total);

      // Parse settings for each project and add counts
      const projectsWithParsedSettings = projects.map(project => ({
        ...project,
        videoCount: 0,
        groupCount: 0
      }));

      ResponseHelper.success(res, projectsWithParsedSettings, 'Projects retrieved successfully', 200, pagination);
    } catch (error) {
      logger.error('Get projects error:', error);
      logger.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
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
          videos: {
            include: {
              group: {
                select: { id: true, name: true }
              }
            }
          },
          groups: {
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

      // Send response (settings field doesn't exist in schema)
      ResponseHelper.success(res, project);
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
          userId
          // settings and status fields don't exist in Project schema
        },
        include: {
          groups: true
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

      // Send response (settings field doesn't exist in schema)
      ResponseHelper.success(res, project, 'Project created successfully', 201);
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

      // Project status check disabled - status field doesn't exist in schema
      // if (existingProject.status === ProjectStatus.PROCESSING) {
      //   ResponseHelper.error(res, 'Cannot update project while processing', 409);
      //   return;
      // }

      const { name, description, settings } = req.body;

      const project = await prisma.project.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description })
          // settings field doesn't exist in Project schema
        },
        include: {
          videos: true,
          groups: true
        }
      });

      // Send response (settings field doesn't exist in schema)
      ResponseHelper.success(res, project, 'Project updated successfully');
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
      const videoCount = await prisma.video.count({
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