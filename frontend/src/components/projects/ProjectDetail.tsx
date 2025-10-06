import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../layout/DashboardLayout';
import VideoGallery from '../videos/VideoGallery';
import VideoUpload from '../videos/VideoUpload';
import JobMonitor from '../processing/JobMonitor';
import ProcessingSettings, { MixingSettings } from '../processing/ProcessingSettings';
import VoiceOverUpload from '../processing/VoiceOverUpload';
import VoiceOverMode from '../processing/VoiceOverMode';
import { VideoGroupManager } from '../groups/VideoGroupManager';
import apiClient from '../../utils/api/client';
import ErrorBoundary from '../common/ErrorBoundary';

interface Video {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;  // Changed from format
  size: number | string; // Can be string from BigInt
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
  uploadedAt: string;  // Changed from createdAt
  status?: 'READY' | 'PROCESSING' | 'FAILED';
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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  processingJobs?: Array<{
    id: string;
    status: string;
    progress: number;
    createdAt: string;
  }>;
  videoCount?: number;
  videos?: any[];
  groups?: Group[];
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
  const [voiceOverFiles, setVoiceOverFiles] = useState<any[]>([]);

  // Store previous speedMixing state when entering voice over mode
  const previousSpeedMixingRef = useRef<boolean>(false);

  // Update ref whenever speedMixing changes while voice over is disabled
  // This ensures we always restore to the most recent user preference
  useEffect(() => {
    if (mixingSettings && mixingSettings.audioMode !== 'voiceover') {
      previousSpeedMixingRef.current = mixingSettings.speedMixing || false;
    }
  }, [mixingSettings?.speedMixing, mixingSettings?.audioMode]);

  // Edit form states
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    metadata: {
      static: {} as Record<string, string>,
      includeDynamic: true,
      fields: [] as string[]
    }
  });
  const [staticFields, setStaticFields] = useState<Array<{key: string, value: string}>>([]);
  const [dynamicFields, setDynamicFields] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
        const videosData = videosResponse.data || [];
        console.log('[ProjectDetail] Videos loaded:', videosData.length, 'videos');

        // Ensure videos have status field
        const videosWithStatus = videosData.map((video: any) => ({
          ...video,
          status: video.status || 'READY', // Default to READY if no status
          metadata: video.metadata || { static: {}, dynamic: {} }
        }));

        setVideos(videosWithStatus);
        console.log('[ProjectDetail] Video statuses:', videosWithStatus.map((v: any) => ({
          name: v.originalName,
          status: v.status
        })));
      } else {
        console.warn('[ProjectDetail] Failed to load videos:', videosResponse.error);
        setVideos([]); // Set empty array on error
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

  // Initialize edit form when project loads or when entering edit mode
  useEffect(() => {
    if (project && activeTab === 'settings') {
      setEditFormData({
        name: project.name || '',
        description: project.description || '',
        metadata: {
          static: {},
          includeDynamic: false,
          fields: []
        }
      });

      // Initialize with empty metadata
      setStaticFields([{ key: '', value: '' }]);
      setDynamicFields(['']);
    }
  }, [project, activeTab]);

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

  const formatFileSize = (bytes: number | string): string => {
    const numBytes = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (numBytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return parseFloat((numBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProjectStatus = () => {
    if (!project) return { label: 'Unknown', class: 'bg-gray-100 text-gray-800' };

    // Derive status from processing jobs
    const latestJob = project.processingJobs?.[0];
    if (latestJob) {
      switch (latestJob.status) {
        case 'PROCESSING':
          return { label: 'Processing', class: 'bg-yellow-100 text-yellow-800' };
        case 'COMPLETED':
          return { label: 'Completed', class: 'bg-green-100 text-green-800' };
        case 'FAILED':
          return { label: 'Failed', class: 'bg-red-100 text-red-800' };
        default:
          return { label: 'Pending', class: 'bg-blue-100 text-blue-800' };
      }
    }

    return project.isActive
      ? { label: 'Active', class: 'bg-green-100 text-green-800' }
      : { label: 'Inactive', class: 'bg-gray-100 text-gray-800' };
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

  // Edit form handlers
  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleMetadataCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = e.target;
    setEditFormData(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        includeDynamic: checked
      }
    }));
  };

  // Static metadata handlers
  const addStaticField = () => {
    setStaticFields([...staticFields, { key: '', value: '' }]);
  };

  const removeStaticField = (index: number) => {
    setStaticFields(staticFields.filter((_, i) => i !== index));
  };

  const updateStaticField = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...staticFields];
    updated[index][field] = value;
    setStaticFields(updated);
  };

  // Dynamic metadata handlers
  const addDynamicField = () => {
    setDynamicFields([...dynamicFields, '']);
  };

  const removeDynamicField = (index: number) => {
    setDynamicFields(dynamicFields.filter((_, i) => i !== index));
  };

  const updateDynamicField = (index: number, value: string) => {
    const updated = [...dynamicFields];
    updated[index] = value;
    setDynamicFields(updated);
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Prepare metadata
      const staticMetadata = staticFields
        .filter(field => field.key.trim() && field.value.trim())
        .reduce((acc, field) => ({ ...acc, [field.key]: field.value }), {});

      const dynamicMetadataFields = dynamicFields.filter(field => field.trim());

      // Prepare update data
      const updateData = {
        name: editFormData.name,
        description: editFormData.description
        // Note: Project settings are no longer stored in database
        // Settings are now per-job, not per-project
      };

      const response = await apiClient.updateProject(id!, updateData);

      if (response.success) {
        setSaveSuccess(true);
        setIsEditingSettings(false);
        loadProject(); // Reload project data
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(response.error || 'Failed to save changes');
      }
    } catch (error: any) {
      setSaveError(error.message || 'An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingSettings(false);
    setSaveError(null);
    // Reset form to original data
    if (project) {
      setEditFormData({
        name: project.name || '',
        description: project.description || '',
        metadata: {
          static: {},
          includeDynamic: false,
          fields: []
        }
      });
    }
  };

  // Project actions
  const handleEditProject = () => {
    setActiveTab('settings'); // Navigate to settings tab instead of edit route
    setIsEditingSettings(true);
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
    console.log('[ProjectDetail] Starting processing with settings:', mixingSettings);

    if (!mixingSettings) {
      alert('Please configure processing settings first');
      return;
    }

    // Enhanced settings validation
    const isValidSettings = (settings: any): boolean => {
      if (!settings || typeof settings !== 'object') {
        console.error('[ProjectDetail] Invalid settings object:', settings);
        return false;
      }

      // Check for required boolean fields
      const requiredBooleans = ['orderMixing', 'speedMixing', 'differentStartingVideo', 'groupMixing'];
      for (const field of requiredBooleans) {
        if (typeof settings[field] !== 'boolean') {
          console.error(`[ProjectDetail] Invalid ${field}:`, settings[field]);
          return false;
        }
      }

      // Check output count
      if (!settings.outputCount || settings.outputCount < 1) {
        console.error('[ProjectDetail] Invalid outputCount:', settings.outputCount);
        return false;
      }

      return true;
    };

    if (!isValidSettings(mixingSettings)) {
      alert('Invalid processing settings detected. Please refresh the page and try again.');
      return;
    }

    if (videos.length < 2) {
      alert('Minimum 2 videos required for mixing');
      return;
    }

    // Check for voice over files if voice over mode is enabled
    if (mixingSettings.audioMode === 'voiceover') {
      if (!voiceOverFiles || voiceOverFiles.length === 0) {
        alert('Please upload at least one voice over file to use Voice Over mode');
        return;
      }
      console.log('[ProjectDetail] Voice Over mode active with', voiceOverFiles.length, 'files');
    }

    // Log settings summary for debugging
    console.log('[ProjectDetail] Processing settings summary:', {
      orderMixing: mixingSettings.orderMixing,
      speedMixing: mixingSettings.speedMixing,
      differentStartingVideo: mixingSettings.differentStartingVideo,
      groupMixing: mixingSettings.groupMixing,
      outputCount: mixingSettings.outputCount,
      aspectRatio: mixingSettings.aspectRatio,
      resolution: mixingSettings.resolution
    });

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
              <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getProjectStatus().class}`}>
                {getProjectStatus().label}
              </span>
              <button
                onClick={handleEditProject}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Edit
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
                      {project.groups?.length || 0}
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
                          Uploaded {formatDate(video.uploadedAt)}
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
                    <dd className="text-sm text-gray-900">{getProjectStatus().label}</dd>
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
                      {video.duration && video.duration > 0 && (
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
                        <div>{video.mimeType || 'Unknown format'}</div>
                        <div>{formatDate(video.uploadedAt)}</div>
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

            {/* Voice Over Mode - Separate Card */}
            <VoiceOverMode
              isEnabled={mixingSettings?.audioMode === 'voiceover' || false}
              onToggle={(enabled) => {
                if (enabled) {
                  // Note: previousSpeedMixingRef is auto-updated by useEffect when voice over is disabled
                  setMixingSettings(prev => ({
                    ...prev!,
                    audioMode: 'voiceover',
                    voiceOverMode: true,
                    durationType: 'original',
                    speedMixing: false // Force disable speed mixing in voice over mode
                  }));
                } else {
                  // Restore previous speedMixing state when exiting voice over mode
                  setMixingSettings(prev => ({
                    ...prev!,
                    audioMode: 'keep',
                    voiceOverMode: false,
                    speedMixing: previousSpeedMixingRef.current // Restore from ref
                  }));
                }
              }}
            />

            {/* Voice Over Upload - shown when voice over mode is enabled */}
            {mixingSettings?.audioMode === 'voiceover' && (
              <VoiceOverUpload
                projectId={id!}
                onVoiceOversChange={setVoiceOverFiles}
                isEnabled={mixingSettings.audioMode === 'voiceover'}
              />
            )}

            {/* Job Monitor with Error Boundary */}
            {project.processingJobs && project.processingJobs.length > 0 && (
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
                    refreshInterval={project.processingJobs[0]?.status === 'PROCESSING' ? 15000 : 30000}
                  />
                </ErrorBoundary>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Success Message */}
            {saveSuccess && (
              <div className="bg-green-50 border-l-4 border-green-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-green-700">Project settings saved successfully!</p>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {saveError && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{saveError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Basic Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Project Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={editFormData.name}
                    onChange={handleEditInputChange}
                    disabled={isSaving}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={3}
                    value={editFormData.description}
                    onChange={handleEditInputChange}
                    disabled={isSaving}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                  />
                </div>
              </div>
            </div>

            {/* Metadata Settings */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Metadata Settings</h3>

              {/* Static Metadata */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-md font-medium text-gray-800">Static Metadata</h4>
                  <button
                    type="button"
                    onClick={addStaticField}
                    disabled={isSaving}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    Add Field
                  </button>
                </div>

                {staticFields.map((field, index) => (
                  <div key={index} className="flex items-center space-x-2 mb-2">
                    <input
                      type="text"
                      placeholder="Key"
                      value={field.key}
                      onChange={(e) => updateStaticField(index, 'key', e.target.value)}
                      disabled={isSaving}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      value={field.value}
                      onChange={(e) => updateStaticField(index, 'value', e.target.value)}
                      disabled={isSaving}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => removeStaticField(index)}
                      disabled={isSaving}
                      className="text-red-600 hover:text-red-800 disabled:text-gray-400"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Dynamic Metadata */}
              <div>
                <div className="flex items-center mb-3">
                  <input
                    type="checkbox"
                    id="includeDynamic"
                    checked={editFormData.metadata.includeDynamic}
                    onChange={handleMetadataCheckboxChange}
                    disabled={isSaving}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label htmlFor="includeDynamic" className="ml-2 text-sm font-medium text-gray-700">
                    Include Dynamic Metadata
                  </label>
                </div>

                {editFormData.metadata.includeDynamic && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-800">Dynamic Fields</h4>
                      <button
                        type="button"
                        onClick={addDynamicField}
                        disabled={isSaving}
                        className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:bg-gray-400"
                      >
                        Add Field
                      </button>
                    </div>

                    {dynamicFields.map((field, index) => (
                      <div key={index} className="flex items-center space-x-2 mb-2">
                        <input
                          type="text"
                          placeholder="Field name"
                          value={field}
                          onChange={(e) => updateDynamicField(index, e.target.value)}
                          disabled={isSaving}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                        />
                        <button
                          type="button"
                          onClick={() => removeDynamicField(index)}
                          disabled={isSaving}
                          className="text-red-600 hover:text-red-800 disabled:text-gray-400"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ProjectDetail;