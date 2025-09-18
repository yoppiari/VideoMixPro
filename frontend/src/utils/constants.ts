export const API_BASE_URL = 'http://localhost:3000/api';

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
  },
  VIDEOS: {
    UPLOAD: '/videos/upload',
    LIST: '/videos',
    PROCESS: '/videos/process',
    DOWNLOAD: '/videos/download',
  },
  USER: {
    PROFILE: '/user/profile',
    UPDATE: '/user/update',
  },
};

export const FILE_UPLOAD = {
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
  ACCEPTED_FORMATS: [
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/wmv',
    'video/flv',
    'video/webm',
  ],
};

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  PROFILE: '/profile',
  VIDEOS: '/videos',
};