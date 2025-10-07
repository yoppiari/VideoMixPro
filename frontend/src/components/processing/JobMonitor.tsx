import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../utils/api/client';

interface Job {
  id: string;
  projectId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  creditsUsed?: number;
  outputCount?: number;
  refundedAt?: string;
  settings?: any; // Processing settings used for this job
  project: {
    id: string;
    name: string;
  };
  outputs: Array<{
    id: string;
    filename: string;
    size: number;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface JobStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

interface JobMonitorProps {
  projectId?: string;
  refreshInterval?: number;
  showAllJobs?: boolean;
  onStatsUpdate?: (stats: JobStats) => void;
  statusFilter?: 'pending' | 'processing' | 'completed' | 'failed';
}

const JobMonitor: React.FC<JobMonitorProps> = ({
  projectId,
  refreshInterval = 15000,
  showAllJobs = false,
  onStatsUpdate,
  statusFilter
}) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [activeInterval, setActiveInterval] = useState<NodeJS.Timeout | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState<any>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadMode, setDownloadMode] = useState<'single' | 'batch' | 'chunk'>('single');
  const filesPerPage = 20;

  const fetchJobs = useCallback(async () => {
    // Cancel previous request if it exists
    if (abortController) {
      abortController.abort();
    }

    // Create new abort controller for this request
    const newController = new AbortController();
    setAbortController(newController);

    try {
      let response;
      let jobs: Job[] = [];

      if (projectId && !showAllJobs) {
        response = await apiClient.getProjectJobs(projectId);
      } else {
        response = await apiClient.getUserJobs(1, 20);
      }

      // apiClient.unwrapResponse now handles the wrapped format
      if (response) {
        if (Array.isArray(response)) {
          // Direct array response from unwrapped data
          jobs = response;
        } else if (response.jobs && Array.isArray(response.jobs)) {
          // Paginated response
          jobs = response.jobs;
        } else {
          console.warn('Unexpected response format:', response);
          jobs = [];
        }
      }

      // Ensure jobs is always an array
      const validJobs = Array.isArray(jobs) ? jobs : [];
      setJobs(validJobs);

      // Calculate and update stats if callback provided
      if (onStatsUpdate) {
        const stats: JobStats = {
          pending: validJobs.filter(job => job.status === 'PENDING').length,
          processing: validJobs.filter(job => job.status === 'PROCESSING').length,
          completed: validJobs.filter(job => job.status === 'COMPLETED').length,
          failed: validJobs.filter(job => job.status === 'FAILED').length,
          total: validJobs.length
        };
        onStatsUpdate(stats);
      }
    } catch (error: any) {
      // Don't set error state for aborted requests
      if (error?.name === 'AbortError') {
        console.debug('Request was cancelled');
        return;
      }

      // Silently log errors without showing to user
      console.debug('Error fetching jobs (silently ignored):', error);
    } finally {
      setLoading(false);
      // Clear the abort controller once request is complete
      setAbortController(null);
    }
  }, [projectId, showAllJobs, abortController]);

  // Smart polling with visibility API
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    // Clear existing interval
    if (activeInterval) {
      clearInterval(activeInterval);
    }

    // Initial fetch
    fetchJobs();

    // Set up smart polling
    const interval = setInterval(() => {
      // Only poll if page is visible and component is still mounted
      if (isPageVisible) {
        fetchJobs();
      }
    }, refreshInterval);

    setActiveInterval(interval);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [fetchJobs, refreshInterval, isPageVisible]);

  // Cleanup on unmount - cancel any pending requests
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, []);

  const handleCancelJob = async (jobId: string) => {
    if (!window.confirm('Are you sure you want to cancel this job?')) {
      return;
    }

    try {
      await apiClient.cancelJob(jobId);
      fetchJobs();
    } catch (error) {
      console.error('Error cancelling job:', error);
    }
  };

  const handleShowJobDetails = async (job: Job) => {
    try {
      // Fetch detailed job info including settings
      const response = await fetch(`/api/v1/processing/job/${job.id}/details`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // Update the job with full details including settings
          setSelectedJob({ ...job, settings: data.data.settings });
        } else {
          setSelectedJob(job);
        }
      } else {
        setSelectedJob(job);
      }

      // Fetch download info for batch options
      if (job.status === 'COMPLETED' && job.outputs?.length > 0) {
        const infoResponse = await fetch(`/api/v1/processing/job/${job.id}/download-info`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });

        if (infoResponse.ok) {
          const infoData = await infoResponse.json();
          if (infoData.success && infoData.data) {
            setDownloadInfo(infoData.data);
            // Set default download mode based on file count
            if (infoData.data.totalFiles > 100) {
              setDownloadMode('chunk');
            } else if (infoData.data.totalFiles > 20) {
              setDownloadMode('batch');
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching job details:', error);
      setSelectedJob(job);
    }
    setShowDetails(true);
    setCurrentPage(1);
    setSelectedFiles(new Set());
  };

  const handleBatchDownload = async (mode: 'all' | 'selected' = 'all') => {
    if (!selectedJob) return;

    try {
      const response = await fetch(`/api/v1/processing/job/${selectedJob.id}/download-batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mode,
          outputIds: mode === 'selected' ? Array.from(selectedFiles) : undefined
        })
      });

      if (response.ok) {
        // Convert response to blob and download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedJob.project.name}_batch.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading batch:', error);
      alert('Failed to download batch');
    }
  };

  const handleChunkDownload = async (chunkIndex: number) => {
    if (!selectedJob || !downloadInfo) return;

    try {
      const response = await fetch(
        `/api/v1/processing/job/${selectedJob.id}/download-chunk?chunkIndex=${chunkIndex}&chunkSize=${downloadInfo.recommendedChunkSize}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedJob.project.name}_chunk${chunkIndex + 1}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading chunk:', error);
      alert('Failed to download chunk');
    }
  };

  const handleDownloadOutput = async (outputId: string, filename: string) => {
    try {
      const blob = await apiClient.downloadOutput(outputId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading output:', error);
      alert('Failed to download file');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'PROCESSING':
        return (
          <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case 'COMPLETED':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'FAILED':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'CANCELLED':
        return (
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
          </svg>
        );
      default:
        return null;
    }
  };

  const formatDuration = (startedAt?: string, completedAt?: string) => {
    if (!startedAt) return '-';

    const start = new Date(startedAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);

    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="ml-2 text-gray-600">Loading jobs...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            {projectId ? 'Project Jobs' : 'All Jobs'}
          </h3>
          <div className="flex items-center space-x-2">
            <div className="flex items-center text-sm text-gray-500">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Auto-refresh every {refreshInterval / 1000}s
            </div>
            <button
              onClick={fetchJobs}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Refresh now"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>


      <div className="divide-y divide-gray-200">
        {jobs.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {projectId ? 'No processing jobs for this project yet.' : 'Start processing a project to see jobs here.'}
            </p>
          </div>
        ) : (
          (() => {
            // Apply status filter if provided
            const filteredJobs = statusFilter
              ? jobs.filter(job => job.status.toLowerCase() === statusFilter.toLowerCase())
              : jobs;

            return filteredJobs.map((job) => (
            <div key={job.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {showAllJobs ? (job.project?.name || 'Unknown Project') : `Job #${job.id.slice(-8)}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      Started {new Date(job.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900 capitalize">
                      {job.status.toLowerCase()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDuration(job.startedAt, job.completedAt)}
                    </div>
                  </div>

                  {job.status === 'PROCESSING' && (
                    <div className="w-32">
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>{job.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    {job.status === 'COMPLETED' && job.outputs?.length > 0 && (
                      <button
                        onClick={() => {
                          setSelectedJob(job);
                          setShowDetails(true);
                        }}
                        className="text-green-600 hover:text-green-500 text-sm font-medium"
                      >
                        View Results ({job.outputs?.length || 0})
                      </button>
                    )}

                    {(job.status === 'PENDING' || job.status === 'PROCESSING') && (
                      <button
                        onClick={() => handleCancelJob(job.id)}
                        className="text-red-600 hover:text-red-500 text-sm font-medium"
                      >
                        Cancel
                      </button>
                    )}

                    <button
                      onClick={() => handleShowJobDetails(job)}
                      className="text-blue-600 hover:text-blue-500 text-sm font-medium"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>

              {job.status === 'FAILED' && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-red-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-red-800 mb-1">Processing Failed</h4>
                      <p className="text-sm text-red-700">
                        {job.errorMessage || 'An unexpected error occurred during processing.'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="bg-red-100 text-red-700 px-2 py-1 rounded">
                          Job ID: {job.id.slice(-8)}
                        </span>
                        {job.startedAt && (
                          <span className="bg-red-100 text-red-700 px-2 py-1 rounded">
                            Failed: {new Date(job.startedAt).toLocaleString()}
                          </span>
                        )}
                        {job.creditsUsed && job.refundedAt && (
                          <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
                            ✓ Credits Refunded
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-red-600">
                        <details className="cursor-pointer">
                          <summary className="hover:text-red-800">Show troubleshooting tips</summary>
                          <div className="mt-1 p-2 bg-red-25 rounded text-xs">
                            <ul className="list-disc list-inside space-y-1">
                              <li>Try reducing the output count or duration</li>
                              <li>Ensure video files are in supported formats (MP4, MOV, AVI)</li>
                              <li>Check that all videos are properly uploaded</li>
                              <li>Try again with simpler settings (no speed mixing)</li>
                            </ul>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ));
          })()
        )}
      </div>

      {/* Job Details Modal */}
      {showDetails && selectedJob && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-3xl shadow-lg rounded-md bg-white max-h-[80vh] overflow-y-auto">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Job Details
                </h3>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Job ID</label>
                    <div className="mt-1 text-sm text-gray-900">{selectedJob.id}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <div className="mt-1 flex items-center space-x-2">
                      {getStatusIcon(selectedJob.status)}
                      <span className="text-sm text-gray-900 capitalize">{selectedJob.status.toLowerCase()}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Project</label>
                    <div className="mt-1 text-sm text-gray-900">{selectedJob.project?.name || 'Unknown Project'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Duration</label>
                    <div className="mt-1 text-sm text-gray-900">
                      {formatDuration(selectedJob.startedAt, selectedJob.completedAt)}
                    </div>
                  </div>
                  {selectedJob.creditsUsed !== undefined && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Credits Used</label>
                      <div className="mt-1 text-sm">
                        <span className={selectedJob.refundedAt ? 'line-through text-gray-400' : 'text-gray-900'}>
                          {selectedJob.creditsUsed} credits
                        </span>
                        {selectedJob.refundedAt && (
                          <span className="ml-2 text-green-600 text-xs">
                            (Refunded)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedJob.outputCount !== undefined && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Output Count</label>
                      <div className="mt-1 text-sm text-gray-900">
                        {selectedJob.outputCount} video{selectedJob.outputCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                </div>

                {selectedJob.status === 'PROCESSING' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Progress</label>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-blue-600 h-4 rounded-full transition-all duration-300 flex items-center justify-center"
                        style={{ width: `${selectedJob.progress}%` }}
                      >
                        <span className="text-xs text-white font-medium">{selectedJob.progress}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedJob.status === 'FAILED' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Error Details</label>
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start">
                        <svg className="w-6 h-6 text-red-400 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-red-800 mb-2">Processing Failed</h4>
                          <p className="text-sm text-red-700 mb-3">
                            {selectedJob.errorMessage || 'An unexpected error occurred during video processing.'}
                          </p>

                          <div className="grid grid-cols-2 gap-4 text-xs mb-3">
                            <div>
                              <span className="font-medium text-red-800">Job ID:</span>
                              <span className="ml-1 font-mono text-red-600">{selectedJob.id}</span>
                            </div>
                            {selectedJob.startedAt && (
                              <div>
                                <span className="font-medium text-red-800">Failed At:</span>
                                <span className="ml-1 text-red-600">{new Date(selectedJob.startedAt).toLocaleString()}</span>
                              </div>
                            )}
                            {selectedJob.creditsUsed && (
                              <div>
                                <span className="font-medium text-red-800">Credits Used:</span>
                                <span className="ml-1 text-red-600">{selectedJob.creditsUsed}</span>
                                {selectedJob.refundedAt && (
                                  <span className="ml-2 text-green-600 font-medium">✓ Refunded</span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="border-t border-red-200 pt-3">
                            <h5 className="text-sm font-medium text-red-800 mb-2">Troubleshooting Steps:</h5>
                            <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                              <li>Verify all video files are properly uploaded and accessible</li>
                              <li>Try reducing the number of output videos</li>
                              <li>Use simpler settings (disable speed mixing temporarily)</li>
                              <li>Ensure video files are in supported formats (MP4, MOV, AVI)</li>
                              <li>Try shorter duration if using fixed duration mode</li>
                              <li>Contact support if the issue persists with Job ID: {selectedJob.id.slice(-8)}</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Processing Settings Section */}
                {selectedJob.settings && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Processing Settings</label>
                    <div className="p-3 bg-gray-50 rounded space-y-3">
                      {/* Mixing Options */}
                      <div className="border-b border-gray-200 pb-2">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Mixing Options</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Order Mixing:</span>
                            <span className="ml-1 font-medium">{selectedJob.settings.orderMixing ? '✓ Enabled' : '✗ Disabled'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Speed Variations:</span>
                            <span className="ml-1 font-medium">{selectedJob.settings.speedMixing ? '✓ Enabled' : '✗ Disabled'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Group-Based:</span>
                            <span className="ml-1 font-medium">{selectedJob.settings.groupMixing ? '✓ Enabled' : '✗ Disabled'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Different Starting:</span>
                            <span className="ml-1 font-medium">{selectedJob.settings.differentStartingVideo ? '✓ Enabled' : '✗ Disabled'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Quality Settings */}
                      <div className="border-b border-gray-200 pb-2">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Quality Settings</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Resolution:</span>
                            <span className="ml-1 font-medium uppercase">{selectedJob.settings.resolution}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Bitrate:</span>
                            <span className="ml-1 font-medium capitalize">{selectedJob.settings.bitrate}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Frame Rate:</span>
                            <span className="ml-1 font-medium">{selectedJob.settings.frameRate} fps</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Aspect Ratio:</span>
                            <span className="ml-1 font-medium capitalize">{selectedJob.settings.aspectRatio?.replace('_', ' ')}</span>
                          </div>
                        </div>
                      </div>

                      {/* Duration Settings */}
                      <div className="border-b border-gray-200 pb-2">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Duration Settings</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Type:</span>
                            <span className="ml-1 font-medium capitalize">{selectedJob.settings.durationType}</span>
                          </div>
                          {selectedJob.settings.durationType === 'fixed' && (
                            <>
                              <div>
                                <span className="text-gray-500">Duration:</span>
                                <span className="ml-1 font-medium">{selectedJob.settings.fixedDuration}s</span>
                              </div>
                              {selectedJob.settings.smartTrimming && (
                                <>
                                  <div>
                                    <span className="text-gray-500">Smart Trimming:</span>
                                    <span className="ml-1 font-medium">✓ Enabled</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Distribution:</span>
                                    <span className="ml-1 font-medium capitalize">{selectedJob.settings.durationDistributionMode}</span>
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Other Settings */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Other Settings</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Audio:</span>
                            <span className="ml-1 font-medium capitalize">{selectedJob.settings.audioMode}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Output Count:</span>
                            <span className="ml-1 font-medium">{selectedJob.settings.outputCount} videos</span>
                          </div>
                          {selectedJob.settings.colorVariations && (
                            <div>
                              <span className="text-gray-500">Color Variations:</span>
                              <span className="ml-1 font-medium">✓ Enabled ({selectedJob.settings.colorIntensity})</span>
                            </div>
                          )}
                          {selectedJob.settings.transitionEffects && (
                            <div>
                              <span className="text-gray-500">Transitions:</span>
                              <span className="ml-1 font-medium">✓ Enabled</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedJob.outputs?.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Output Files ({selectedJob.outputs?.length || 0} total)
                      </label>

                      {/* Batch Download Options */}
                      {(selectedJob.outputs?.length || 0) > 1 && (
                        <div className="flex items-center space-x-2">
                          {downloadInfo && (
                            <span className="text-xs text-gray-500">
                              Total: {downloadInfo.totalSizeFormatted}
                            </span>
                          )}

                          {(selectedJob.outputs?.length || 0) <= 100 && (
                            <button
                              onClick={() => handleBatchDownload('all')}
                              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                            >
                              Download All as ZIP
                            </button>
                          )}

                          {selectedFiles.size > 0 && (
                            <button
                              onClick={() => handleBatchDownload('selected')}
                              className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            >
                              Download Selected ({selectedFiles.size})
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Download Mode Selector for Large Sets */}
                    {downloadInfo && downloadInfo.totalFiles > 100 && (
                      <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <div className="text-sm text-yellow-800 mb-2">
                          Large output set detected. Choose download method:
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {Array.from({ length: downloadInfo.numberOfChunks }).map((_, index) => (
                            <button
                              key={index}
                              onClick={() => handleChunkDownload(index)}
                              className="px-3 py-2 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
                            >
                              Batch {index + 1} ({downloadInfo.recommendedChunkSize} files)
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pagination Controls */}
                    {(selectedJob.outputs?.length || 0) > filesPerPage && (
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-gray-600">
                          Showing {(currentPage - 1) * filesPerPage + 1} to{' '}
                          {Math.min(currentPage * filesPerPage, selectedJob.outputs?.length || 0)}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-2 py-1 text-sm bg-gray-200 rounded disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <span className="px-2 py-1 text-sm">
                            Page {currentPage} of {Math.ceil((selectedJob.outputs?.length || 0) / filesPerPage)}
                          </span>
                          <button
                            onClick={() => setCurrentPage(p => Math.min(Math.ceil((selectedJob.outputs?.length || 0) / filesPerPage), p + 1))}
                            disabled={currentPage >= Math.ceil((selectedJob.outputs?.length || 0) / filesPerPage)}
                            className="px-2 py-1 text-sm bg-gray-200 rounded disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Select All for Current Page */}
                    {(selectedJob.outputs?.length || 0) > 1 && (
                      <div className="mb-2">
                        <label className="flex items-center space-x-2 text-sm">
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              const pageFiles = (selectedJob.outputs || [])
                                .slice((currentPage - 1) * filesPerPage, currentPage * filesPerPage)
                                .map(f => f.id);
                              if (e.target.checked) {
                                setSelectedFiles(new Set([...selectedFiles, ...pageFiles]));
                              } else {
                                const newSelected = new Set(selectedFiles);
                                pageFiles.forEach(id => newSelected.delete(id));
                                setSelectedFiles(newSelected);
                              }
                            }}
                            className="rounded"
                          />
                          <span>Select all on this page</span>
                        </label>
                      </div>
                    )}

                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {(selectedJob.outputs || [])
                        .slice((currentPage - 1) * filesPerPage, currentPage * filesPerPage)
                        .map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                          <div className="flex items-center space-x-3">
                            {(selectedJob.outputs?.length || 0) > 1 && (
                              <input
                                type="checkbox"
                                checked={selectedFiles.has(file.id)}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedFiles);
                                  if (e.target.checked) {
                                    newSelected.add(file.id);
                                  } else {
                                    newSelected.delete(file.id);
                                  }
                                  setSelectedFiles(newSelected);
                                }}
                                className="rounded"
                              />
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-900">{file.filename}</div>
                              <div className="text-xs text-gray-500">
                                {formatFileSize(file.size)} • Created {new Date(file.createdAt).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownloadOutput(file.id, file.filename)}
                            className="text-blue-600 hover:text-blue-500 text-sm font-medium"
                          >
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowDetails(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobMonitor;