import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '../layout/DashboardLayout';
import apiClient from '../../utils/api/client';

interface UploadedFile {
  file: File;
  id: string;
  preview?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

interface VideoUploadProps {
  projectId?: string;
  embedded?: boolean;
  onUploadComplete?: (files: any[]) => void;
}

const VideoUpload: React.FC<VideoUploadProps> = ({ projectId, embedded = false, onUploadComplete }) => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedProject, setSelectedProject] = useState(projectId || '');
  const [projects, setProjects] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Extract projectId from URL query params
  const queryParams = new URLSearchParams(location.search);
  const urlProjectId = queryParams.get('projectId');

  // Load projects for selection and set project from URL or props
  useEffect(() => {
    loadProjects();

    // Set project ID from URL or props
    if (urlProjectId) {
      setSelectedProject(urlProjectId);
    } else if (projectId) {
      setSelectedProject(projectId);
    }
  }, [urlProjectId, projectId]);

  const loadProjects = async () => {
    try {
      const response = await apiClient.getProjects();
      if (response.success) {
        setProjects(response.data);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const validateFile = (file: File): string | null => {
    // Check file type
    const allowedTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'];
    if (!allowedTypes.includes(file.type)) {
      return 'Unsupported file type. Please upload MP4, AVI, MOV, WMV, or WebM files.';
    }

    // Check file size (max 500MB)
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) {
      return 'File size too large. Maximum size is 500MB.';
    }

    return null;
  };

  const generatePreview = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      video.addEventListener('loadedmetadata', () => {
        canvas.width = 160;
        canvas.height = 90;
        video.currentTime = 1; // Seek to 1 second
      });

      video.addEventListener('seeked', () => {
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL());
        }
      });

      video.src = URL.createObjectURL(file);
    });
  };

  const handleFiles = useCallback(async (fileList: FileList) => {
    const newFiles: UploadedFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const validationError = validateFile(file);

      if (validationError) {
        newFiles.push({
          file,
          id: `${Date.now()}-${i}`,
          progress: 0,
          status: 'error',
          error: validationError,
        });
      } else {
        const uploadFile: UploadedFile = {
          file,
          id: `${Date.now()}-${i}`,
          progress: 0,
          status: 'pending',
        };

        // Generate preview
        try {
          uploadFile.preview = await generatePreview(file);
        } catch (error) {
          console.warn('Failed to generate preview for', file.name);
        }

        newFiles.push(uploadFile);
      }
    }

    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    handleFiles(files);
  }, [handleFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const uploadFile = async (uploadFile: UploadedFile): Promise<void> => {
    if (!selectedProject) {
      throw new Error('Please select a project');
    }

    setFiles(prev => prev.map(f =>
      f.id === uploadFile.id ? { ...f, status: 'uploading' as const, progress: 0 } : f
    ));

    try {
      // Create a FormData object for the upload
      const formData = new FormData();
      formData.append('videos', uploadFile.file);
      formData.append('projectId', selectedProject);

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setFiles(prev => prev.map(f =>
              f.id === uploadFile.id ? { ...f, progress } : f
            ));
          }
        });

        xhr.addEventListener('load', () => {
          // Accept any 2xx status code as success
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log(`Upload successful: ${xhr.status}`, xhr.responseText);
            setFiles(prev => prev.map(f =>
              f.id === uploadFile.id ? { ...f, status: 'completed' as const, progress: 100 } : f
            ));
            resolve();
          } else {
            // Parse error response for better error message
            let errorMessage = 'Upload failed';
            try {
              const response = JSON.parse(xhr.responseText);
              errorMessage = response.error || response.message || errorMessage;
            } catch (e) {
              // If response is not JSON, use status text
              errorMessage = `Upload failed: ${xhr.statusText || xhr.status}`;
            }
            console.error(`Upload error: ${xhr.status}`, xhr.responseText);
            reject(new Error(errorMessage));
          }
        });

        xhr.addEventListener('error', () => {
          console.error('Network error during upload');
          reject(new Error('Network error: Unable to connect to server'));
        });

        // Use relative URL in production, localhost in development
        const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ||
          (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3002/api');
        xhr.open('POST', `${API_BASE_URL}/v1/videos/upload`);

        // Add auth header
        const token = localStorage.getItem('authToken');
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.send(formData);
      });
    } catch (error) {
      console.error('Upload error for file:', uploadFile.file.name, error);
      setFiles(prev => prev.map(f =>
        f.id === uploadFile.id ? {
          ...f,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Upload failed'
        } : f
      ));
      throw error;
    }
  };

  const uploadAll = async () => {
    if (!selectedProject) {
      alert('Please select a project first');
      return;
    }

    setIsUploading(true);
    const pendingFiles = files.filter(f => f.status === 'pending');

    try {
      // Upload files sequentially to avoid overwhelming the server
      for (const file of pendingFiles) {
        await uploadFile(file);
      }

      if (onUploadComplete) {
        const completedFiles = files.filter(f => f.status === 'completed');
        onUploadComplete(completedFiles);
      }

      // Navigate back to project if not embedded
      if (!embedded && selectedProject) {
        setTimeout(() => {
          navigate(`/projects/${selectedProject}`);
        }, 1500);
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // For embedded mode, don't wrap with DashboardLayout
  const content = (
    <div className={embedded ? "" : "p-6"}>
      {!embedded && (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Upload Videos</h1>
              <p className="text-gray-600">
                Upload videos to your projects for mixing and processing.
              </p>
            </div>
            {selectedProject && (
              <button
                onClick={() => navigate(`/projects/${selectedProject}`)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Project
              </button>
            )}
          </div>
        </div>
      )}

        {/* Project Selection - Only show if not embedded and no projectId */}
        {!embedded && !projectId && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Select Project</h3>
          <div className="flex items-center space-x-4">
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="flex-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Choose a project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => navigate('/projects/new')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              New Project
            </button>
          </div>
        </div>
        )}

        {/* Upload Area */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="mt-4">
              <p className="text-xl text-gray-600">
                Drag and drop your videos here, or{' '}
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-500 font-medium"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse files
                </button>
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Supports MP4, AVI, MOV, WMV, WebM up to 500MB each
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Minimum Videos Warning */}
        {files.length === 1 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Minimum 2 videos required for mixing
                </h3>
                <p className="mt-1 text-sm text-yellow-700">
                  Video mixing requires at least 2 videos to create variations. Please upload one more video.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Files ({files.length})
              </h3>
              <div className="flex space-x-2">
                <button
                  onClick={() => setFiles([])}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Clear All
                </button>
                <button
                  onClick={uploadAll}
                  disabled={isUploading || !selectedProject || files.filter(f => f.status === 'pending').length === 0}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? 'Uploading...' : 'Upload All'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center p-4 border border-gray-200 rounded-lg"
                >
                  {/* Preview */}
                  <div className="flex-shrink-0 mr-4">
                    {file.preview ? (
                      <img
                        src={file.preview}
                        alt={file.file.name}
                        className="w-20 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-20 h-12 bg-gray-200 rounded flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.file.name}
                      </p>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatFileSize(file.file.size)}
                    </p>

                    {/* Progress Bar */}
                    {file.status === 'uploading' && (
                      <div className="mt-2">
                        <div className="bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{file.progress}%</p>
                      </div>
                    )}

                    {/* Status */}
                    <div className="mt-2">
                      {file.status === 'pending' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Ready to upload
                        </span>
                      )}
                      {file.status === 'uploading' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Uploading...
                        </span>
                      )}
                      {file.status === 'completed' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ Uploaded
                        </span>
                      )}
                      {file.status === 'error' && (
                        <div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            ✗ Error
                          </span>
                          {file.error && (
                            <p className="text-xs text-red-600 mt-1">{file.error}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );

  return embedded ? content : <DashboardLayout>{content}</DashboardLayout>;
};

export default VideoUpload;