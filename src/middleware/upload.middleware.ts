import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { validateFileType, validateFileSize, sanitizeFilename } from '@/utils/validation';
import logger from '@/utils/logger';

const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || 'uploads';
    cb(null, uploadPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const timestamp = Date.now();
    const sanitized = sanitizeFilename(file.originalname);
    const filename = `${timestamp}_${sanitized}`;
    cb(null, filename);
  }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  logger.info(`Processing file upload: ${file.originalname}, mimetype: ${file.mimetype}`);

  if (!validateFileType(file.mimetype)) {
    const error = new Error('Invalid file type. Only video files are allowed.');
    (error as any).code = 'INVALID_FILE_TYPE';
    return cb(error as any);
  }

  cb(null, true);
};

const limits = {
  fileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000'), // 500MB default
  files: 50
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits
});