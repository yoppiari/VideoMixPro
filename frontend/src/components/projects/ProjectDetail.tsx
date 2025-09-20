import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../layout/DashboardLayout';
import VideoGallery from '../videos/VideoGallery';
import VideoUpload from '../videos/VideoUpload';
import JobMonitor from '../processing/JobMonitor';
import ProcessingSettings, { MixingSettings } from '../processing/ProcessingSettings';
import { VideoGroupManager } from '../groups/VideoGroupManager';
import apiClient from '../../utils/api/client';
import ErrorBoundary from '../common/ErrorBoundary';

interface Video {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  duration: number;
  format: string;
  thumbnailUrl?: string;
  groupId?: string;
  metadata: {
    static: Record<string, string>;
    dynamic: Record<string, any>;
  };
  status: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
  createdAt: string;
}

interface Group {
  id: string;
  name: string;
  order: number;
  videos: Video[];
}

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  settings: {
    mixingMode: string;
    outputFormat: string;
    quality: string;
    outputCount: number;
    metadata: {
      static: Record<string, string>;
      includeDynamic: boolean;
      fields: string[];
    };
    groups: Group[];
  };
  videoCount: number;
  createdAt: string;
  updatedAt: string;
}

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'videos' | 'upload' | 'groups' | 'processing' | 'settings'>('overview');
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [mixingSettings, setMixingSettings] = useState<MixingSettings | null>(null);

  // Load project details
  const loadProject = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      const [projectResponse, videosResponse] = await Promise.all([
        apiClient.getProject(id),
        apiClient.getProjectVideos(id)
      ]);

      if (projectResponse.success) {
        setProject(projectResponse.data);
      } else {
        // Don't show error if project is being processed
        if (!projectResponse.error?.includes('processing')) {
          setError(projectResponse.error || 'Failed to load project');
        }
      }

      if (videosResponse.success) {
        setVideos(videosResponse.data || []);
      }
    } catch (error) {
      console.error('Error loading project:', error);
      // Don't show generic error, try to handle specific cases
      if ((error as any)?.response?.status !== 404) {
        // Only show error for non-404 errors
        console.log('Project might be processing, will retry...');
        // Retry after a delay if project is processing
        setTimeout(() => loadProject(), 2000);
      } else {
        setError('Project not found');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUploadComplete = (uploadedFiles: any[]) => {
    // Reload videos after successful upload
    loadProject();
    // Switch to videos tab to show newly uploaded videos
    setActiveTab('videos');
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  // Utility functions
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Video selection handlers
  const handleVideoSelect = (videoId: string) => {
    const newSelection = new Set(selectedVideos);
    if (newSelection.has(videoId)) {
      newSelection.delete(videoId);
    } else {
      newSelection.add(videoId);
    }
    setSelectedVideos(newSelection);
  };

  const selectAllVideos = () => {
    setSelectedVideos(new Set(videos.map(v => v.id)));
  };

  const clearSelection = () => {
    setSelectedVideos(new Set());
  };

  // Project actions
  const handleEditProject = () => {
    navigate(`/projects/${id}/edit`);
  };

  const handleDeleteProject = async () => {
    if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await apiClient.deleteProject(id!);
      if (response.success) {
        navigate('/projects');
      } else {
        alert(response.error || 'Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('An error occurred while deleting the project');
    }
  };

  const handleStartProcessing = async () => {
    if (!mixingSettings) {
      alert('Please configure processing settings first');
      return;
    }

    if (videos.length < 2) {
      alert('Minimum 2 videos required for mixing');
      return;
    }

    try {
      const response = await apiClient.startProcessing(id!, mixingSettings);
      if (response.success) {
        // Import dynamically to avoid circular dependency
        const { showProcessingStarted } = await import('../../services/notifications');
        showProcessingStarted(
          response.data.estimatedOutputs || mixingSettings.outputCount,
          response.data.creditsDeducted || 0
        );
        loadProject(); // Reload to update status
        setActiveTab('processing'); // Switch to processing tab to show job status
      } else {
        // Handle specific error cases
        if (response.error?.includes('Insufficient credits')) {
          const { showCreditWarning } = await import('../../services/notifications');
          // Extract credit info from error message if available
          const match = response.error.match(/Required: (\d+), Available: (\d+)/);
          if (match) {
            showCreditWarning(parseInt(match[1]), parseInt(match[2]));
          } else {
            alert(response.error);
          }
        } else {
          alert(response.error || 'Failed to start processing');
        }
      }
    } catch (error: any) {
      console.error('Error starting processing:', error);

      // Handle 402 status code (insufficient credits)
      if (error.response?.status === 402) {
        const { showCreditWarning } = await import('../../services/notifications');
        const errorMessage = error.response?.data?.message || '';
        const match = errorMessage.match(/Required: (\d+), Available: (\d+)/);
        if (match) {
          showCreditWarning(parseInt(match[1]), parseInt(match[2]));
        } else {
          showCreditWarning(0, 0); // Fallback
        }
      } else {
        const { showProcessingError } = await import('../../services/notifications');
        showProcessingError(error.response?.data?.message || 'An error occurred while starting processing');
      }
    }
  };

  // Video actions
  const handleDeleteVideo = async (videoId: string) => {
    if (!window.confirm('Are you sure you want to delete this video?')) {
      return;
    }

    try {
      const response = await apiClient.deleteVideo(videoId);
      if (response.success) {
        setVideos(videos.filter(v => v.id !== videoId));
        setSelectedVideos(prev => {
          const newSelection = new Set(prev);
          newSelection.delete(videoId);
          return newSelection;
        });
      } else {
        alert(response.error || 'Failed to delete video');
      }
    } catch (error) {
      console.error('Error deleting video:', error);
      alert('An error occurred while deleting the video');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedVideos.size === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${selectedVideos.size} selected videos?`)) {
      return;
    }

    try {
      const deletePromises = Array.from(selectedVideos).map(videoId =>
        apiClient.deleteVideo(videoId)
      );

      await Promise.all(deletePromises);

      setVideos(videos.filter(v => !selectedVideos.has(v.id)));
      setSelectedVideos(new Set());
    } catch (error) {
      console.error('Error deleting videos:', error);
      alert('An error occurred while deleting videos');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !project) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error || 'Project not found'}
            <button
              onClick={() => navigate('/projects')}
              className="ml-4 text-red-600 underline hover:text-red-800"
            >
              Back to Projects
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/projects')}
                className="text-gray-600 hover:text-gray-800"
              >
                ← Back to Projects
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                {project.description && (
                  <p className="text-gray-600">{project.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusBadgeClass(project.status)}`}>
                {project.status}
              </span>
              <button
                onClick={handleEditProject}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={handleStartProcessing}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                Start Processing
              </button>
              <button
                onClick={handleDeleteProject}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'videos', label: `Videos (${videos.length})` },
              { key: 'upload', label: 'Upload' },
              { key: 'groups', label: 'Groups' },
              { key: 'processing', label: 'Processing' },
              { key: 'settings', label: 'Settings' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Project Stats */}
            <div className="lg:col-span-2">
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Project Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{videos.length}</div>
                    <div className="text-sm text-gray-500">Total Videos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {videos.filter(v => v.status === 'READY').length}
                    </div>
                    <div className="text-sm text-gray-500">Ready</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {videos.filter(v => v.status === 'PROCESSING').length}
                    </div>
                    <div className="text-sm text-gray-500">Processing</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {project.settings.groups?.length || 0}
                    </div>
                    <div className="text-sm text-gray-500">Groups</div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white shadow rounded-lg p-6 mt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {videos.slice(0, 5).map((video) => (
                    <div key={video.id} className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {video.originalName}
                        </p>
                        <p className="text-sm text-gray-500">
                          Uploaded {formatDate(video.createdAt)}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          video.status === 'READY' ? 'bg-green-100 text-green-800' :
                          video.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {video.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {videos.length > 5 && (
                  <div className="mt-4">
                    <button
                      onClick={() => setActiveTab('videos')}
                      className="text-blue-600 hover:text-blue-500 text-sm font-medium"
                    >
                      View all videos →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Project Info */}
            <div className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Project Information</h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Created</dt>
                    <dd className="text-sm text-gray-900">{formatDate(project.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                    <dd className="text-sm text-gray-900">{formatDate(project.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Status</dt>
                    <dd className="text-sm text-gray-900 capitalize">{project.status.toLowerCase()}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Total Videos</dt>
                    <dd className="text-sm text-gray-900">{videos.length}</dd>
                  </div>
                </dl>
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Upload Videos
                  </button>
                  <button
                    onClick={() => setActiveTab('groups')}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Manage Groups
                  </button>
                  <button
                    onClick={() => navigate(`/processing?projectId=${project.id}`)}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    View Processing
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'videos' && (
          <div>
            {/* Video Management Toolbar */}
            <div className="bg-white shadow rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-700">
                    {selectedVideos.size > 0
                      ? `${selectedVideos.size} video(s) selected`
                      : `${videos.length} video(s) total`
                    }
                  </span>
                  {videos.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={selectAllVideos}
                        className="text-sm text-blue-600 hover:text-blue-500"
                      >
                        Select All
                      </button>
                      <button
                        onClick={clearSelection}
                        className="text-sm text-gray-600 hover:text-gray-500"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-3">
                  {selectedVideos.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                    >
                      Delete Selected
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Upload Videos
                  </button>
                </div>
              </div>
            </div>

            {/* Video Grid */}
            {videos.length === 0 ? (
              <div className="bg-white shadow rounded-lg p-12 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No videos yet</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by uploading your first video.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Upload Videos
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className={`bg-white shadow rounded-lg overflow-hidden transition-all ${
                      selectedVideos.has(video.id) ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <div className="relative">
                      {/* Video thumbnail */}
                      <div className="aspect-w-16 aspect-h-9 bg-gray-200">
                        {video.thumbnailUrl ? (
                          <img
                            src={video.thumbnailUrl}
                            alt={video.originalName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <svg className="w-12 h-12 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Selection checkbox */}
                      <div className="absolute top-2 left-2">
                        <input
                          type="checkbox"
                          checked={selectedVideos.has(video.id)}
                          onChange={() => handleVideoSelect(video.id)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                      </div>

                      {/* Status badge */}
                      <div className="absolute top-2 right-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          video.status === 'READY' ? 'bg-green-100 text-green-800' :
                          video.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                          video.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {video.status}
                        </span>
                      </div>

                      {/* Duration */}
                      {video.duration > 0 && (
                        <div className="absolute bottom-2 right-2">
                          <span className="bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                            {formatDuration(video.duration)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <h4 className="text-sm font-medium text-gray-900 truncate" title={video.originalName}>
                        {video.originalName}
                      </h4>
                      <div className="mt-2 text-xs text-gray-500 space-y-1">
                        <div>{formatFileSize(video.size)}</div>
                        <div>{video.format.toUpperCase()}</div>
                        <div>{formatDate(video.createdAt)}</div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <button
                          onClick={() => {/* TODO: Open video preview */}}
                          className="text-blue-600 hover:text-blue-500 text-sm"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => handleDeleteVideo(video.id)}
                          className="text-red-600 hover:text-red-500 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Videos to Project</h2>
            <VideoUpload
              projectId={id!}
              embedded={true}
              onUploadComplete={handleUploadComplete}
            />
          </div>
        )}

        {activeTab === 'groups' && (
          <div className="bg-white shadow rounded-lg p-6">
            <VideoGroupManager
              projectId={id!}
              videos={videos}
              onUpdate={loadProject}
            />
          </div>
        )}

        {activeTab === 'processing' && (
          <div>
            {/* Processing Settings with Error Boundary */}
            <ErrorBoundary
              name="ProcessingSettings"
              resetKeys={[project.id]}
              resetOnPropsChange={true}
              fallback={
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h3 className="text-yellow-800 font-medium">Error Loading Processing Settings</h3>
                  <p className="text-yellow-600 text-sm mt-2">
                    There was an error loading the processing settings. Please refresh the page or try again later.
                  </p>
                </div>
              }
              onError={(error, errorInfo) => {
                console.error('[ProjectDetail] Processing Error:', error);
                console.error('[ProjectDetail] Error Info:', errorInfo);
              }}
            >
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-3 text-gray-600">Loading processing settings...</span>
                </div>
              }>
                <ProcessingSettings
                  key={`processing-${project.id}-${activeTab}`}
                  videoCount={videos.length}
                  onSettingsChange={setMixingSettings}
                  onStartProcessing={handleStartProcessing}
                />
              </Suspense>
            </ErrorBoundary>

            {/* Job Monitor with Error Boundary */}
            {(project.status === 'PROCESSING' || project.status === 'COMPLETED') && (
              <div className="mt-6">
                <ErrorBoundary
                  name="JobMonitor"
                  resetKeys={[project.id]}
                  fallback={
                    <div className="p-4 bg-gray-100 rounded-lg">
                      <p className="text-gray-600">Unable to load job status</p>
                    </div>
                  }
                >
                  <JobMonitor
                    projectId={project.id}
                    refreshInterval={project.status === 'PROCESSING' ? 2000 : 10000}
                  />
                </ErrorBoundary>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Metadata Settings</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Include Dynamic Metadata</h4>
                  <p className="text-sm text-gray-900">
                    {project.settings.metadata.includeDynamic ? 'Yes' : 'No'}
                  </p>
                </div>

                {Object.keys(project.settings.metadata.static).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Static Metadata</h4>
                    <div className="space-y-2">
                      {Object.entries(project.settings.metadata.static).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-gray-600">{key}:</span>
                          <span className="text-gray-900">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {project.settings.metadata.fields.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Dynamic Fields</h4>
                    <div className="flex flex-wrap gap-2">
                      {project.settings.metadata.fields.map((field, index) => (
                        <span
                          key={index}
                          className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ProjectDetail;