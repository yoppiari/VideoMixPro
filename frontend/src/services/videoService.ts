import api from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface Video {
  id: string;
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
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