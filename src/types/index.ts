// Define custom types (not importing from Prisma to avoid schema mismatches)
export type LicenseType = 'FREE' | 'PREMIUM' | 'ENTERPRISE';
export type ProjectStatus = 'DRAFT' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type TransactionType = 'PURCHASE' | 'USAGE' | 'REFUND' | 'BONUS';

export const LicenseType = {
  FREE: 'FREE' as LicenseType,
  PREMIUM: 'PREMIUM' as LicenseType,
  ENTERPRISE: 'ENTERPRISE' as LicenseType
};

export const ProjectStatus = {
  DRAFT: 'DRAFT' as ProjectStatus,
  PROCESSING: 'PROCESSING' as ProjectStatus,
  COMPLETED: 'COMPLETED' as ProjectStatus,
  FAILED: 'FAILED' as ProjectStatus
};

export const JobStatus = {
  PENDING: 'PENDING' as JobStatus,
  PROCESSING: 'PROCESSING' as JobStatus,
  COMPLETED: 'COMPLETED' as JobStatus,
  FAILED: 'FAILED' as JobStatus,
  CANCELLED: 'CANCELLED' as JobStatus
};

export const TransactionType = {
  PURCHASE: 'PURCHASE' as TransactionType,
  USAGE: 'USAGE' as TransactionType,
  REFUND: 'REFUND' as TransactionType,
  BONUS: 'BONUS' as TransactionType
};

export interface User {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  credits: number;
  licenseType: LicenseType;
  licenseExpiry: Date;
  createdAt: Date;
  updatedAt: Date;
}

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
  status: JobStatus;
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
  type: TransactionType;
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
  licenseType: LicenseType;
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
  licenseType: LicenseType;
  expiry: Date;
  features: string[];
  maxProjects: number;
  maxCredits: number;
}