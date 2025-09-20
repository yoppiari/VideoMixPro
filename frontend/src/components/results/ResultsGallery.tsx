import React, { useState, useEffect } from 'react';
import VideoPlayer from '../video/VideoPlayer';
import apiClient from '../../utils/api/client';

interface OutputFile {
  id: string;
  filename: string;
  path: string;
  size: number;
  duration: number;
  metadata: {
    resolution?: string;
    format?: string;
    bitrate?: number;
    fps?: number;
  };
  sourceFiles: string[];
  createdAt: string;
  thumbnailPath?: string;
  previewPath?: string;
}

interface Job {
  id: string;
  projectId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  outputFiles: OutputFile[];
  project: {
    id: string;
    name: string;
  };
}

interface ResultsGalleryProps {
  jobId: string;
  onClose?: () => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const ResultsGallery: React.FC<ResultsGalleryProps> = ({
  jobId,
  onClose,
  autoRefresh = true,
  refreshInterval = 5000
}) => {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<OutputFile | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'duration' | 'created'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterFormat, setFilterFormat] = useState<string>('all');

  const fetchJobData = async () => {
    try {
      setError(null);
      const response = await apiClient.getJobStatus(jobId);

      if (response.success) {
        setJob(response.data);
        if (response.data.outputFiles.length > 0 && !selectedFile) {
          setSelectedFile(response.data.outputFiles[0]);
        }
      } else {
        setError(response.error || 'Failed to fetch job data');
      }
    } catch (err) {
      console.error('Error fetching job data:', err);
      setError('Failed to fetch job data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobData();

    if (autoRefresh && (job?.status === 'PENDING' || job?.status === 'PROCESSING')) {
      const interval = setInterval(fetchJobData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [jobId, autoRefresh, refreshInterval, job?.status]);

  const handleDownload = async (outputFile: OutputFile) => {
    try {
      const blob = await apiClient.downloadOutput(outputFile.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outputFile.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      setError('Failed to download file');
    }
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const sortFiles = (files: OutputFile[]): OutputFile[] => {
    const sorted = [...files].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'name':
          aValue = a.filename.toLowerCase();
          bValue = b.filename.toLowerCase();
          break;
        case 'size':
          aValue = a.size;
          bValue = b.size;
          break;
        case 'duration':
          aValue = a.duration;
          bValue = b.duration;
          break;
        case 'created':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    if (filterFormat !== 'all') {
      return sorted.filter(file =>
        file.metadata.format?.toLowerCase() === filterFormat.toLowerCase()
      );
    }

    return sorted;
  };

  const getUniqueFormats = (files: OutputFile[]): string[] => {
    const formats = files
      .map(file => file.metadata.format)
      .filter((format): format is string => Boolean(format))
      .filter((format, index, array) => array.indexOf(format) === index);
    return formats;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
          <div className="flex items-center space-x-3">
            <svg className="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-gray-700">Loading results...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Error</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <div className="flex space-x-3 justify-center">
              <button
                onClick={fetchJobData}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Retry
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  const sortedFiles = sortFiles(job.outputFiles);
  const uniqueFormats = getUniqueFormats(job.outputFiles);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto z-50">
      <div className="min-h-screen py-4 px-4">
        <div className="bg-white rounded-lg shadow-xl max-w-7xl mx-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Processing Results - {job.project.name}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {job.outputFiles.length} output file{job.outputFiles.length !== 1 ? 's' : ''} generated
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {/* View mode toggle */}
                <div className="flex border border-gray-300 rounded">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-3 py-1 text-sm ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    Grid
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-1 text-sm ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    List
                  </button>
                </div>

                {onClose && (
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Filters and sorting */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center space-x-4">
              {/* Sort by */}
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="created">Created</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                  <option value="duration">Duration</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="text-gray-500 hover:text-gray-700"
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>

              {/* Filter by format */}
              {uniqueFormats.length > 1 && (
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Format:</label>
                  <select
                    value={filterFormat}
                    onChange={(e) => setFilterFormat(e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="all">All</option>
                    {uniqueFormats.map(format => (
                      <option key={format} value={format}>{format.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex h-[600px]">
            {/* File list/grid */}
            <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 gap-4 p-4">
                  {sortedFiles.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => setSelectedFile(file)}
                      className={`cursor-pointer rounded-lg border-2 transition-colors ${
                        selectedFile?.id === file.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="p-3">
                        {/* Thumbnail placeholder */}
                        <div className="aspect-video bg-gray-100 rounded mb-2 flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <h4 className="font-medium text-sm text-gray-900 truncate">
                          {file.filename}
                        </h4>
                        <div className="text-xs text-gray-500 mt-1">
                          <div>{formatFileSize(file.size)}</div>
                          <div>{formatDuration(file.duration)}</div>
                          {file.metadata.resolution && (
                            <div>{file.metadata.resolution}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {sortedFiles.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => setSelectedFile(file)}
                      className={`cursor-pointer p-4 hover:bg-gray-50 ${
                        selectedFile?.id === file.id ? 'bg-blue-50 border-r-4 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm text-gray-900 truncate">
                            {file.filename}
                          </h4>
                          <div className="text-xs text-gray-500">
                            {formatFileSize(file.size)} • {formatDuration(file.duration)}
                            {file.metadata.resolution && ` • ${file.metadata.resolution}`}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(file);
                          }}
                          className="text-blue-600 hover:text-blue-500 text-sm font-medium"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video preview */}
            <div className="flex-1 p-6">
              {selectedFile ? (
                <div>
                  <VideoPlayer
                    src={`/api/processing/download/${selectedFile.id}`}
                    title={selectedFile.filename}
                    poster={selectedFile.thumbnailPath}
                    showDetails={true}
                    metadata={{
                      duration: selectedFile.duration,
                      resolution: selectedFile.metadata.resolution,
                      fileSize: selectedFile.size,
                      format: selectedFile.metadata.format
                    }}
                    onError={(error) => setError(`Video playback failed: ${error}`)}
                  />

                  {/* File actions */}
                  <div className="mt-4 flex space-x-3">
                    <button
                      onClick={() => handleDownload(selectedFile)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Download</span>
                    </button>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/processing/download/${selectedFile.id}`);
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy Link</span>
                    </button>
                  </div>

                  {/* Additional metadata */}
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-3">Technical Details</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">File Size:</span>
                        <span className="ml-2 text-gray-600">{formatFileSize(selectedFile.size)}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Duration:</span>
                        <span className="ml-2 text-gray-600">{formatDuration(selectedFile.duration)}</span>
                      </div>
                      {selectedFile.metadata.resolution && (
                        <div>
                          <span className="font-medium text-gray-700">Resolution:</span>
                          <span className="ml-2 text-gray-600">{selectedFile.metadata.resolution}</span>
                        </div>
                      )}
                      {selectedFile.metadata.format && (
                        <div>
                          <span className="font-medium text-gray-700">Format:</span>
                          <span className="ml-2 text-gray-600">{selectedFile.metadata.format.toUpperCase()}</span>
                        </div>
                      )}
                      {selectedFile.metadata.bitrate && (
                        <div>
                          <span className="font-medium text-gray-700">Bitrate:</span>
                          <span className="ml-2 text-gray-600">{Math.round(selectedFile.metadata.bitrate / 1000)} kbps</span>
                        </div>
                      )}
                      {selectedFile.metadata.fps && (
                        <div>
                          <span className="font-medium text-gray-700">Frame Rate:</span>
                          <span className="ml-2 text-gray-600">{selectedFile.metadata.fps} fps</span>
                        </div>
                      )}
                      <div>
                        <span className="font-medium text-gray-700">Created:</span>
                        <span className="ml-2 text-gray-600">
                          {new Date(selectedFile.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Source Files:</span>
                        <span className="ml-2 text-gray-600">{selectedFile.sourceFiles.length} files</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p>Select a file to preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsGallery;