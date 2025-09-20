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
  project: {
    id: string;
    name: string;
  };
  outputFiles: Array<{
    id: string;
    filename: string;
    size: number;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface JobMonitorProps {
  projectId?: string;
  refreshInterval?: number;
  showAllJobs?: boolean;
}

const JobMonitor: React.FC<JobMonitorProps> = ({
  projectId,
  refreshInterval = 5000,
  showAllJobs = false
}) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      setError(null);
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
      setJobs(Array.isArray(jobs) ? jobs : []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setError('Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  }, [projectId, showAllJobs]);

  useEffect(() => {
    fetchJobs();

    const interval = setInterval(() => {
      fetchJobs();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchJobs, refreshInterval]);

  const handleCancelJob = async (jobId: string) => {
    if (!window.confirm('Are you sure you want to cancel this job?')) {
      return;
    }

    try {
      await apiClient.cancelJob(jobId);
      fetchJobs();
    } catch (error) {
      console.error('Error cancelling job:', error);
      setError('Failed to cancel job');
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
      setError('Failed to download file');
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

      {error && (
        <div className="px-6 py-4 bg-red-50 border-b border-red-200">
          <div className="text-red-700">{error}</div>
        </div>
      )}

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
          jobs.map((job) => (
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
                    {job.status === 'COMPLETED' && job.outputFiles.length > 0 && (
                      <button
                        onClick={() => {
                          setSelectedJob(job);
                          setShowDetails(true);
                        }}
                        className="text-green-600 hover:text-green-500 text-sm font-medium"
                      >
                        View Results ({job.outputFiles.length})
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
                      onClick={() => {
                        setSelectedJob(job);
                        setShowDetails(true);
                      }}
                      className="text-blue-600 hover:text-blue-500 text-sm font-medium"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>

              {job.status === 'FAILED' && job.errorMessage && (
                <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                  Error: {job.errorMessage}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Job Details Modal */}
      {showDetails && selectedJob && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 max-w-4xl shadow-lg rounded-md bg-white">
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

                {selectedJob.errorMessage && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Error Message</label>
                    <div className="mt-1 p-3 bg-red-50 rounded text-sm text-red-700">
                      {selectedJob.errorMessage}
                    </div>
                  </div>
                )}

                {selectedJob.outputFiles.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Output Files</label>
                    <div className="space-y-2">
                      {selectedJob.outputFiles.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{file.filename}</div>
                            <div className="text-xs text-gray-500">
                              {formatFileSize(file.size)} • Created {new Date(file.createdAt).toLocaleString()}
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