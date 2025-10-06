import api from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface Video {
  id: string;
  filename: string;
  originalName: string;  // Changed from originalname
  mimeType: string;      // Changed from mimetype
  size: number | string; // Can be string due to BigInt serialization
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  codec?: string;
  hasAudio?: boolean;
  thumbnailUrl?: string | null;
  projectId: string;
  groupId?: string | null;
  uploadedAt: string;    // Changed from createdAt
  status?: 'READY' | 'PROCESSING' | 'FAILED'; // Optional field from API
  group?: {
    id: string;
    name: string;
    order: number;
  } | null;
  metadata?: {
    static: Record<string, any>;
    dynamic?: Record<string, any>;
  };
}

export interface VideoUploadResponse {
  success: boolean;
  message: string;
  video: Video;
}

export interface VideoListResponse {
  success: boolean;
  videos: Video[];
  total: number;
}

export const videoService = {
  // Upload a new video
  uploadVideo: async (file: File): Promise<VideoUploadResponse> => {
    const formData = new FormData();
    formData.append('video', file);

    const response = await api.post(API_ENDPOINTS.VIDEOS.UPLOAD, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  // Get list of user's videos
  getVideos: async (): Promise<VideoListResponse> => {
    const response = await api.get(API_ENDPOINTS.VIDEOS.LIST);
    return response.data;
  },

  // Process a video
  processVideo: async (videoId: string, options: any): Promise<any> => {
    const response = await api.post(`${API_ENDPOINTS.VIDEOS.PROCESS}/${videoId}`, options);
    return response.data;
  },

  // Download a processed video
  downloadVideo: async (videoId: string): Promise<Blob> => {
    const response = await api.get(`${API_ENDPOINTS.VIDEOS.DOWNLOAD}/${videoId}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Get video details
  getVideoDetails: async (videoId: string): Promise<Video> => {
    const response = await api.get(`${API_ENDPOINTS.VIDEOS.LIST}/${videoId}`);
    return response.data.video;
  },

  // Delete a video
  deleteVideo: async (videoId: string): Promise<any> => {
    const response = await api.delete(`${API_ENDPOINTS.VIDEOS.LIST}/${videoId}`);
    return response.data;
  },
};

export default videoService;