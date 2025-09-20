import React, { useState, useCallback } from 'react';
import apiClient from '../../utils/api/client';

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

interface VideoGalleryProps {
  videos: Video[];
  groups: Group[];
  selectedVideos: Set<string>;
  onVideoSelect: (videoId: string) => void;
  onVideoUpdate: (video: Video) => void;
  onVideoDelete: (videoId: string) => void;
  onVideoAssignToGroup: (videoId: string, groupId: string | null) => void;
}

interface VideoCardProps {
  video: Video;
  isSelected: boolean;
  groups: Group[];
  onSelect: () => void;
  onUpdate: (video: Video) => void;
  onDelete: () => void;
  onAssignToGroup: (groupId: string | null) => void;
}

const VideoCard: React.FC<VideoCardProps> = ({
  video,
  isSelected,
  groups,
  onSelect,
  onUpdate,
  onDelete,
  onAssignToGroup
}) => {
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState(video.metadata);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', video.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const groupId = e.target.value || null;
    onAssignToGroup(groupId);
  };

  const handleMetadataUpdate = async () => {
    try {
      const response = await apiClient.updateVideoMetadata(video.id, editingMetadata);
      if (response.success) {
        onUpdate({ ...video, metadata: editingMetadata });
        setShowMetadataModal(false);
      } else {
        alert(response.error || 'Failed to update metadata');
      }
    } catch (error) {
      console.error('Error updating metadata:', error);
      alert('An error occurred while updating metadata');
    }
  };

  const addStaticMetadataField = () => {
    setEditingMetadata(prev => ({
      ...prev,
      static: { ...prev.static, '': '' }
    }));
  };

  const updateStaticMetadataField = (oldKey: string, newKey: string, value: string) => {
    setEditingMetadata(prev => {
      const newStatic = { ...prev.static };
      if (oldKey !== newKey && oldKey in newStatic) {
        delete newStatic[oldKey];
      }
      if (newKey) {
        newStatic[newKey] = value;
      }
      return { ...prev, static: newStatic };
    });
  };

  const removeStaticMetadataField = (key: string) => {
    setEditingMetadata(prev => {
      const newStatic = { ...prev.static };
      delete newStatic[key];
      return { ...prev, static: newStatic };
    });
  };

  return (
    <>
      <div
        className={`bg-white shadow rounded-lg overflow-hidden transition-all cursor-move ${
          isSelected ? 'ring-2 ring-blue-500' : ''
        } ${isDragging ? 'opacity-50' : ''}`}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
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
              checked={isSelected}
              onChange={onSelect}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              onClick={(e) => e.stopPropagation()}
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
            <div>{formatFileSize(video.size)} • {video.format.toUpperCase()}</div>
            <div>{formatDate(video.createdAt)}</div>
          </div>

          {/* Group assignment */}
          <div className="mt-3">
            <select
              value={video.groupId || ''}
              onChange={handleGroupChange}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">No Group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => setShowMetadataModal(true)}
              className="text-blue-600 hover:text-blue-500 text-xs"
            >
              Metadata
            </button>
            <button
              onClick={() => {/* TODO: Open video preview */}}
              className="text-green-600 hover:text-green-500 text-xs"
            >
              Preview
            </button>
            <button
              onClick={onDelete}
              className="text-red-600 hover:text-red-500 text-xs"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Metadata Modal */}
      {showMetadataModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Edit Video Metadata
              </h3>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Static Metadata</h4>
                  <div className="space-y-2">
                    {Object.entries(editingMetadata.static).map(([key, value], index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="Key"
                          value={key}
                          onChange={(e) => updateStaticMetadataField(key, e.target.value, value)}
                          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                        />
                        <input
                          type="text"
                          placeholder="Value"
                          value={value}
                          onChange={(e) => updateStaticMetadataField(key, key, e.target.value)}
                          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                        />
                        <button
                          onClick={() => removeStaticMetadataField(key)}
                          className="text-red-600 hover:text-red-500 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addStaticMetadataField}
                      className="text-blue-600 hover:text-blue-500 text-xs"
                    >
                      + Add Field
                    </button>
                  </div>
                </div>

                {Object.keys(editingMetadata.dynamic).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Dynamic Metadata</h4>
                    <div className="space-y-2">
                      {Object.entries(editingMetadata.dynamic).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-gray-600">{key}:</span>
                          <span className="text-gray-900">{JSON.stringify(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end mt-6 space-x-3">
                <button
                  onClick={() => setShowMetadataModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMetadataUpdate}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const VideoGallery: React.FC<VideoGalleryProps> = ({
  videos,
  groups,
  selectedVideos,
  onVideoSelect,
  onVideoUpdate,
  onVideoDelete,
  onVideoAssignToGroup
}) => {
  const [draggedOverGroup, setDraggedOverGroup] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'status'>('date');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Filter and sort videos
  const filteredAndSortedVideos = videos
    .filter(video => {
      const matchesGroup = filterGroup === 'all' ||
                         (filterGroup === 'unassigned' && !video.groupId) ||
                         video.groupId === filterGroup;
      const matchesStatus = filterStatus === 'all' || video.status === filterStatus;
      return matchesGroup && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.originalName.localeCompare(b.originalName);
        case 'size':
          return b.size - a.size;
        case 'status':
          return a.status.localeCompare(b.status);
        case 'date':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    setDraggedOverGroup(groupId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDraggedOverGroup(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    const videoId = e.dataTransfer.getData('text/plain');
    if (videoId) {
      onVideoAssignToGroup(videoId, groupId);
    }
    setDraggedOverGroup(null);
  }, [onVideoAssignToGroup]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* View mode toggle */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2v8h10V6H5z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h14a1 1 0 100-2H3z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Filters */}
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="text-sm border border-gray-300 rounded px-3 py-1"
            >
              <option value="all">All Groups</option>
              <option value="unassigned">Unassigned</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border border-gray-300 rounded px-3 py-1"
            >
              <option value="all">All Status</option>
              <option value="UPLOADED">Uploaded</option>
              <option value="PROCESSING">Processing</option>
              <option value="READY">Ready</option>
              <option value="FAILED">Failed</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-sm border border-gray-300 rounded px-3 py-1"
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="size">Sort by Size</option>
              <option value="status">Sort by Status</option>
            </select>
          </div>

          <div className="text-sm text-gray-600">
            {filteredAndSortedVideos.length} of {videos.length} videos
            {selectedVideos.size > 0 && ` • ${selectedVideos.size} selected`}
          </div>
        </div>
      </div>

      {/* Drop zones for groups */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Unassigned drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
            draggedOverGroup === null ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
          }`}
          onDragOver={(e) => handleDragOver(e, null)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, null)}
        >
          <h3 className="font-medium text-gray-900">Unassigned</h3>
          <p className="text-sm text-gray-500">
            {videos.filter(v => !v.groupId).length} videos
          </p>
        </div>

        {/* Group drop zones */}
        {groups.slice(0, 2).map((group) => (
          <div
            key={group.id}
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
              draggedOverGroup === group.id ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
            }`}
            onDragOver={(e) => handleDragOver(e, group.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, group.id)}
          >
            <h3 className="font-medium text-gray-900">{group.name}</h3>
            <p className="text-sm text-gray-500">
              {videos.filter(v => v.groupId === group.id).length} videos
            </p>
          </div>
        ))}
      </div>

      {/* Video Gallery */}
      {filteredAndSortedVideos.length === 0 ? (
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
          <h3 className="mt-2 text-sm font-medium text-gray-900">No videos match your filters</h3>
          <p className="mt-1 text-sm text-gray-500">
            Try adjusting your filter criteria.
          </p>
        </div>
      ) : (
        <div className={
          viewMode === 'grid'
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            : "space-y-4"
        }>
          {filteredAndSortedVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              isSelected={selectedVideos.has(video.id)}
              groups={groups}
              onSelect={() => onVideoSelect(video.id)}
              onUpdate={onVideoUpdate}
              onDelete={() => onVideoDelete(video.id)}
              onAssignToGroup={(groupId) => onVideoAssignToGroup(video.id, groupId)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoGallery;