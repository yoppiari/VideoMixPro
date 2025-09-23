import { Response } from 'express';
import { AuthenticatedRequest } from '@/middleware/auth.middleware';
import { ResponseHelper } from '@/utils/response';
import { voiceOverService } from '@/services/voice-over.service';
import logger from '@/utils/logger';
import multer from 'multer';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max for audio files
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files only
    const allowedMimes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mp4',
      'audio/x-m4a',
      'audio/ogg',
      'audio/webm',
      'application/octet-stream' // Allow for cases where MIME type detection fails
    ];

    // Also check file extension as fallback
    const allowedExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.aac'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

    // Debug logging can be enabled here if needed
    // console.log('File upload attempt:', {
    //   filename: file.originalname,
    //   mimetype: file.mimetype,
    //   extension: fileExtension,
    //   fieldname: file.fieldname
    // });

    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only audio files are allowed. Received: ${file.mimetype}, Extension: ${fileExtension}`));
    }
  }
});

export class VoiceOverController {
  // Middleware for handling file upload
  uploadMiddleware = upload.array('voiceOvers', 10); // Max 10 voice over files

  /**
   * Upload voice over files for a project
   */
  async uploadVoiceOvers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { projectId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!projectId) {
        ResponseHelper.error(res, 'Project ID is required', 400);
        return;
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        ResponseHelper.error(res, 'No files uploaded', 400);
        return;
      }

      // Save all voice over files
      const savedFiles = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const savedFile = await voiceOverService.saveVoiceOverFile(file, projectId, i);
        savedFiles.push(savedFile);
      }

      logger.info(`Uploaded ${savedFiles.length} voice over files for project ${projectId}`);

      ResponseHelper.success(res, {
        files: savedFiles,
        totalDuration: savedFiles.reduce((sum, f) => sum + f.duration, 0)
      }, 'Voice over files uploaded successfully');
    } catch (error) {
      logger.error('Voice over upload error:', error);
      ResponseHelper.serverError(res, 'Failed to upload voice over files');
    }
  }

  /**
   * Get voice over files for a project
   */
  async getProjectVoiceOvers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { projectId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const voiceOvers = await voiceOverService.getProjectVoiceOvers(projectId);

      ResponseHelper.success(res, {
        files: voiceOvers,
        totalDuration: voiceOvers.reduce((sum, f) => sum + f.duration, 0),
        count: voiceOvers.length
      });
    } catch (error) {
      logger.error('Get voice overs error:', error);
      ResponseHelper.serverError(res, 'Failed to get voice over files');
    }
  }

  /**
   * Delete a voice over file
   */
  async deleteVoiceOver(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { voiceOverId } = req.params;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const deleted = await voiceOverService.deleteVoiceOver(voiceOverId);

      if (!deleted) {
        ResponseHelper.notFound(res, 'Voice over file not found');
        return;
      }

      ResponseHelper.success(res, null, 'Voice over file deleted successfully');
    } catch (error) {
      logger.error('Delete voice over error:', error);
      ResponseHelper.serverError(res, 'Failed to delete voice over file');
    }
  }

  /**
   * Update voice over order
   */
  async updateVoiceOverOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { projectId } = req.params;
      const { orders } = req.body; // Array of { id: string, order: number }

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!orders || !Array.isArray(orders)) {
        ResponseHelper.error(res, 'Invalid order data', 400);
        return;
      }

      await voiceOverService.updateVoiceOverOrder(projectId, orders);

      ResponseHelper.success(res, null, 'Voice over order updated successfully');
    } catch (error) {
      logger.error('Update voice over order error:', error);
      ResponseHelper.serverError(res, 'Failed to update voice over order');
    }
  }

  /**
   * Get estimated duration for voice over processing
   */
  async getEstimatedDuration(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { projectId } = req.params;
      const { outputCount } = req.query;

      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }

      const count = parseInt(outputCount as string) || 1;
      const totalDuration = await voiceOverService.estimateTotalDuration(projectId, count);

      ResponseHelper.success(res, {
        totalDuration,
        outputCount: count,
        averageDuration: totalDuration / count
      });
    } catch (error) {
      logger.error('Get estimated duration error:', error);
      ResponseHelper.serverError(res, 'Failed to calculate estimated duration');
    }
  }
}

export const voiceOverController = new VoiceOverController();