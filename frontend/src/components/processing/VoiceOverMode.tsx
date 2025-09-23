import React from 'react';

interface VoiceOverModeProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const VoiceOverMode: React.FC<VoiceOverModeProps> = ({ isEnabled, onToggle }) => {
  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
          />
          <span className="ml-2 text-sm text-gray-700">
            <svg className="inline w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
            </svg>
            Voice Over Mode (Auto-match duration)
          </span>
        </label>
        {isEnabled && (
          <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-xs text-purple-800">
              <strong>Voice Over Mode:</strong> Upload voice over files that will be synced with videos.
              Video speed will auto-adjust (0.8x-1.5x) to match voice duration. Fixed duration is disabled in this mode.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceOverMode;