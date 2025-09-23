import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3002/api';
const API_TIMEOUT = parseInt(process.env.REACT_APP_API_TIMEOUT || '10000');

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('authToken');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('authToken');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Helper to unwrap backend response format { success: true, data: {...} }
  private unwrapResponse(response: any) {
    // If response.data has success property, it's wrapped
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
      if (response.data.success) {
        // Always return the data field, even if undefined
        // This prevents returning the wrapper object
        return response.data.data;
      } else {
        // Handle error response
        throw new Error(response.data.error || 'Request failed');
      }
    }
    // Otherwise return as is
    return response.data;
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const response = await this.client.post('/v1/auth/login', { email, password });
    return response.data;
  }

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    const response = await this.client.post('/v1/auth/register', data);
    return response.data;
  }

  async logout() {
    const response = await this.client.post('/v1/auth/logout');
    localStorage.removeItem('authToken');
    return response.data;
  }

  async getProfile() {
    const response = await this.client.get('/v1/auth/profile');
    return response.data;
  }

  // User endpoints
  async getUserStats() {
    const response = await this.client.get('/v1/users/stats');
    return this.unwrapResponse(response);
  }

  // Project endpoints
  async getProjects(page: number = 1, limit: number = 10) {
    const response = await this.client.get('/v1/projects', {
      params: { page: page.toString(), limit: limit.toString() }
    });
    return response.data;
  }

  async getProject(id: string) {
    const response = await this.client.get(`/v1/projects/${id}`);
    return response.data;
  }

  async createProject(data: any) {
    console.log('[API Client] Creating project with data:', data);
    try {
      const response = await this.client.post('/v1/projects', data);
      console.log('[API Client] Project creation response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[API Client] Project creation error:', error);
      console.error('[API Client] Error response:', error.response);
      throw error;
    }
  }

  async updateProject(id: string, data: any) {
    const response = await this.client.put(`/v1/projects/${id}`, data);
    return response.data;
  }

  async deleteProject(id: string) {
    const response = await this.client.delete(`/v1/projects/${id}`);
    return response.data;
  }

  // Video endpoints
  async uploadVideos(projectId: string, files: File[], groupId?: string) {
    const formData = new FormData();
    formData.append('projectId', projectId);
    if (groupId) {
      formData.append('groupId', groupId);
    }
    files.forEach((file) => {
      formData.append('videos', file);
    });

    const response = await this.client.post('/v1/videos/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getProjectVideos(projectId: string) {
    const response = await this.client.get(`/v1/videos/project/${projectId}`);
    return response.data;
  }

  async deleteVideo(id: string) {
    const response = await this.client.delete(`/v1/videos/${id}`);
    return response.data;
  }

  async updateVideoMetadata(id: string, metadata: any) {
    const response = await this.client.put(`/v1/videos/${id}/metadata`, { metadata });
    return response.data;
  }

  async getVideoThumbnail(id: string) {
    const response = await this.client.get(`/v1/videos/${id}/thumbnail`);
    return response.data;
  }

  // Processing endpoints
  async startProcessing(projectId: string, mixingSettings?: any) {
    const response = await this.client.post(`/v1/processing/start/${projectId}`, {
      settings: mixingSettings
    });
    return response.data;
  }

  async getCreditsEstimate(outputCount: number, settings: any) {
    const response = await this.client.post('/v1/processing/credits-estimate', {
      outputCount,
      settings
    });
    return this.unwrapResponse(response);
  }

  async getJobStatus(jobId: string) {
    const response = await this.client.get(`/v1/processing/status/${jobId}`);
    return response.data;
  }

  async getProjectJobs(projectId: string) {
    const response = await this.client.get(`/v1/processing/project/${projectId}/jobs`);
    return this.unwrapResponse(response);
  }

  async getUserJobs(page: number = 1, limit: number = 10) {
    const response = await this.client.get('/v1/processing/jobs', {
      params: { page: page.toString(), limit: limit.toString() }
    });
    return this.unwrapResponse(response);
  }

  async cancelJob(jobId: string) {
    const response = await this.client.post(`/v1/processing/cancel/${jobId}`);
    return response.data;
  }

  async getJobOutputs(jobId: string) {
    const response = await this.client.get(`/v1/processing/outputs/${jobId}`);
    return response.data;
  }

  async downloadOutput(outputId: string) {
    const response = await this.client.get(`/v1/processing/download/${outputId}`, {
      responseType: 'blob'
    });
    return response.data;
  }

  // Video-Group Management
  async assignVideoToGroup(videoId: string, groupId: string | null) {
    const response = await this.client.patch(`/v1/videos/${videoId}/group`, { groupId });
    return response.data;
  }

  async bulkAssignVideosToGroup(videoIds: string[], groupId: string | null) {
    const response = await this.client.patch('/v1/videos/bulk-assign-group', {
      videoIds,
      groupId
    });
    return response.data;
  }

  // Group Management
  async createGroup(projectId: string, name: string, order?: number) {
    const response = await this.client.post('/v1/groups', {
      projectId,
      name,
      order
    });
    return response.data;
  }

  async updateGroup(groupId: string, data: { name?: string; order?: number }) {
    const response = await this.client.patch(`/v1/groups/${groupId}`, data);
    return response.data;
  }

  async deleteGroup(groupId: string) {
    const response = await this.client.delete(`/v1/groups/${groupId}`);
    return response.data;
  }

  async getProjectGroups(projectId: string) {
    const response = await this.client.get(`/v1/groups/project/${projectId}`);
    return response.data;
  }

  // Voice Over endpoints
  async uploadVoiceOvers(projectId: string, files: File[]) {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('voiceOvers', file);
    });

    const response = await this.client.post(
      `/v1/voiceover/projects/${projectId}/voiceovers`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  }

  async getProjectVoiceOvers(projectId: string) {
    const response = await this.client.get(`/v1/voiceover/projects/${projectId}/voiceovers`);
    return response.data;
  }

  async deleteVoiceOver(voiceOverId: string) {
    const response = await this.client.delete(`/v1/voiceover/voiceovers/${voiceOverId}`);
    return response.data;
  }

  async updateVoiceOverOrder(projectId: string, orders: { id: string; order: number }[]) {
    const response = await this.client.put(
      `/v1/voiceover/projects/${projectId}/voiceovers/order`,
      { orders }
    );
    return response.data;
  }
}

const apiClient = new ApiClient();
export default apiClient;