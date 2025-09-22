import React, { useState, useEffect } from 'react';
import {
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  VideoCameraIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  Bars3Icon
} from '@heroicons/react/24/outline';
import apiClient from '../../utils/api/client';

interface VideoFile {
  id: string;
  originalName: string;
  duration: number;
  size: number;
  createdAt?: string;
  uploadedAt?: string;
  groupId?: string | null;
  group?: {
    id: string;
    name: string;
    order: number;
  } | null;
}

interface VideoGroup {
  id: string;
  name: string;
  order: number;
  videos: VideoFile[];
}

interface VideoGroupManagerProps {
  projectId: string;
  videos: VideoFile[];
  onUpdate?: () => void;
}

export const VideoGroupManager: React.FC<VideoGroupManagerProps> = ({
  projectId,
  videos,
  onUpdate
}) => {
  const [groups, setGroups] = useState<VideoGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<VideoGroup | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [draggedVideo, setDraggedVideo] = useState<VideoFile | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  useEffect(() => {
    fetchGroups();
  }, [projectId, videos]);

  useEffect(() => {
    console.log('[VideoGroupManager] Videos data:', videos);
  }, [videos]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getProjectGroups(projectId);
      if (response.success) {
        // Map videoFiles to videos for consistency
        const groupsData = response.data.map((group: any) => ({
          ...group,
          videos: group.videoFiles || group.videos || []
        }));
        setGroups(groupsData);
        console.log('[VideoGroupManager] Groups loaded:', groupsData);

        // Auto-expand groups with videos
        const expanded = new Set<string>();
        groupsData.forEach((group: VideoGroup) => {
          if (group.videos.length > 0) {
            expanded.add(group.id);
          }
        });
        setExpandedGroups(expanded);
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      setLoading(true);
      const response = await apiClient.createGroup(projectId, newGroupName);
      if (response.success) {
        await fetchGroups();
        setNewGroupName('');
        setShowCreateModal(false);
        if (onUpdate) onUpdate();
      }
    } catch (error) {
      console.error('Failed to create group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup || !newGroupName.trim()) return;

    try {
      setLoading(true);
      const response = await apiClient.updateGroup(editingGroup.id, { name: newGroupName });
      if (response.success) {
        await fetchGroups();
        setEditingGroup(null);
        setNewGroupName('');
        if (onUpdate) onUpdate();
      }
    } catch (error) {
      console.error('Failed to update group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm('Are you sure you want to delete this group? Videos will be unassigned but not deleted.')) {
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.deleteGroup(groupId);
      if (response.success) {
        await fetchGroups();
        if (onUpdate) onUpdate();
      }
    } catch (error) {
      console.error('Failed to delete group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignVideos = async (groupId: string | null) => {
    if (selectedVideos.length === 0) return;

    try {
      setLoading(true);
      const response = await apiClient.bulkAssignVideosToGroup(selectedVideos, groupId);
      if (response.success) {
        await fetchGroups();
        setSelectedVideos([]);
        if (onUpdate) onUpdate();
      }
    } catch (error) {
      console.error('Failed to assign videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, video: VideoFile) => {
    setDraggedVideo(video);
    e.dataTransfer.effectAllowed = 'move';

    // Create a custom drag preview
    const dragPreview = document.createElement('div');
    dragPreview.textContent = video.originalName;
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-1000px';
    dragPreview.style.padding = '8px 12px';
    dragPreview.style.background = '#3B82F6';
    dragPreview.style.color = 'white';
    dragPreview.style.borderRadius = '6px';
    dragPreview.style.fontSize = '14px';
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 0, 0);

    // Clean up the preview after drag starts
    setTimeout(() => {
      document.body.removeChild(dragPreview);
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // For unassigned section, we use string 'unassigned', for groups we use their ID
    setDragOverGroupId(groupId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the drop zone entirely
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverGroupId(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetGroupId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroupId(null);

    if (!draggedVideo) return;

    // The actual groupId to send to the API (null for unassigned)
    const actualGroupId = targetGroupId === 'unassigned' ? null : targetGroupId;

    // Don't move if it's already in the same group
    if (draggedVideo.groupId === actualGroupId) {
      setDraggedVideo(null);
      return;
    }

    try {
      setLoading(true);
      console.log(`Moving video ${draggedVideo.id} to group ${actualGroupId}`);
      const response = await apiClient.assignVideoToGroup(draggedVideo.id, actualGroupId);
      console.log('API response:', response);
      if (response.success !== false) {
        // Update local state immediately for better UX
        const updatedVideo = { ...draggedVideo, groupId: actualGroupId };

        // Refresh the groups and videos
        await fetchGroups();
        if (onUpdate) onUpdate();

        console.log('Video moved successfully');

        // Show success notification (optional - add toast library if you want)
        const groupName = actualGroupId
          ? groups.find(g => g.id === actualGroupId)?.name
          : 'Unassigned';
        console.log(`✅ Video moved to ${groupName}`);
      } else {
        console.error('Failed to move video:', response.error);
      }
    } catch (error) {
      console.error('Failed to move video:', error);
      alert('Failed to move video. Please try again.');
    } finally {
      setDraggedVideo(null);
      setLoading(false);
    }
  };

  const toggleGroupExpansion = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // Get unassigned videos - check both groupId and group object
  const unassignedVideos = videos.filter(v => !v.groupId && !v.group);

  return (
    <div className="space-y-6 relative">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <svg className="animate-spin h-8 w-8 text-blue-500 mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm text-gray-600">Moving video...</span>
          </div>
        </div>
      )}
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Video Groups</h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          <FolderPlusIcon className="mr-2 h-4 w-4" />
          Create Group
        </button>
      </div>

      {/* Groups List */}
      <div className="space-y-4">
        {groups.map((group) => (
          <div
            key={group.id}
            className={`border rounded-lg overflow-hidden transition-all ${
              dragOverGroupId === group.id
                ? 'border-blue-400 bg-blue-50 shadow-lg'
                : 'border-gray-200'
            }`}
            onDragOver={(e) => handleDragOver(e, group.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, group.id)}
          >
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => toggleGroupExpansion(group.id)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  {expandedGroups.has(group.id) ? (
                    <ChevronDownIcon className="h-5 w-5" />
                  ) : (
                    <ChevronRightIcon className="h-5 w-5" />
                  )}
                </button>
                <Bars3Icon className="h-5 w-5 text-gray-400" />
                <h4 className="text-md font-medium text-gray-900">
                  {group.name}
                  <span className="ml-2 text-sm text-gray-500">
                    ({group.videos.length} video{group.videos.length !== 1 ? 's' : ''})
                  </span>
                </h4>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setEditingGroup(group);
                    setNewGroupName(group.name);
                  }}
                  className="text-gray-500 hover:text-blue-600"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  className="text-gray-500 hover:text-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {expandedGroups.has(group.id) && (
              <div className="p-4">
                {group.videos.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.videos.map((video) => (
                      <div
                        key={video.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, video)}
                        className={`flex items-center space-x-3 p-3 bg-white border rounded-lg hover:shadow-sm transition-all ${
                          draggedVideo?.id === video.id
                            ? 'opacity-50 border-blue-300 cursor-grabbing'
                            : 'border-gray-200 cursor-grab hover:border-gray-300'
                        }`}
                      >
                        <VideoCameraIcon className="h-5 w-5 text-gray-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {video.originalName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDuration(video.duration)} • {formatSize(video.size)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <p className="text-sm text-gray-500">
                      Drag videos here to add them to this group
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Unassigned Videos */}
      {unassignedVideos.length > 0 && (
        <div
          className={`border rounded-lg overflow-hidden transition-all ${
            dragOverGroupId === 'unassigned'
              ? 'border-blue-400 bg-blue-50 shadow-lg'
              : 'border-gray-200'
          }`}
          onDragOver={(e) => handleDragOver(e, 'unassigned')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'unassigned')}
        >
          <div className="bg-gray-50 px-4 py-3">
            <h4 className="text-md font-medium text-gray-900">
              Unassigned Videos
              <span className="ml-2 text-sm text-gray-500">
                ({unassignedVideos.length} video{unassignedVideos.length !== 1 ? 's' : ''})
              </span>
            </h4>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {unassignedVideos.map((video) => (
                <div
                  key={video.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, video)}
                  className={`flex items-center space-x-3 p-3 bg-white border rounded-lg hover:shadow-sm transition-all ${
                    draggedVideo?.id === video.id
                      ? 'opacity-50 border-blue-300 cursor-grabbing'
                      : 'border-gray-200 cursor-grab hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedVideos.includes(video.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedVideos([...selectedVideos, video.id]);
                      } else {
                        setSelectedVideos(selectedVideos.filter(id => id !== video.id));
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <VideoCameraIcon className="h-5 w-5 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {video.originalName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDuration(video.duration)} • {formatSize(video.size)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {selectedVideos.length > 0 && (
              <div className="mt-4 flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {selectedVideos.length} selected
                </span>
                <select
                  onChange={(e) => {
                    const groupId = e.target.value || null;
                    handleAssignVideos(groupId);
                  }}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1"
                  defaultValue=""
                >
                  <option value="">Assign to group...</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Group Modal */}
      {(showCreateModal || editingGroup) && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingGroup ? 'Edit Group' : 'Create New Group'}
            </h3>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Enter group name (e.g., Intro, Main Content, Outro)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingGroup(null);
                  setNewGroupName('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={editingGroup ? handleUpdateGroup : handleCreateGroup}
                disabled={!newGroupName.trim() || loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : (editingGroup ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};