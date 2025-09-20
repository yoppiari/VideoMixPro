import React, { useState } from 'react';
import apiClient from '../../utils/api/client';

interface Group {
  id: string;
  name: string;
  order: number;
  videos?: any[];
}

interface GroupManagementProps {
  projectId: string;
  groups: Group[];
  isOpen: boolean;
  onClose: () => void;
  onGroupsUpdate: (groups: Group[]) => void;
}

interface GroupFormData {
  name: string;
  order: number;
}

const GroupManagement: React.FC<GroupManagementProps> = ({
  projectId,
  groups,
  isOpen,
  onClose,
  onGroupsUpdate
}) => {
  const [localGroups, setLocalGroups] = useState<Group[]>(groups);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState<GroupFormData>({ name: '', order: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setFormData({ name: '', order: 0 });
    setEditingGroup(null);
    setShowCreateForm(false);
    setError(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('Group name is required');
      return false;
    }

    if (formData.order < 0) {
      setError('Order must be 0 or greater');
      return false;
    }

    // Check for duplicate names (excluding current editing group)
    const duplicateName = localGroups.some(group =>
      group.name.toLowerCase() === formData.name.toLowerCase() &&
      group.id !== editingGroup?.id
    );

    if (duplicateName) {
      setError('A group with this name already exists');
      return false;
    }

    setError(null);
    return true;
  };

  const handleCreateGroup = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await apiClient.createGroup(
        projectId,
        formData.name.trim(),
        formData.order
      );

      if (response.success) {
        const newGroup = response.data;
        const updatedGroups = [...localGroups, newGroup].sort((a, b) => a.order - b.order);
        setLocalGroups(updatedGroups);
        onGroupsUpdate(updatedGroups);
        resetForm();
      } else {
        setError(response.error || 'Failed to create group');
      }
    } catch (error) {
      console.error('Error creating group:', error);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup || !validateForm()) return;

    setLoading(true);
    try {
      const response = await apiClient.updateGroup(editingGroup.id, {
        name: formData.name.trim(),
        order: formData.order
      });

      if (response.success) {
        const updatedGroups = localGroups
          .map(group =>
            group.id === editingGroup.id
              ? { ...group, name: formData.name.trim(), order: formData.order }
              : group
          )
          .sort((a, b) => a.order - b.order);

        setLocalGroups(updatedGroups);
        onGroupsUpdate(updatedGroups);
        resetForm();
      } else {
        setError(response.error || 'Failed to update group');
      }
    } catch (error) {
      console.error('Error updating group:', error);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm('Are you sure you want to delete this group? Videos in this group will become unassigned.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.deleteGroup(groupId);

      if (response.success) {
        const updatedGroups = localGroups.filter(group => group.id !== groupId);
        setLocalGroups(updatedGroups);
        onGroupsUpdate(updatedGroups);
      } else {
        setError(response.error || 'Failed to delete group');
      }
    } catch (error) {
      console.error('Error deleting group:', error);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (group: Group) => {
    setEditingGroup(group);
    setFormData({ name: group.name, order: group.order });
    setShowCreateForm(true);
  };

  const handleReorderGroup = (groupId: string, direction: 'up' | 'down') => {
    const sortedGroups = [...localGroups].sort((a, b) => a.order - b.order);
    const currentIndex = sortedGroups.findIndex(g => g.id === groupId);

    if (currentIndex === -1) return;

    let newOrder: number;

    if (direction === 'up' && currentIndex > 0) {
      newOrder = sortedGroups[currentIndex - 1].order - 1;
    } else if (direction === 'down' && currentIndex < sortedGroups.length - 1) {
      newOrder = sortedGroups[currentIndex + 1].order + 1;
    } else {
      return; // Can't move further
    }

    const group = sortedGroups[currentIndex];
    setEditingGroup(group);
    setFormData({ name: group.name, order: newOrder });
    handleUpdateGroup();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 max-w-2xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-gray-900">
              Manage Groups
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {/* Create/Edit Form */}
          {showCreateForm && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-md font-medium text-gray-900 mb-3">
                {editingGroup ? 'Edit Group' : 'Create New Group'}
              </h4>

              <div className="space-y-3">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Group Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter group name"
                  />
                </div>

                <div>
                  <label htmlFor="order" className="block text-sm font-medium text-gray-700">
                    Order
                  </label>
                  <input
                    type="number"
                    id="order"
                    name="order"
                    value={formData.order}
                    onChange={handleInputChange}
                    min="0"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Group order (0, 1, 2...)"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end mt-4 space-x-3">
                <button
                  onClick={resetForm}
                  disabled={loading}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={editingGroup ? handleUpdateGroup : handleCreateGroup}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50"
                >
                  {loading ? 'Saving...' : (editingGroup ? 'Update' : 'Create')}
                </button>
              </div>
            </div>
          )}

          {/* Create Button */}
          {!showCreateForm && (
            <div className="mb-4">
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Group
              </button>
            </div>
          )}

          {/* Groups List */}
          <div className="space-y-3">
            {localGroups.length === 0 ? (
              <div className="text-center py-8">
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
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No groups created</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Create your first group to organize videos.
                </p>
              </div>
            ) : (
              localGroups
                .sort((a, b) => a.order - b.order)
                .map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-gray-900">{group.name}</h4>
                          <p className="text-xs text-gray-500">
                            Order: {group.order} • {group.videos?.length || 0} videos
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* Reorder buttons */}
                      <button
                        onClick={() => handleReorderGroup(group.id, 'up')}
                        disabled={loading}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        title="Move up"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleReorderGroup(group.id, 'down')}
                        disabled={loading}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        title="Move down"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Edit button */}
                      <button
                        onClick={() => startEdit(group)}
                        disabled={loading}
                        className="p-1 text-blue-600 hover:text-blue-500 disabled:opacity-50"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        disabled={loading}
                        className="p-1 text-red-600 hover:text-red-500 disabled:opacity-50"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupManagement;