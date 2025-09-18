import {
  LicenseType as PrismaLicenseType,
  ProjectStatus as PrismaProjectStatus,
  JobStatus as PrismaJobStatus,
  TransactionType as PrismaTransactionType
} from '@prisma/client';

export interface User {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  credits: number;
  licenseType: PrismaLicenseType;
  licenseExpiry: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Re-export Prisma enums with different names
export type LicenseType = PrismaLicenseType;
export type ProjectStatus = PrismaProjectStatus;
export type JobStatus = PrismaJobStatus;
export type TransactionType = PrismaTransactionType;

export const LicenseType = {
  FREE: 'FREE' as PrismaLicenseType,
  PREMIUM: 'PREMIUM' as PrismaLicenseType,
  ENTERPRISE: 'ENTERPRISE' as PrismaLicenseType
};

export const ProjectStatus = {
  DRAFT: 'DRAFT' as PrismaProjectStatus,
  PROCESSING: 'PROCESSING' as PrismaProjectStatus,
  COMPLETED: 'COMPLETED' as PrismaProjectStatus,
  FAILED: 'FAILED' as PrismaProjectStatus
};

export const JobStatus = {
  PENDING: 'PENDING' as PrismaJobStatus,
  PROCESSING: 'PROCESSING' as PrismaJobStatus,
  COMPLETED: 'COMPLETED' as PrismaJobStatus,
  FAILED: 'FAILED' as PrismaJobStatus,
  CANCELLED: 'CANCELLED' as PrismaJobStatus
};

export const TransactionType = {
  PURCHASE: 'PURCHASE' as PrismaTransactionType,
  USAGE: 'USAGE' as PrismaTransactionType,
  REFUND: 'REFUND' as PrismaTransactionType
};

// Define missing enums based on schema
export enum MixingMode {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL'
}

export enum VideoFormat {
  MP4 = 'MP4',
  MOV = 'MOV',
  AVI = 'AVI'
}

export enum VideoQuality {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  ULTRA = 'ULTRA'
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  userId: string;
  status: PrismaProjectStatus;
  outputCount: number;
  settings: ProjectSettings;
  createdAt: Date;
  updatedAt: Date;
}


export interface ProjectSettings {
  mixingMode: MixingMode;
  outputFormat: VideoFormat;
  quality: VideoQuality;
  metadata: MetadataSettings;
  groups?: VideoGroup[];
}


export interface MetadataSettings {
  static: Record<string, string>;
  includeDynamic: boolean;
  fields: string[];
}

export interface VideoGroup {
  id: string;
  name: string;
  order: number;
  files: VideoFile[];
}

export interface VideoFile {
  id: string;
  originalName: string;
  filename: string;
  path: string;
  size: number;
  duration: number;
  format: string;
  resolution: string;
  projectId: string;
  groupId?: string;
  uploadedAt: Date;
}

export interface ProcessingJob {
  id: string;
  projectId: string;
  status: PrismaJobStatus;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  outputFiles: OutputFile[];
}


export interface OutputFile {
  id: string;
  jobId: string;
  filename: string;
  path: string;
  size: number;
  duration: number;
  metadata: Record<string, any>;
  sourceFiles: string[];
  createdAt: Date;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: PrismaTransactionType;
  description: string;
  createdAt: Date;
}


export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  licenseType: PrismaLicenseType;
  iat: number;
  exp: number;
}

export interface ProcessingOptions {
  maxOutputCount: number;
  creditsPerVideo: number;
  allowedFormats: VideoFormat[];
  maxFileSize: number;
}

export interface LicenseVerificationRequest {
  userId: string;
  licenseKey: string;
  machineId: string;
  appVersion: string;
}

export interface LicenseVerificationResponse {
  valid: boolean;
  licenseType: PrismaLicenseType;
  expiry: Date;
  features: string[];
  maxProjects: number;
  maxCredits: number;
}