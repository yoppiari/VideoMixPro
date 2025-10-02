import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/api/client';
import { showCreditWarning, showProcessingStarted, showProcessingError } from '../../services/notifications';

interface ProcessingSettingsProps {
  videoCount: number;
  onSettingsChange: (settings: MixingSettings) => void;
  onStartProcessing: () => void;
}

export interface MixingSettings {
  // Mixing Options
  orderMixing: boolean;
  speedMixing: boolean;
  differentStartingVideo: boolean;
  speedRange: {
    min: number;
    max: number;
  };
  allowedSpeeds: number[];

  // Group Mixing
  groupMixing: boolean;
  groupMixingMode: 'strict' | 'random';

  // Note: Transition and Color features removed for stability

  // Video Quality
  metadataSource: 'normal' | 'capcut' | 'vn' | 'inshot';
  bitrate: 'low' | 'medium' | 'high';
  resolution: 'sd' | 'hd' | 'fullhd';
  frameRate: 24 | 30 | 60;

  // Aspect Ratio
  aspectRatio: 'original' | 'tiktok' | 'instagram_reels' | 'instagram_square' | 'youtube' | 'youtube_shorts';

  // Duration
  durationType: 'original' | 'fixed';
  fixedDuration: number; // in seconds
  smartTrimming?: boolean; // Enable intelligent duration distribution
  durationDistributionMode?: 'proportional' | 'equal' | 'weighted';

  // Audio
  audioMode: 'keep' | 'mute' | 'voiceover';
  voiceOverMode?: boolean;

  // Output
  outputCount: number;
}

const ProcessingSettings: React.FC<ProcessingSettingsProps> = ({
  videoCount,
  onSettingsChange,
  onStartProcessing
}) => {
  console.log('[ProcessingSettings] Component rendering with props:', {
    videoCount,
    onSettingsChangeType: typeof onSettingsChange,
    onStartProcessingType: typeof onStartProcessing
  });

  // Add mount/unmount logging
  useEffect(() => {
    console.log('[ProcessingSettings] Component mounted');
    return () => {
      console.log('[ProcessingSettings] Component unmounting');
    };
  }, []);

  // Local storage key for settings persistence
  const SETTINGS_STORAGE_KEY = 'videomix-processing-settings';

  // Load saved settings from localStorage
  const loadSavedSettings = (): Partial<MixingSettings> | null => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('[ProcessingSettings] Loaded saved settings:', parsed);
        return parsed;
      }
    } catch (error) {
      console.warn('[ProcessingSettings] Failed to load saved settings:', error);
    }
    return null;
  };

  // Save settings to localStorage
  const saveSettings = (settings: MixingSettings) => {
    try {
      // Only save the important user preferences
      const toSave = {
        orderMixing: settings.orderMixing,
        speedMixing: settings.speedMixing,
        differentStartingVideo: settings.differentStartingVideo,
        groupMixing: settings.groupMixing,
        groupMixingMode: settings.groupMixingMode,
        allowedSpeeds: settings.allowedSpeeds,
        speedRange: settings.speedRange,
        metadataSource: settings.metadataSource,
        bitrate: settings.bitrate,
        resolution: settings.resolution,
        frameRate: settings.frameRate,
        aspectRatio: settings.aspectRatio,
        durationType: settings.durationType,
        fixedDuration: settings.fixedDuration,
        smartTrimming: settings.smartTrimming,
        durationDistributionMode: settings.durationDistributionMode,
        audioMode: settings.audioMode
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(toSave));
      console.log('[ProcessingSettings] Saved settings to localStorage:', toSave);
    } catch (error) {
      console.warn('[ProcessingSettings] Failed to save settings:', error);
    }
  };

  // Initialize settings with saved values or defaults
  const getInitialSettings = (): MixingSettings => {
    const saved = loadSavedSettings();
    const defaults: MixingSettings = {
      orderMixing: true,  // Enable by default for anti-fingerprinting
      speedMixing: true,  // Enable by default for anti-fingerprinting
      differentStartingVideo: true,  // Enable by default for variety
      speedRange: { min: 0.5, max: 2 },
      allowedSpeeds: [0.5, 0.75, 1, 1.25, 1.5, 2],
      groupMixing: false,
      groupMixingMode: 'strict',
      // Transition and color features removed
      metadataSource: 'normal',
      bitrate: 'medium',
      resolution: 'hd',
      frameRate: 30,
      aspectRatio: 'original',
      durationType: 'original',
      fixedDuration: 30,
      smartTrimming: false,
      durationDistributionMode: 'proportional',
      audioMode: 'keep',
      voiceOverMode: false,
      outputCount: 5  // Reduced default to 5 for faster testing
    };

    if (saved) {
      // Merge saved settings with defaults, ensuring all required fields exist
      return { ...defaults, ...saved };
    }
    return defaults;
  };

  const [settings, setSettings] = useState<MixingSettings>(getInitialSettings());

  // Auto-disable speed mixing when voice over mode is enabled
  useEffect(() => {
    if (settings.audioMode === 'voiceover' && settings.speedMixing) {
      console.log('[ProcessingSettings] Voice over mode enabled, disabling speed mixing');
      setSettings(prev => ({
        ...prev,
        speedMixing: false
      }));
    }
  }, [settings.audioMode]);

  const [variantEstimate, setVariantEstimate] = useState(0);
  const [creditEstimate, setCreditEstimate] = useState<{
    creditsRequired: number;
    userCredits: number;
    hasEnoughCredits: boolean;
    breakdown?: any;
    loading: boolean;
  }>({
    creditsRequired: 0,
    userCredits: 0,
    hasEnoughCredits: true,
    loading: false
  });

  // Calculate variant estimation
  useEffect(() => {
    let total = 1;

    // Order permutations (n!)
    if (settings.orderMixing && videoCount > 0) {
      let factorial = 1;
      for (let i = 2; i <= videoCount; i++) {
        factorial *= i;
      }

      // If different starting video is enabled, we only use permutations with unique starting videos
      // This effectively reduces the permutation count since we pick one from each group
      if (settings.differentStartingVideo && videoCount > 1) {
        // Each video can start exactly once, so we get at most videoCount unique variants
        // from the order permutations (one for each starting video)
        total *= Math.min(factorial, videoCount);
      } else {
        total *= factorial;
      }
    }

    // Speed combinations (speeds^videos)
    if (settings.speedMixing && videoCount > 0) {
      total *= Math.pow(settings.allowedSpeeds.length, videoCount);
    }

    // Transition and color features removed for stability

    setVariantEstimate(total);
  }, [settings, videoCount]);

  // Update parent component when settings change and save to localStorage
  useEffect(() => {
    console.log('[ProcessingSettings] Settings changed, updating parent and saving to localStorage:', settings);
    onSettingsChange(settings);
    saveSettings(settings);
  }, [settings, onSettingsChange]);

  // Calculate credit estimate when settings change
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const calculateCreditEstimate = async () => {
      if (!settings.outputCount || isNaN(settings.outputCount) || settings.outputCount < 1) return;
      if (!mounted) return;

      setCreditEstimate(prev => ({ ...prev, loading: true }));

      try {
        const response = await apiClient.getCreditsEstimate(settings.outputCount, {
          ...settings,
          // Map frontend field names to backend expected names
          speedVariations: settings.speedMixing,
          differentStartingVideo: settings.differentStartingVideo,
          groupMixing: settings.groupMixing
        });

        // Only update state if component is still mounted
        if (mounted) {
          // apiClient.unwrapResponse now handles the wrapped format
          console.log('[ProcessingSettings] Credit estimate response:', response);

          // Validate response is not a Promise or weird object
          if (response && typeof response === 'object' && !response.then) {
            setCreditEstimate({
              creditsRequired: response?.creditsRequired || 0,
              userCredits: response?.userCredits || 0,
              hasEnoughCredits: response?.hasEnoughCredits || false,
              breakdown: response?.breakdown || null,
              loading: false
            });
          } else {
            console.error('[ProcessingSettings] Invalid response type:', typeof response, response);
            setCreditEstimate(prev => ({ ...prev, loading: false }));
          }
        }
      } catch (error) {
        console.error('Failed to calculate credit estimate:', error);
        if (mounted) {
          setCreditEstimate(prev => ({ ...prev, loading: false }));
        }
      }
    };

    // Debounce the API call to avoid too many requests
    timeoutId = setTimeout(calculateCreditEstimate, 500);

    // Cleanup function
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [settings]);

  const handleSettingChange = (key: keyof MixingSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSpeedToggle = (speed: number) => {
    setSettings(prev => {
      const speeds = [...prev.allowedSpeeds];
      const index = speeds.indexOf(speed);
      if (index >= 0) {
        speeds.splice(index, 1);
      } else {
        speeds.push(speed);
        speeds.sort((a, b) => a - b);
      }
      return { ...prev, allowedSpeeds: speeds };
    });
  };

  console.log('[ProcessingSettings] Rendering component, state:', { settings, creditEstimate, variantEstimate });

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-6">Processing Settings</h2>

      {/* Mixing Options with Anti-Fingerprinting */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-md font-medium text-gray-700">Mixing Options</h3>
          <div className="group relative">
            <svg className="w-5 h-5 text-gray-400 hover:text-gray-600 cursor-help" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <div className="absolute right-0 w-72 p-3 mt-1 text-xs bg-gray-900 text-white rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <strong>Anti-Fingerprinting:</strong> Prevents platforms (TikTok, YouTube) from detecting your videos as duplicates by creating unique variations in each output.
              <br/><br/>
              💡 <strong>Tip:</strong> Enable more options for stronger anti-fingerprinting protection!
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex">
            <svg className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-blue-800">
              <strong>Anti-Fingerprinting Protection</strong>
              <p className="mt-1">Each option adds unique variations to prevent duplicate detection. The more options enabled, the more unique each video becomes!</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Order Mixing */}
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.orderMixing}
              onChange={(e) => handleSettingChange('orderMixing', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">
              <strong>Order Mixing</strong> - Randomize video sequence
            </span>
          </label>

          {/* Different Starting Video */}
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.differentStartingVideo}
              onChange={(e) => handleSettingChange('differentStartingVideo', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">
              <strong>Different Starting Video</strong> - Each variant starts uniquely
            </span>
          </label>

          {/* Group Mixing */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={settings.groupMixing}
                onChange={(e) => handleSettingChange('groupMixing', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">
                <strong>Group-Based Mixing</strong> - Mix videos from groups
              </span>
            </label>

            {settings.groupMixing && (
              <div className="ml-6 mt-2 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 mb-2">Select mixing mode:</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSettingChange('groupMixingMode', 'strict')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      settings.groupMixingMode === 'strict'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    Strict Order (Group 1 → 2 → 3)
                  </button>
                  <button
                    onClick={() => handleSettingChange('groupMixingMode', 'random')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      settings.groupMixingMode === 'random'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    Random (Any order)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Speed Mixing */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={settings.speedMixing}
                onChange={(e) => handleSettingChange('speedMixing', e.target.checked)}
                disabled={settings.audioMode === 'voiceover'}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
              />
              <span className={`ml-2 text-sm ${settings.audioMode === 'voiceover' ? 'text-gray-400' : 'text-gray-700'}`}>
                <strong>Speed Variations</strong> - Apply random playback speeds
                {settings.audioMode === 'voiceover' && ' (Auto-matched in Voice Over mode)'}
              </span>
            </label>

            {settings.speedMixing && (
              <div className="ml-6 mt-2 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 mb-2">Select speed range:</p>
                <div className="grid grid-cols-3 gap-2">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                    <button
                      key={speed}
                      onClick={() => handleSpeedToggle(speed)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        settings.allowedSpeeds.includes(speed)
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {(() => {
                        console.log('[Debug] Rendering speed button:', { speed, type: typeof speed });
                        if (speed === 0.5) return '0.5× Slow';
                        if (speed === 0.75) return '0.75× Slower';
                        if (speed === 1) return '1× Normal';
                        if (speed === 1.25) return '1.25× Faster';
                        if (speed === 1.5) return '1.5× Fast';
                        if (speed === 2) return '2× Very Fast';
                        return null;
                      })()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Transition and Color features removed for platform stability */}
        </div>

        {/* Anti-Fingerprinting Strength Indicator */}
        <div className="mt-4 p-3 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 font-medium">Anti-Fingerprinting Strength:</span>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[...Array(4)].map((_, i) => {
                  const activeOptions = [
                    settings.orderMixing,
                    settings.speedMixing,
                    settings.differentStartingVideo,
                    settings.groupMixing
                  ].filter(Boolean).length;
                  return (
                    <div
                      key={i}
                      className={`w-8 h-2 rounded ${
                        i < activeOptions
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500'
                          : 'bg-gray-300'
                      }`}
                    />
                  );
                })}
              </div>
              <span className="text-xs text-gray-700 font-medium">
                {(() => {
                  const count = [
                    settings.orderMixing,
                    settings.speedMixing,
                    settings.differentStartingVideo,
                    settings.groupMixing
                  ].filter(Boolean).length;
                  if (count === 0) return 'None';
                  if (count === 1) return 'Weak';
                  if (count === 2) return 'Fair';
                  if (count === 3) return 'Good';
                  if (count === 4) return 'Strong';
                  return 'Maximum';
                })()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Video Quality */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-700 mb-4">Video Quality & Format</h3>

        <div className="grid grid-cols-2 gap-4">
          {/* Metadata Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Metadata Source
            </label>
            <select
              value={settings.metadataSource}
              onChange={(e) => handleSettingChange('metadataSource', e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="normal">Normal (Clean)</option>
              <option value="capcut">CapCut</option>
              <option value="vn">VN Editor</option>
              <option value="inshot">InShot</option>
            </select>
          </div>

          {/* Bitrate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kualitas Video (Bitrate)
            </label>
            <select
              value={settings.bitrate}
              onChange={(e) => handleSettingChange('bitrate', e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="low">Rendah (File Kecil)</option>
              <option value="medium">Medium (Seimbang)</option>
              <option value="high">Tinggi (Kualitas Terbaik)</option>
            </select>
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Resolusi Video
            </label>
            <select
              value={settings.resolution}
              onChange={(e) => handleSettingChange('resolution', e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="sd">SD (480p)</option>
              <option value="hd">HD (720p)</option>
              <option value="fullhd">Full HD (1080p)</option>
            </select>
          </div>

          {/* Frame Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Frame Rate (FPS)
            </label>
            <select
              value={settings.frameRate}
              onChange={(e) => handleSettingChange('frameRate', parseInt(e.target.value))}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={24}>24 FPS (Sinematik)</option>
              <option value={30}>30 FPS (Standar Medsos)</option>
              <option value={60}>60 FPS (Sangat Halus)</option>
            </select>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aspect Ratio
              <span className="ml-1 text-xs text-gray-500">(Platform Optimization)</span>
            </label>
            <select
              value={settings.aspectRatio}
              onChange={(e) => handleSettingChange('aspectRatio', e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="original">Original (Keep Source)</option>
              <option value="tiktok">TikTok (9:16 Vertical)</option>
              <option value="instagram_reels">Instagram Reels (9:16)</option>
              <option value="instagram_square">Instagram Feed (1:1 Square)</option>
              <option value="youtube">YouTube (16:9 Horizontal)</option>
              <option value="youtube_shorts">YouTube Shorts (9:16)</option>
            </select>
          </div>
        </div>

        {/* Duration Control */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Video Duration
          </label>
          {settings.audioMode === 'voiceover' && (
            <div className="mb-3 p-2 bg-purple-50 border border-purple-200 rounded text-xs text-purple-700">
              Duration is automatically matched to voice over files in Voice Over mode
            </div>
          )}
          <div className="space-y-3">
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="original"
                  checked={settings.durationType === 'original'}
                  onChange={(e) => handleSettingChange('durationType', e.target.value)}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Original/Random (Follow mixed video length)</span>
              </label>
            </div>
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="fixed"
                  checked={settings.durationType === 'fixed'}
                  onChange={(e) => handleSettingChange('durationType', e.target.value)}
                  disabled={settings.audioMode === 'voiceover'}
                  className="mr-2 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className="text-sm text-gray-700">Fixed Duration</span>
              </label>
              {settings.durationType === 'fixed' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="5"
                    max="300"
                    value={settings.fixedDuration}
                    onChange={(e) => handleSettingChange('fixedDuration', parseInt(e.target.value))}
                    className="w-20 px-2 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-sm text-gray-600">seconds</span>
                  <div className="flex space-x-1 ml-4">
                    <button
                      type="button"
                      onClick={() => handleSettingChange('fixedDuration', 15)}
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      15s
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSettingChange('fixedDuration', 30)}
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      30s
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSettingChange('fixedDuration', 60)}
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      60s
                    </button>
                  </div>
                </div>
              )}
            </div>
            {settings.durationType === 'fixed' && (
              <div className="mt-4 space-y-3 p-3 bg-gray-50 rounded-lg">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.smartTrimming || false}
                    onChange={(e) => handleSettingChange('smartTrimming', e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Smart Duration Distribution
                  </span>
                  <span className="text-xs text-gray-500">
                    (Intelligently distribute duration across clips)
                  </span>
                </label>

                {settings.smartTrimming && (
                  <div className="ml-6 space-y-2">
                    <label className="block text-xs font-medium text-gray-600">
                      Distribution Mode:
                    </label>
                    <select
                      value={settings.durationDistributionMode || 'proportional'}
                      onChange={(e) => handleSettingChange('durationDistributionMode', e.target.value)}
                      className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="proportional">Proportional - Maintain relative durations</option>
                      <option value="equal">Equal - Same duration for each clip</option>
                      <option value="weighted">Weighted - Prioritize first & last clips</option>
                    </select>
                    <p className="text-xs text-gray-500">
                      Each clip will be trimmed to fit the {settings.fixedDuration}s target duration
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Audio Settings */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Audio Settings
          </label>
          <div className="space-y-3">
            <div className="flex items-center">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="keep"
                  checked={settings.audioMode === 'keep'}
                  onChange={(e) => {
                    handleSettingChange('audioMode', e.target.value);
                    handleSettingChange('voiceOverMode', false);
                  }}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  <svg className="inline w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                  Keep Original Audio
                </span>
              </label>
            </div>
            <div className="flex items-center">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="mute"
                  checked={settings.audioMode === 'mute'}
                  onChange={(e) => {
                    handleSettingChange('audioMode', e.target.value);
                    handleSettingChange('voiceOverMode', false);
                  }}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  <svg className="inline w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                  Mute All (Remove Audio)
                </span>
              </label>
            </div>
          </div>
          {settings.audioMode !== 'voiceover' && (
            <p className="mt-2 text-xs text-gray-500">
              Choose whether to keep original audio or remove all audio from output videos
            </p>
          )}
        </div>
      </div>

      {/* Variant Estimation */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900">Estimated Variants</p>
            <p className="text-2xl font-bold text-blue-600">
              {variantEstimate.toLocaleString()} possible combinations
            </p>
          </div>

          <div className="ml-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Generate Count
            </label>
            <input
              type="number"
              min="1"
              max={Math.min(variantEstimate, 1000)}
              value={settings.outputCount}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty value while typing, or valid numbers
                if (value === '') {
                  handleSettingChange('outputCount', '');
                } else {
                  const numValue = parseInt(value);
                  if (!isNaN(numValue) && numValue >= 0) {
                    handleSettingChange('outputCount', numValue);
                  }
                }
              }}
              onBlur={(e) => {
                // Enforce minimum value when user leaves the field
                const value = parseInt(e.target.value);
                if (isNaN(value) || value < 1) {
                  handleSettingChange('outputCount', 1);
                }
              }}
              className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Warning for low video count */}
      {videoCount < 2 && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex">
            <svg className="h-5 w-5 text-yellow-400 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                Minimum 2 videos required for mixing. Currently: {videoCount} video{videoCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end">
        <div className="flex flex-col items-end">
          {/* Credit Information Display */}
          {creditEstimate.loading ? (
            <div className="mb-2 text-sm text-gray-500">
              Calculating credits...
            </div>
          ) : creditEstimate.creditsRequired > 0 ? (
            <div className="mb-2">
              <div className="text-sm flex items-center">
                <span className="text-gray-600">Cost: </span>
                <span className={`font-semibold mx-1 ${creditEstimate.hasEnoughCredits ? 'text-green-600' : 'text-red-600'}`}>
                  {creditEstimate.creditsRequired} credits
                </span>
                <span className="text-gray-500">
                  (Have: {creditEstimate.userCredits})
                </span>
                {/* Credit Breakdown Tooltip */}
                <div className="group relative ml-2">
                  <svg className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <div className="absolute right-0 w-64 p-3 mt-1 text-xs bg-gray-900 text-white rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                    <div className="font-semibold mb-2">Credit Calculation:</div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>Base cost ({settings.outputCount} outputs):</span>
                        <span>{settings.outputCount} credits</span>
                      </div>
                      {creditEstimate.breakdown?.multipliers ? (
                        <>
                          {creditEstimate.breakdown.multipliers.volume ? (
                            <div className="flex justify-between text-green-300">
                              <span>Volume Discount:</span>
                              <span>{(() => {
                                const value = typeof creditEstimate.breakdown.multipliers.volume === 'object' && creditEstimate.breakdown.multipliers.volume?.value
                                  ? creditEstimate.breakdown.multipliers.volume.value
                                  : creditEstimate.breakdown.multipliers.volume || 1;
                                const discount = (1 - value) * 100;
                                return discount > 0 ? `-${discount.toFixed(0)}%` : 'x' + value;
                              })()}</span>
                            </div>
                          ) : null}
                          {creditEstimate.breakdown.multipliers.complexity ? (
                            <div className="flex justify-between text-purple-300">
                              <span>Complexity Factor:</span>
                              <span>x{
                                typeof creditEstimate.breakdown.multipliers.complexity === 'object' && creditEstimate.breakdown.multipliers.complexity?.value
                                  ? creditEstimate.breakdown.multipliers.complexity.value
                                  : creditEstimate.breakdown.multipliers.complexity || 1
                              }</span>
                            </div>
                          ) : null}
                          {creditEstimate.breakdown.multipliers.serverLoad ? (
                            <div className="flex justify-between text-orange-300">
                              <span>Server Load:</span>
                              <span>x{
                                typeof creditEstimate.breakdown.multipliers.serverLoad === 'object' && creditEstimate.breakdown.multipliers.serverLoad?.value
                                  ? creditEstimate.breakdown.multipliers.serverLoad.value
                                  : creditEstimate.breakdown.multipliers.serverLoad || 1
                              }</span>
                            </div>
                          ) : null}
                          {creditEstimate.breakdown.multipliers.quality ? (
                            <div className="flex justify-between text-blue-300">
                              <span>Quality Settings:</span>
                              <span>x{
                                typeof creditEstimate.breakdown.multipliers.quality === 'object' && creditEstimate.breakdown.multipliers.quality?.value
                                  ? creditEstimate.breakdown.multipliers.quality.value
                                  : creditEstimate.breakdown.multipliers.quality || 1
                              }</span>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                      <div className="border-t border-gray-600 pt-1 mt-1">
                        <div className="flex justify-between font-semibold">
                          <span>Total:</span>
                          <span>{creditEstimate.creditsRequired} credits</span>
                        </div>
                      </div>
                    </div>
                    {creditEstimate.breakdown?.antiFingerprintingStrength ? (
                      <div className="mt-2 pt-2 border-t border-gray-600 text-green-300">
                        Anti-fingerprinting: {creditEstimate.breakdown.antiFingerprintingStrength}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              {creditEstimate.breakdown?.antiFingerprintingStrength ? (
                <div className="text-xs text-gray-400 mt-1">
                  Anti-fingerprinting: {creditEstimate.breakdown.antiFingerprintingStrength}
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            onClick={() => {
              if (!creditEstimate.hasEnoughCredits && videoCount >= 2) {
                showCreditWarning(creditEstimate.creditsRequired, creditEstimate.userCredits);
              } else {
                onStartProcessing();
              }
            }}
            disabled={videoCount < 2}
            className={`px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              videoCount < 2
                ? 'bg-gray-400 cursor-not-allowed'
                : !creditEstimate.hasEnoughCredits
                ? 'bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500'
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
            }`}
            title={
              !creditEstimate.hasEnoughCredits && videoCount >= 2
                ? `Insufficient credits. Need ${creditEstimate.creditsRequired}, have ${creditEstimate.userCredits}. Click to buy credits.`
                : ''
            }
          >
            {creditEstimate.loading ? (
              'Calculating...'
            ) : (
              `Start Processing (${settings.outputCount} videos${creditEstimate.creditsRequired > 0 ? ` - ${creditEstimate.creditsRequired} credits` : ''})`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProcessingSettings;