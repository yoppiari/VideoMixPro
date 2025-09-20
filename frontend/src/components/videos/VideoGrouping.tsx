import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import axios from 'axios';
import { toast } from 'react-toastify';

interface Video {
  id: string;
  filename: string;
  originalName: string;
  duration: number;
  size: number;
  format: string;
  thumbnail?: string;
  metadata?: any;
}

interface VideoGroup {
  id: string;
  name: string;
  position: number;
  videos: Video[];
  mixDuration?: number;
  transitionType?: string;
}

interface VideoGroupingProps {
  projectId: string;
  onGroupsChange?: (groups: VideoGroup[]) => void;
  readOnly?: boolean;
}

const VideoGrouping: React.FC<VideoGroupingProps> = ({ projectId, onGroupsChange, readOnly = false }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [groups, setGroups] = useState<VideoGroup[]>([]);
  const [unassignedVideos, setUnassignedVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  // Default transition types
  const transitionTypes = [
    { value: 'cut', label: 'Cut', icon: '✂️' },
    { value: 'fade', label: 'Fade', icon: '🌅' },
    { value: 'dissolve', label: 'Dissolve', icon: '💫' },
    { value: 'slide', label: 'Slide', icon: '➡️' },
    { value: 'wipe', label: 'Wipe', icon: '🧹' },
  ];

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const fetchProjectData = async () => {
    try {
      setIsLoading(true);

      // Fetch project videos
      const videosRes = await axios.get(`/api/projects/${projectId}/videos`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      // Fetch project groups
      const groupsRes = await axios.get(`/api/projects/${projectId}/groups`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      const allVideos = videosRes.data;
      const projectGroups = groupsRes.data || [];

      // Separate assigned and unassigned videos
      const assignedVideoIds = new Set(
        projectGroups.flatMap((g: VideoGroup) => g.videos.map((v: Video) => v.id))
      );

      const unassigned = allVideos.filter((v: Video) => !assignedVideoIds.has(v.id));

      setVideos(allVideos);
      setGroups(projectGroups);
      setUnassignedVideos(unassigned);

      if (onGroupsChange) {
        onGroupsChange(projectGroups);
      }
    } catch (error) {
      console.error('Error fetching project data:', error);
      toast.error('Failed to load project data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || readOnly) return;

    const { source, destination, draggableId } = result;

    // Find the video being dragged
    const draggedVideo = videos.find(v => v.id === draggableId);
    if (!draggedVideo) return;

    // Handle moving between groups and unassigned
    if (source.droppableId === 'unassigned' && destination.droppableId !== 'unassigned') {
      // Moving from unassigned to a group
      const destGroupId = destination.droppableId.replace('group-', '');
      const destGroup = groups.find(g => g.id === destGroupId);

      if (destGroup) {
        const updatedUnassigned = unassignedVideos.filter(v => v.id !== draggableId);
        const updatedGroup = {
          ...destGroup,
          videos: [...destGroup.videos.slice(0, destination.index), draggedVideo, ...destGroup.videos.slice(destination.index)]
        };

        setUnassignedVideos(updatedUnassigned);
        setGroups(groups.map(g => g.id === destGroupId ? updatedGroup : g));

        // Save to backend
        await updateGroupVideos(destGroupId, updatedGroup.videos);
      }
    } else if (source.droppableId !== 'unassigned' && destination.droppableId === 'unassigned') {
      // Moving from a group to unassigned
      const sourceGroupId = source.droppableId.replace('group-', '');
      const sourceGroup = groups.find(g => g.id === sourceGroupId);

      if (sourceGroup) {
        const updatedGroup = {
          ...sourceGroup,
          videos: sourceGroup.videos.filter(v => v.id !== draggableId)
        };

        setGroups(groups.map(g => g.id === sourceGroupId ? updatedGroup : g));
        setUnassignedVideos([...unassignedVideos, draggedVideo]);

        // Save to backend
        await updateGroupVideos(sourceGroupId, updatedGroup.videos);
      }
    } else if (source.droppableId !== 'unassigned' && destination.droppableId !== 'unassigned') {
      // Moving between groups or within the same group
      const sourceGroupId = source.droppableId.replace('group-', '');
      const destGroupId = destination.droppableId.replace('group-', '');

      if (sourceGroupId === destGroupId) {
        // Reordering within the same group
        const group = groups.find(g => g.id === sourceGroupId);
        if (group) {
          const reorderedVideos = Array.from(group.videos);
          const [removed] = reorderedVideos.splice(source.index, 1);
          reorderedVideos.splice(destination.index, 0, removed);

          const updatedGroup = { ...group, videos: reorderedVideos };
          setGroups(groups.map(g => g.id === sourceGroupId ? updatedGroup : g));

          // Save to backend
          await updateGroupVideos(sourceGroupId, reorderedVideos);
        }
      } else {
        // Moving between different groups
        const sourceGroup = groups.find(g => g.id === sourceGroupId);
        const destGroup = groups.find(g => g.id === destGroupId);

        if (sourceGroup && destGroup) {
          const sourceVideos = Array.from(sourceGroup.videos);
          const [removed] = sourceVideos.splice(source.index, 1);

          const destVideos = Array.from(destGroup.videos);
          destVideos.splice(destination.index, 0, removed);

          setGroups(groups.map(g => {
            if (g.id === sourceGroupId) return { ...g, videos: sourceVideos };
            if (g.id === destGroupId) return { ...g, videos: destVideos };
            return g;
          }));

          // Save to backend
          await Promise.all([
            updateGroupVideos(sourceGroupId, sourceVideos),
            updateGroupVideos(destGroupId, destVideos)
          ]);
        }
      }
    }
  };

  const updateGroupVideos = async (groupId: string, videos: Video[]) => {
    try {
      await axios.put(
        `/api/projects/${projectId}/groups/${groupId}/videos`,
        { videoIds: videos.map(v => v.id) },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      if (onGroupsChange) {
        const updatedGroups = groups.map(g =>
          g.id === groupId ? { ...g, videos } : g
        );
        onGroupsChange(updatedGroups);
      }
    } catch (error) {
      console.error('Error updating group videos:', error);
      toast.error('Failed to update group');
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      const response = await axios.post(
        `/api/projects/${projectId}/groups`,
        {
          name: newGroupName,
          position: groups.length
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      const newGroup: VideoGroup = {
        ...response.data,
        videos: []
      };

      setGroups([...groups, newGroup]);
      setNewGroupName('');
      setShowNewGroupModal(false);
      toast.success('Group created successfully');

      if (onGroupsChange) {
        onGroupsChange([...groups, newGroup]);
      }
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Failed to create group');
    }
  };

  const handleUpdateGroupName = async (groupId: string) => {
    if (!editingGroupName.trim()) return;

    try {
      await axios.put(
        `/api/projects/${projectId}/groups/${groupId}`,
        { name: editingGroupName },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      setGroups(groups.map(g =>
        g.id === groupId ? { ...g, name: editingGroupName } : g
      ));
      setEditingGroupId(null);
      setEditingGroupName('');
      toast.success('Group renamed successfully');
    } catch (error) {
      console.error('Error updating group:', error);
      toast.error('Failed to update group');
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm('Are you sure you want to delete this group? Videos will be moved to unassigned.')) {
      return;
    }

    try {
      const group = groups.find(g => g.id === groupId);
      if (group) {
        // Move videos back to unassigned
        setUnassignedVideos([...unassignedVideos, ...group.videos]);
      }

      await axios.delete(
        `/api/projects/${projectId}/groups/${groupId}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      const updatedGroups = groups.filter(g => g.id !== groupId);
      setGroups(updatedGroups);
      toast.success('Group deleted successfully');

      if (onGroupsChange) {
        onGroupsChange(updatedGroups);
      }
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Failed to delete group');
    }
  };

  const handleUpdateTransition = async (groupId: string, transitionType: string) => {
    try {
      await axios.put(
        `/api/projects/${projectId}/groups/${groupId}`,
        { transitionType },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      setGroups(groups.map(g =>
        g.id === groupId ? { ...g, transitionType } : g
      ));
      toast.success('Transition type updated');
    } catch (error) {
      console.error('Error updating transition:', error);
      toast.error('Failed to update transition');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const calculateGroupDuration = (group: VideoGroup) => {
    return group.videos.reduce((total, video) => total + (video.duration || 0), 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="video-grouping-container">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Video Groups</h3>
            <p className="mt-1 text-sm text-gray-500">
              Drag and drop videos to organize them into groups for mixing
            </p>
          </div>
          {!readOnly && (
            <button
              onClick={() => setShowNewGroupModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <svg className="mr-2 -ml-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Group
            </button>
          )}
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Unassigned Videos */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <h4 className="text-sm font-medium text-gray-900">
                Unassigned Videos ({unassignedVideos.length})
              </h4>
            </div>
            <Droppable droppableId="unassigned" isDropDisabled={readOnly}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`p-2 min-h-[200px] ${
                    snapshot.isDraggingOver ? 'bg-blue-50' : ''
                  }`}
                >
                  {unassignedVideos.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-500">
                      All videos are assigned to groups
                    </div>
                  ) : (
                    unassignedVideos.map((video, index) => (
                      <Draggable
                        key={video.id}
                        draggableId={video.id}
                        index={index}
                        isDragDisabled={readOnly}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`mb-2 p-3 bg-white border rounded-lg ${
                              snapshot.isDragging ? 'shadow-lg' : 'border-gray-200'
                            }`}
                          >
                            <div className="flex items-center">
                              {video.thumbnail && (
                                <img
                                  src={video.thumbnail}
                                  alt={video.originalName}
                                  className="w-16 h-10 object-cover rounded mr-3"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {video.originalName}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatDuration(video.duration)} • {formatFileSize(video.size)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* Groups */}
          {groups.map((group) => (
            <div key={group.id} className="bg-white rounded-lg shadow">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  {editingGroupId === group.id ? (
                    <div className="flex items-center flex-1">
                      <input
                        type="text"
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onBlur={() => handleUpdateGroupName(group.id)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') handleUpdateGroupName(group.id);
                        }}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <h4 className="text-sm font-medium text-gray-900">
                      {group.name} ({group.videos.length})
                    </h4>
                  )}
                  {!readOnly && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => {
                          setEditingGroupId(group.id);
                          setEditingGroupName(group.name);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Duration: {formatDuration(calculateGroupDuration(group))}
                  </span>
                  {!readOnly && (
                    <select
                      value={group.transitionType || 'cut'}
                      onChange={(e) => handleUpdateTransition(group.id, e.target.value)}
                      className="text-xs border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                    >
                      {transitionTypes.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.icon} {type.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <Droppable droppableId={`group-${group.id}`} isDropDisabled={readOnly}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`p-2 min-h-[200px] ${
                      snapshot.isDraggingOver ? 'bg-blue-50' : ''
                    }`}
                  >
                    {group.videos.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-400">
                        Drop videos here
                      </div>
                    ) : (
                      group.videos.map((video, index) => (
                        <Draggable
                          key={video.id}
                          draggableId={video.id}
                          index={index}
                          isDragDisabled={readOnly}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`mb-2 p-3 bg-white border rounded-lg ${
                                snapshot.isDragging ? 'shadow-lg' : 'border-gray-200'
                              }`}
                            >
                              <div className="flex items-center">
                                <span className="text-xs text-gray-400 mr-2">
                                  {index + 1}
                                </span>
                                {video.thumbnail && (
                                  <img
                                    src={video.thumbnail}
                                    alt={video.originalName}
                                    className="w-16 h-10 object-cover rounded mr-3"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {video.originalName}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {formatDuration(video.duration)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {/* New Group Modal */}
      {showNewGroupModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Group</h3>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Enter group name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowNewGroupModal(false);
                  setNewGroupName('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoGrouping;