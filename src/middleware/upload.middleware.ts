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
  logger.info(`Processing file upload: ${file.originalname}, mimetype: ${file.mimetype}, size: ${file.size || 'unknown'}`);

  if (!validateFileType(file.mimetype)) {
    const error = new Error('Invalid file type. Only video files are allowed.');
    (error as any).code = 'INVALID_FILE_TYPE';
    logger.error(`File type rejected: ${file.mimetype}`);
    return cb(error as any);
  }

  logger.info(`File accepted: ${file.originalname}`);
  cb(null, true);
};

const limits = {
  fileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000'), // 500MB per file
  files: 50, // max 50 files
  fields: 100, // max 100 non-file fields
  fieldSize: 10 * 1024 * 1024, // 10MB max field value size
  parts: 150, // max 150 parts (files + fields)
  headerPairs: 2000 // max 2000 header pairs
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits
});