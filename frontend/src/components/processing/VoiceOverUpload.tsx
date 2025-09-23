import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../utils/api/client';

interface VoiceOverFile {
  id: string;
  originalName: string;
  duration: number;
  format: string;
  size: number;
  order: number;
}

interface VoiceOverUploadProps {
  projectId: string;
  onVoiceOversChange: (files: VoiceOverFile[]) => void;
  isEnabled: boolean;
}

const VoiceOverUpload: React.FC<VoiceOverUploadProps> = ({
  projectId,
  onVoiceOversChange,
  isEnabled
}) => {
  const [voiceOvers, setVoiceOvers] = useState<VoiceOverFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalDuration, setTotalDuration] = useState(0);

  // Load existing voice overs for the project
  useEffect(() => {
    if (projectId && isEnabled) {
      loadVoiceOvers();
    }
  }, [projectId, isEnabled]);

  const loadVoiceOvers = async () => {
    try {
      const response = await apiClient.getProjectVoiceOvers(projectId);
      // API returns data in nested structure
      const data = response.data || response;
      const files = data.files || [];
      setVoiceOvers(files);
      setTotalDuration(data.totalDuration || 0);
      onVoiceOversChange(files);
    } catch (error) {
      console.error('Failed to load voice overs:', error);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files: FileList) => {
    const audioFiles = Array.from(files).filter(file =>
      file.type.startsWith('audio/') ||
      ['.mp3', '.wav', '.m4a', '.ogg', '.webm'].some(ext => file.name.toLowerCase().endsWith(ext))
    );

    if (audioFiles.length === 0) {
      setError('Please select audio files only');
      return;
    }

    if (audioFiles.length + voiceOvers.length > 10) {
      setError('Maximum 10 voice over files allowed');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const response = await apiClient.uploadVoiceOvers(projectId, audioFiles);
      // API returns data in nested structure
      const data = response.data || response;

      if (data.files) {
        const newFiles = [...voiceOvers, ...data.files];
        setVoiceOvers(newFiles);
        setTotalDuration(data.totalDuration || 0);
        onVoiceOversChange(newFiles);
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setError(error.message || 'Failed to upload voice over files');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (voiceOverId: string) => {
    try {
      await apiClient.deleteVoiceOver(voiceOverId);
      const newFiles = voiceOvers.filter(v => v.id !== voiceOverId);
      setVoiceOvers(newFiles);
      const newDuration = newFiles.reduce((sum, f) => sum + f.duration, 0);
      setTotalDuration(newDuration);
      onVoiceOversChange(newFiles);
    } catch (error) {
      console.error('Failed to delete voice over:', error);
      setError('Failed to delete voice over file');
    }
  };

  const handleReorder = async (dragIndex: number, dropIndex: number) => {
    const draggedItem = voiceOvers[dragIndex];
    const newList = [...voiceOvers];
    newList.splice(dragIndex, 1);
    newList.splice(dropIndex, 0, draggedItem);

    // Update order numbers
    const orderedList = newList.map((item, index) => ({
      ...item,
      order: index
    }));

    setVoiceOvers(orderedList);
    onVoiceOversChange(orderedList);

    // Update order on backend
    try {
      await apiClient.updateVoiceOverOrder(
        projectId,
        orderedList.map(item => ({ id: item.id, order: item.order }))
      );
    } catch (error) {
      console.error('Failed to update voice over order:', error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (!isEnabled) {
    return null;
  }

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Voice Over Files</h3>
        <div className="text-sm text-gray-500">
          {voiceOvers.length}/10 files | Total: {formatDuration(totalDuration)}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
        <div className="flex">
          <svg className="w-5 h-5 text-purple-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-purple-800">
            <strong>Voice Over Mode Active</strong>
            <p className="mt-1">Each output video will receive a different voice over. Video speed will auto-match to voice duration (0.8x-1.5x range).</p>
          </div>
        </div>
      </div>

      {/* Upload area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center ${
          dragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <p className="mt-2 text-sm text-gray-600">
          {dragActive ? 'Drop audio files here' : 'Drag and drop audio files, or click to browse'}
        </p>

        <input
          type="file"
          multiple
          accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={uploading}
        />

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
            <div className="text-purple-600">
              <svg className="animate-spin h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="mt-2 text-sm">Uploading...</p>
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {/* Voice over list */}
      {voiceOvers.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Uploaded Voice Overs</h4>
          <div className="space-y-2">
            {voiceOvers.map((voiceOver, index) => (
              <div
                key={voiceOver.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('dragIndex', index.toString())}
                onDrop={(e) => {
                  e.preventDefault();
                  const dragIndex = parseInt(e.dataTransfer.getData('dragIndex'));
                  handleReorder(dragIndex, index);
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="w-8 h-8 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {index + 1}. {voiceOver.originalName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDuration(voiceOver.duration)} • {voiceOver.format.toUpperCase()} • {formatFileSize(voiceOver.size)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(voiceOver.id)}
                  className="ml-4 text-red-600 hover:text-red-800"
                  title="Delete voice over"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 text-xs text-gray-500">
            <p>💡 Drag to reorder • Voice overs will be distributed sequentially to outputs</p>
            {voiceOvers.length > 1 && (
              <p className="mt-1">Assignment pattern: Output 1 → VO 1, Output 2 → VO 2, etc. (cycles if more outputs than VOs)</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceOverUpload;