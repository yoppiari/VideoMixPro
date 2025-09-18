import { z } from 'zod';
import { LicenseType, MixingMode, VideoFormat, VideoQuality } from '@/types';

export const UserRegistrationSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters')
});

export const UserLoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

export const ProjectCreateSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters'),
  description: z.string().optional(),
  settings: z.object({
    mixingMode: z.nativeEnum(MixingMode),
    outputFormat: z.nativeEnum(VideoFormat),
    quality: z.nativeEnum(VideoQuality),
    outputCount: z.number().min(1).max(1000, 'Maximum 1000 outputs allowed'),
    metadata: z.object({
      static: z.record(z.string()).optional(),
      includeDynamic: z.boolean().default(true),
      fields: z.array(z.string()).optional()
    }),
    groups: z.array(z.object({
      name: z.string().min(1, 'Group name is required'),
      order: z.number().min(0)
    })).optional()
  })
});

export const ProjectUpdateSchema = ProjectCreateSchema.partial();

export const VideoUploadSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  groupId: z.string().uuid('Invalid group ID').optional()
});

export const CreditPurchaseSchema = z.object({
  amount: z.number().min(1, 'Amount must be at least 1'),
  paymentMethod: z.string().min(1, 'Payment method is required')
});

export const LicenseVerificationSchema = z.object({
  licenseKey: z.string().min(1, 'License key is required'),
  machineId: z.string().min(1, 'Machine ID is required'),
  appVersion: z.string().min(1, 'App version is required')
});

export const PaginationSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1),
  limit: z.string().transform(val => {
    const num = parseInt(val) || 10;
    return Math.min(num, 100);
  })
});

export const validateFileType = (mimetype: string): boolean => {
  const allowedTypes = [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
  ];
  return allowedTypes.includes(mimetype);
};

export const validateFileSize = (size: number): boolean => {
  const maxSize = parseInt(process.env.MAX_FILE_SIZE || '524288000'); // 500MB default
  return size <= maxSize;
};

export const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};