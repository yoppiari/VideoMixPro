import * as fs from 'fs';
import logger from '@/utils/logger';

export interface VideoClip {
  id: string;
  path: string;
  duration: number;
  metadata: any;
  originalName?: string;
  order?: number;
  groupId?: string;
}

export interface VideoGroup {
  id: string;
  name: string;
  order: number;
  videos: VideoClip[];
}

export interface MixingSettings {
  // Mixing Options
  orderMixing: boolean;
  speedMixing: boolean;
  differentStartingVideo: boolean;
  speedRange: {
    min: number; // e.g., 0.5
    max: number; // e.g., 2.0
  };
  allowedSpeeds: number[]; // e.g., [0.5, 0.75, 1, 1.25, 1.5, 2]

  // Group Mixing
  groupMixing: boolean;
  groupMixingMode: 'strict' | 'random';

  // Transition Variations
  transitionMixing: boolean;
  transitionTypes: string[];
  transitionDuration: {
    min: number;
    max: number;
  };

  // Color Variations
  colorVariations: boolean;
  colorIntensity: 'low' | 'medium' | 'high';

  // Video Quality
  metadataSource: 'normal' | 'capcut' | 'vn' | 'inshot';
  bitrate: 'low' | 'medium' | 'high';
  resolution: 'sd' | 'hd' | 'fullhd';
  frameRate: 24 | 30 | 60;

  // Aspect Ratio
  aspectRatio?: 'original' | 'tiktok' | 'instagram_reels' | 'instagram_square' | 'youtube' | 'youtube_shorts';

  // Duration
  durationType?: 'original' | 'fixed';
  fixedDuration?: number; // in seconds
  durationDistributionMode?: 'proportional' | 'equal' | 'weighted'; // How to distribute duration
  smartTrimming?: boolean; // Enable intelligent duration distribution

  // Audio
  audioMode?: 'keep' | 'mute';

  // Output
  outputCount: number;
}

export interface VideoVariant {
  id: string;
  videoOrder: string[]; // Array of video IDs in order
  speeds: Map<string, number>; // Video ID -> speed multiplier
  transitions: string[]; // Transition type for each cut point
  colorAdjustments: {
    brightness: number;
    contrast: number;
    saturation: number;
    hue: number;
  };
  settings: MixingSettings;
}

interface ClipDurationInfo {
  clipId: string;
  originalDuration: number;
  speedMultiplier: number;
  adjustedDuration: number; // Duration after speed adjustment
  targetDuration: number;    // Target duration after smart distribution
  trimStart: number;         // Where to start trimming
  trimEnd: number;           // Where to end trimming
}

export class AutoMixingService {
  /**
   * Calculate smart duration distribution for clips
   */
  private calculateSmartDurations(
    clips: VideoClip[],
    targetDuration: number,
    speeds: Map<string, number>,
    distributionMode: 'proportional' | 'equal' | 'weighted' = 'proportional'
  ): Map<string, ClipDurationInfo> {
    const durations = new Map<string, ClipDurationInfo>();

    // Step 1: Calculate adjusted durations after speed effects
    let totalAdjustedDuration = 0;
    const clipInfos: ClipDurationInfo[] = [];

    for (const clip of clips) {
      const speed = speeds.get(clip.id) || 1;
      const adjustedDuration = clip.duration / speed;
      totalAdjustedDuration += adjustedDuration;

      clipInfos.push({
        clipId: clip.id,
        originalDuration: clip.duration,
        speedMultiplier: speed,
        adjustedDuration,
        targetDuration: 0, // Will be calculated
        trimStart: 0,
        trimEnd: 0
      });
    }

    // Step 2: Distribute target duration based on mode
    if (distributionMode === 'equal') {
      // Equal distribution: each clip gets equal duration
      const equalDuration = targetDuration / clips.length;
      for (const info of clipInfos) {
        info.targetDuration = equalDuration;
      }
    } else if (distributionMode === 'proportional') {
      // Proportional distribution: maintain relative durations
      const scaleFactor = targetDuration / totalAdjustedDuration;
      for (const info of clipInfos) {
        info.targetDuration = info.adjustedDuration * scaleFactor;
      }
    } else if (distributionMode === 'weighted') {
      // Weighted distribution: prioritize first and last clips
      const weights = clips.map((_, index) => {
        if (index === 0 || index === clips.length - 1) return 1.5;
        return 1.0;
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);

      for (let i = 0; i < clipInfos.length; i++) {
        clipInfos[i].targetDuration = (weights[i] / totalWeight) * targetDuration;
      }
    }

    // Step 3: Calculate trim points with validation
    for (const info of clipInfos) {
      // Center the trim in the middle of the clip if possible
      const excessDuration = info.adjustedDuration - info.targetDuration;
      if (excessDuration > 0) {
        // Need to trim - center in the middle
        info.trimStart = excessDuration / 2;
        info.trimEnd = info.trimStart + info.targetDuration;
      } else {
        // No trim needed, use full clip
        info.trimStart = 0;
        info.trimEnd = info.adjustedDuration;
        // Note: If clip is shorter than target, it will be used fully
      }

      // Convert trim points back to original time (before speed adjustment)
      info.trimStart = info.trimStart * info.speedMultiplier;
      info.trimEnd = info.trimEnd * info.speedMultiplier;

      // CRITICAL: Validate trim values are within bounds
      const originalDuration = info.originalDuration;
      if (info.trimEnd > originalDuration) {
        logger.warn(`[Smart Duration] Clip ${info.clipId} trim end (${info.trimEnd}s) exceeds duration (${originalDuration}s), adjusting...`);
        info.trimEnd = originalDuration;
        // Adjust start if needed to maintain some duration
        if (info.trimStart >= info.trimEnd - 0.1) {
          info.trimStart = Math.max(0, info.trimEnd - Math.min(info.targetDuration, originalDuration));
        }
      }

      // Ensure minimum duration
      if (info.trimEnd - info.trimStart < 0.1) {
        logger.warn(`[Smart Duration] Clip ${info.clipId} duration too short, using full clip`);
        info.trimStart = 0;
        info.trimEnd = originalDuration;
      }

      durations.set(info.clipId, info);
      logger.info(`[Smart Duration] Clip ${info.clipId}: trim=${info.trimStart.toFixed(2)}:${info.trimEnd.toFixed(2)}, original=${originalDuration.toFixed(2)}s, target=${info.targetDuration.toFixed(2)}s`);
    }

    return durations;
  }

  /**
   * Build smart filter complex with intelligent duration distribution
   */
  private buildSmartFilterComplex(
    variant: VideoVariant,
    clips: VideoClip[],
    durations: Map<string, ClipDurationInfo>
  ): string[] {
    const filters: string[] = [];
    const processedVideos: string[] = [];

    // Process each video with smart trimming
    variant.videoOrder.forEach((videoId, index) => {
      const clip = clips.find(c => c.id === videoId);
      const durationInfo = durations.get(videoId);

      if (!clip || !durationInfo) return;

      // Apply trim to achieve target duration
      let filterChain = `[${index}:v]`;

      // Smart trim based on calculated durations
      if (durationInfo.trimStart > 0 || durationInfo.trimEnd < clip.duration) {
        filterChain += `trim=${durationInfo.trimStart}:${durationInfo.trimEnd},setpts=PTS-STARTPTS,`;
      }

      // Apply speed if needed
      const speed = variant.speeds.get(videoId) || 1;
      if (speed !== 1) {
        filterChain += `setpts=${1/speed}*PTS,`;
      }

      // Apply other filters (scale, color, etc.)
      const { finalWidth, finalHeight } = this.getOutputDimensions(variant.settings.aspectRatio, variant.settings.resolution);
      filterChain += `scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease,`;
      filterChain += `pad=${finalWidth}:${finalHeight}:(ow-iw)/2:(oh-ih)/2:black`;

      // Output to labeled stream
      filterChain += `[v${index}]`;
      filters.push(filterChain);
      processedVideos.push(`[v${index}]`);
    });

    // Concatenate processed videos
    if (processedVideos.length > 0) {
      const concatFilter = `${processedVideos.join('')}concat=n=${processedVideos.length}:v=1:a=0[outv]`;
      filters.push(concatFilter);
    }

    return filters;
  }

  /**
   * Generate variants for group-based mixing
   */
  private generateGroupBasedVariants(
    groups: VideoGroup[],
    settings: MixingSettings,
    outputCount: number
  ): string[][] {
    const variants: string[][] = [];
    const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

    if (settings.groupMixingMode === 'strict') {
      // Strict order: maintain group sequence
      for (let i = 0; i < outputCount; i++) {
        const variant: string[] = [];

        for (const group of sortedGroups) {
          if (group.videos.length > 0) {
            // Pick random video from group
            const randomVideo = group.videos[Math.floor(Math.random() * group.videos.length)];
            variant.push(randomVideo.id);
          }
        }

        if (variant.length > 0) {
          variants.push(variant);
        }
      }
    } else {
      // Random mode: completely randomize groups and videos
      for (let i = 0; i < outputCount; i++) {
        const variant: string[] = [];
        const shuffledGroups = this.shuffleArray([...sortedGroups]);

        for (const group of shuffledGroups) {
          if (group.videos.length > 0) {
            const randomVideo = group.videos[Math.floor(Math.random() * group.videos.length)];
            variant.push(randomVideo.id);
          }
        }

        if (variant.length > 0) {
          variants.push(variant);
        }
      }
    }

    return variants;
  }

  /**
   * Generate all possible order permutations of videos
   */
  private generateOrderPermutations(videos: VideoClip[]): string[][] {
    if (videos.length === 0) return [];
    if (videos.length === 1) return [[videos[0].id]];

    const permutations: string[][] = [];

    const permute = (arr: string[], m: string[] = []) => {
      if (arr.length === 0) {
        permutations.push(m);
      } else {
        for (let i = 0; i < arr.length; i++) {
          const curr = arr.slice();
          const next = curr.splice(i, 1);
          permute(curr.slice(), m.concat(next));
        }
      }
    };

    permute(videos.map(v => v.id));
    return permutations;
  }

  /**
   * Generate speed combinations for videos
   */
  private generateSpeedCombinations(
    videos: VideoClip[],
    allowedSpeeds: number[]
  ): Map<string, number>[] {
    const combinations: Map<string, number>[] = [];

    // Generate all possible speed combinations
    const generateCombos = (index: number, current: Map<string, number>) => {
      if (index === videos.length) {
        combinations.push(new Map(current));
        return;
      }

      for (const speed of allowedSpeeds) {
        current.set(videos[index].id, speed);
        generateCombos(index + 1, current);
      }
    };

    generateCombos(0, new Map());
    return combinations;
  }

  /**
   * Calculate total possible variants
   */
  public calculateVariantCount(
    videoCount: number,
    settings: MixingSettings
  ): number {
    let totalVariants = 1;

    // Order permutations (n!)
    if (settings.orderMixing) {
      let factorial = 1;
      for (let i = 2; i <= videoCount; i++) {
        factorial *= i;
      }
      totalVariants *= factorial;
    }

    // Speed combinations (speeds^videos)
    if (settings.speedMixing) {
      const speedCount = settings.allowedSpeeds.length;
      totalVariants *= Math.pow(speedCount, videoCount);
    }

    return totalVariants;
  }

  /**
   * Generate video variants based on settings (with optional groups)
   */
  public async generateVariants(
    videos: VideoClip[],
    settings: MixingSettings,
    groups?: VideoGroup[]
  ): Promise<VideoVariant[]> {
    try {
      const variants: VideoVariant[] = [];

      logger.info(`[Variant Generation] Starting with ${videos.length} videos`);
      videos.forEach((v, idx) => {
        logger.info(`[Variant Generation] Video ${idx + 1}: ${v.originalName} (ID: ${v.id})`);
      });

      // Validate minimum videos
      if (videos.length < 2) {
        throw new Error('Minimum 2 videos required for mixing');
      }

      // Get all possible orders
      let orders: string[][] = [videos.map(v => v.id)]; // Default order
      logger.info(`[Variant Generation] Default order: [${orders[0].join(', ')}]`);

      // Check if group-based mixing should be used
      if (settings.groupMixing && groups && groups.length > 0) {
        // Use group-based generation
        orders = this.generateGroupBasedVariants(groups, settings, settings.outputCount);
      } else if (settings.orderMixing) {
        orders = this.generateOrderPermutations(videos);

        // If different starting video is enabled, filter to ensure unique starting videos
        if (settings.differentStartingVideo && orders.length > 1) {
          // Group permutations by their starting video
          const groupedByStart = new Map<string, string[][]>();

          for (const order of orders) {
            const startVideo = order[0];
            if (!groupedByStart.has(startVideo)) {
              groupedByStart.set(startVideo, []);
            }
            groupedByStart.get(startVideo)!.push(order);
          }

          // Select permutations ensuring different starting videos
          const filteredOrders: string[][] = [];
          const permsPerVideo = Math.ceil(settings.outputCount / videos.length);

          for (const [startVideo, perms] of groupedByStart.entries()) {
            // Take up to permsPerVideo from each starting video group
            const selectedPerms = this.shuffleArray(perms).slice(0, permsPerVideo);
            filteredOrders.push(...selectedPerms);

            // Stop if we have enough
            if (filteredOrders.length >= settings.outputCount) {
              break;
            }
          }

          orders = filteredOrders;
        }
      }

      // Get all possible speed combinations
      let speedCombos: Map<string, number>[] = [new Map()]; // Default speeds (1x)
      if (settings.speedMixing) {
        speedCombos = this.generateSpeedCombinations(videos, settings.allowedSpeeds);
      } else {
        // Set all speeds to 1x if speed mixing is disabled
        const defaultSpeeds = new Map<string, number>();
        videos.forEach(v => defaultSpeeds.set(v.id, 1));
        speedCombos = [defaultSpeeds];
      }

      // Generate all combinations
      let variantId = 0;
      for (const order of orders) {
        for (const speeds of speedCombos) {
          // Generate transitions if enabled
          const transitions = settings.transitionMixing
            ? this.generateTransitions(videos.length, settings.transitionTypes)
            : [];

          // Generate color adjustments if enabled
          const colorAdjustments = settings.colorVariations
            ? this.generateColorAdjustments(settings.colorIntensity)
            : { brightness: 0, contrast: 1, saturation: 1, hue: 0 };

          variants.push({
            id: `variant-${variantId++}`,
            videoOrder: order,
            speeds,
            transitions,
            colorAdjustments,
            settings
          });

          // Stop if we've generated enough variants
          if (variants.length >= settings.outputCount) {
            break;
          }
        }
        if (variants.length >= settings.outputCount) {
          break;
        }
      }

      // Select variants ensuring different starting videos when enabled
      if (variants.length > settings.outputCount) {
        if (settings.differentStartingVideo) {
          // Group variants by their starting video ID
          const groupedByStartVideo = new Map<string, VideoVariant[]>();

          for (const variant of variants) {
            const startVideoId = variant.order[0];
            if (!groupedByStartVideo.has(startVideoId)) {
              groupedByStartVideo.set(startVideoId, []);
            }
            groupedByStartVideo.get(startVideoId)!.push(variant);
          }

          // Round-robin selection from each starting video group
          const selectedVariants: VideoVariant[] = [];
          const groups = Array.from(groupedByStartVideo.values());

          // Shuffle within each group for variety
          for (const group of groups) {
            this.shuffleArray(group);
          }

          // Round-robin selection
          let groupIndex = 0;
          const groupPointers = new Array(groups.length).fill(0);

          while (selectedVariants.length < settings.outputCount) {
            const currentGroup = groups[groupIndex];
            const pointer = groupPointers[groupIndex];

            // If this group still has variants to offer
            if (pointer < currentGroup.length) {
              selectedVariants.push(currentGroup[pointer]);
              groupPointers[groupIndex]++;
            }

            // Move to next group (round-robin)
            groupIndex = (groupIndex + 1) % groups.length;

            // Check if all groups are exhausted
            const allExhausted = groupPointers.every((ptr, idx) => ptr >= groups[idx].length);
            if (allExhausted) {
              break;
            }
          }

          // Log detailed selection info
          const startingVideos = selectedVariants.map(v => v.order[0]);
          const uniqueStarts = new Set(startingVideos);
          logger.info(`[AutoMixing] Selected ${selectedVariants.length} variants with ${uniqueStarts.size} unique starting videos from ${groups.length} groups`);
          logger.info(`[AutoMixing] Starting video distribution:`, Array.from(uniqueStarts).join(', '));
          return selectedVariants;
        } else {
          // Original logic: random shuffle
          const shuffled = this.shuffleArray(variants);
          return shuffled.slice(0, settings.outputCount);
        }
      }

      return variants;
    } catch (error) {
      logger.error('Error generating variants:', error);
      throw error;
    }
  }

  /**
   * Get metadata injection based on source
   */
  public getMetadataInjection(source: string): Record<string, string> {
    switch (source) {
      case 'capcut':
        return {
          encoder: 'CapCut',
          software: 'CapCut for Windows',
          creation_time: new Date().toISOString(),
          handler_name: 'CapCut'
        };

      case 'vn':
        return {
          encoder: 'VN Video Editor',
          software: 'VN - Video Editor & Maker',
          comment: 'Made with VN',
          handler_name: 'VN Editor'
        };

      case 'inshot':
        return {
          encoder: 'InShot',
          software: 'InShot Video Editor',
          handler_name: 'InShot Inc.',
          comment: 'Created with InShot'
        };

      case 'normal':
      default:
        return {};
    }
  }

  /**
   * Get bitrate value based on quality setting
   */
  public getBitrateValue(quality: string): string {
    switch (quality) {
      case 'low':
        return '1M'; // 1 Mbps
      case 'high':
        return '8M'; // 8 Mbps
      case 'medium':
      default:
        return '4M'; // 4 Mbps
    }
  }

  /**
   * Get resolution dimensions
   */
  public getResolutionDimensions(resolution: string): { width: number; height: number } {
    switch (resolution) {
      case 'sd':
        return { width: 854, height: 480 };
      case 'fullhd':
        return { width: 1920, height: 1080 };
      case 'hd':
      default:
        return { width: 1280, height: 720 };
    }
  }

  /**
   * Get aspect ratio dimensions and filter
   */
  public getAspectRatioSettings(aspectRatio: string): {
    width: number;
    height: number;
    filter: string;
  } {
    switch (aspectRatio) {
      case 'tiktok':
      case 'instagram_reels':
      case 'youtube_shorts':
        // 9:16 vertical
        return {
          width: 1080,
          height: 1920,
          filter: 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black'
        };

      case 'instagram_square':
        // 1:1 square
        return {
          width: 1080,
          height: 1080,
          filter: 'crop=min(iw\\,ih):min(iw\\,ih)'
        };

      case 'youtube':
        // 16:9 horizontal
        return {
          width: 1920,
          height: 1080,
          filter: 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black'
        };

      case 'original':
      default:
        // Keep original, no filter needed
        return {
          width: 0,
          height: 0,
          filter: ''
        };
    }
  }

  /**
   * Build FFmpeg command for a variant
   */
  public buildFFmpegCommand(
    variant: VideoVariant,
    videos: VideoClip[],
    outputPath: string
  ): string[] {
    const commands: string[] = [];
    const videoMap = new Map(videos.map(v => [v.id, v]));

    // Enhanced logging for debugging
    logger.info(`[FFmpeg Build] Starting command build for variant ${variant.id}`);
    logger.info(`[FFmpeg Build] Total videos provided: ${videos.length}`);
    logger.info(`[FFmpeg Build] Video order in variant: ${variant.videoOrder.length} videos - [${variant.videoOrder.join(', ')}]`);
    logger.info(`[FFmpeg Build] Video map contains: ${videoMap.size} videos`);

    // Validate all videos exist - DO NOT FILTER, THROW ERRORS
    const validatedVideos: VideoClip[] = [];
    const validationIssues: string[] = [];
    let allVideosValid = true;

    variant.videoOrder.forEach((id, idx) => {
      const video = videoMap.get(id);
      logger.info(`[FFmpeg Build] Validating video ${idx + 1}/${variant.videoOrder.length}: ID=${id}`);

      if (!video) {
        const issue = `Video ${idx + 1}: ID '${id}' not found in video map (map has: ${Array.from(videoMap.keys()).join(', ')})`;
        validationIssues.push(issue);
        logger.error(`[FFmpeg Build] ${issue}`);
        allVideosValid = false;
      } else {
        // Check if file exists
        const fileExists = fs.existsSync(video.path);
        logger.info(`[FFmpeg Build] Video ${idx + 1}: ${video.originalName || 'unnamed'} - Path: ${video.path}, Exists: ${fileExists}, Duration: ${video.duration}s`);

        if (!fileExists) {
          const issue = `Video ${idx + 1}: File not found - ${video.originalName || 'unnamed'} at path: ${video.path}`;
          validationIssues.push(issue);
          logger.error(`[FFmpeg Build] ${issue}`);
          allVideosValid = false;
        } else {
          validatedVideos.push(video);
        }
      }
    });

    // Report validation results
    logger.info(`[FFmpeg Build] Validation complete: ${validatedVideos.length}/${variant.videoOrder.length} videos valid`);

    // IMPORTANT: Throw error if ANY video is invalid - don't proceed with partial set
    if (!allVideosValid || validationIssues.length > 0) {
      const errorMsg = `Cannot process videos - validation failed!\n` +
                      `Expected: ${variant.videoOrder.length} videos\n` +
                      `Valid: ${validatedVideos.length} videos\n` +
                      `Issues:\n${validationIssues.join('\n')}\n\n` +
                      `Please ensure all video files exist and are accessible.`;
      logger.error(`[FFmpeg Build] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    if (validatedVideos.length < 2) {
      throw new Error(`Minimum 2 videos required for mixing. Found: ${validatedVideos.length}`);
    }

    // Use validatedVideos instead of the filtered validVideos
    const actualVideoCount = validatedVideos.length;
    logger.info(`[FFmpeg Build] Proceeding with ${actualVideoCount} videos for concatenation`);

    // Build input files
    const inputs: string[] = [];
    const filters: string[] = [];

    // Get target resolution and frame rate
    const targetDimensions = this.getResolutionDimensions(variant.settings.resolution);
    const targetFPS = variant.settings.frameRate;

    // Track which videos have audio
    const hasAudioTrack: boolean[] = [];

    // Check if smart duration distribution should be used
    let durationInfoMap: Map<string, ClipDurationInfo> | null = null;
    if (variant.settings.smartTrimming &&
        variant.settings.durationType === 'fixed' &&
        variant.settings.fixedDuration) {

      // Calculate smart duration distribution
      const orderedClips = variant.videoOrder.map(id => videoMap.get(id)!).filter(v => v);

      // IMPORTANT: Only use smart trimming if we have valid clips
      if (orderedClips.length === validatedVideos.length) {
        try {
          durationInfoMap = this.calculateSmartDurations(
            orderedClips,
            variant.settings.fixedDuration,
            variant.speeds,
            variant.settings.durationDistributionMode || 'proportional'
          );

          logger.info(`[Smart Trim] Using smart duration distribution: ${variant.settings.fixedDuration}s target, mode: ${variant.settings.durationDistributionMode}, videos: ${orderedClips.length}`);
        } catch (error) {
          logger.error(`[Smart Trim] Failed to calculate smart durations: ${error}`);
          logger.warn(`[Smart Trim] Falling back to fixed duration without smart trimming`);
          variant.settings.smartTrimming = false;
          durationInfoMap = null;
        }
      } else {
        logger.warn(`[Smart Trim] Clip count mismatch (ordered: ${orderedClips.length}, validated: ${validatedVideos.length}), falling back to fixed duration`);
        // Fall back to fixed duration without smart trimming
        variant.settings.smartTrimming = false;
      }
    }

    // Process validated videos in the order specified by variant
    validatedVideos.forEach((video, index) => {
      const videoId = video.id;
      logger.info(`[FFmpeg Build] Processing video ${index + 1}: ${video.originalName} (ID: ${videoId})`);

      inputs.push('-i', video.path);

      // Build filter chain for each video
      let videoFilterChain: string[] = [];

      // Apply smart trimming if enabled
      if (durationInfoMap) {
        const durationInfo = durationInfoMap.get(videoId);
        if (durationInfo) {
          // Validate trim values to ensure they're within video bounds
          const safeStart = Math.max(0, Math.min(durationInfo.trimStart, video.duration - 0.1));
          const safeEnd = Math.min(video.duration, Math.max(durationInfo.trimEnd, safeStart + 0.1));

          // Only apply trim if it's meaningful (not the full video)
          if (safeStart > 0.01 || safeEnd < video.duration - 0.01) {
            videoFilterChain.push(`trim=${safeStart}:${safeEnd}`);
            videoFilterChain.push(`setpts=PTS-STARTPTS`);
            logger.info(`[Smart Trim] ${video.originalName}: trim=${safeStart.toFixed(2)}:${safeEnd.toFixed(2)} (duration: ${video.duration}s, target: ${durationInfo.targetDuration.toFixed(2)}s)`);
          } else {
            logger.info(`[Smart Trim] ${video.originalName}: Using full video (duration: ${video.duration}s)`);
          }
        } else {
          logger.warn(`[Smart Trim] No duration info for video ${videoId}, using full video`);
        }
      }

      // 1. Get aspect ratio settings if specified
      const aspectRatio = variant.settings.aspectRatio || 'original';
      const aspectSettings = this.getAspectRatioSettings(aspectRatio);

      // Determine final dimensions (aspect ratio takes precedence over resolution)
      let finalWidth = targetDimensions.width;
      let finalHeight = targetDimensions.height;

      if (aspectSettings.width > 0 && aspectSettings.height > 0) {
        // Use aspect ratio dimensions if specified
        finalWidth = aspectSettings.width;
        finalHeight = aspectSettings.height;
      }

      // 2. Apply scaling and padding to normalize all videos to the same dimensions
      // This ensures all videos have identical dimensions before concatenation
      videoFilterChain.push(`scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease`);
      videoFilterChain.push(`pad=${finalWidth}:${finalHeight}:(ow-iw)/2:(oh-ih)/2:black`);

      // 2. Normalize frame rate
      videoFilterChain.push(`fps=${targetFPS}`);

      // 3. Apply speed adjustment
      const speed = variant.speeds.get(videoId) || 1;
      if (speed !== 1) {
        videoFilterChain.push(`setpts=${1/speed}*PTS`);
      }

      // 4. Apply color adjustments
      if (variant.colorAdjustments && variant.settings.colorVariations) {
        const colorFilter = `eq=brightness=${variant.colorAdjustments.brightness}:contrast=${variant.colorAdjustments.contrast}:saturation=${variant.colorAdjustments.saturation},hue=h=${variant.colorAdjustments.hue}`;
        videoFilterChain.push(colorFilter);
      }

      // Build the complete video filter
      const videoFilter = videoFilterChain.join(',');
      filters.push(`[${index}:v]${videoFilter}[v${index}]`);

      // Audio processing (only if audio is kept)
      if (variant.settings.audioMode !== 'mute') {
        // Create audio filter with proper fallback for missing audio
        let audioFilter = '';

        // Check if video has audio (we'll assume it does for now, FFmpeg will handle missing audio)
        hasAudioTrack[index] = true;

        // Normalize audio to stereo 48kHz
        audioFilter = 'aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';

        // Apply speed adjustment to audio
        if (speed !== 1) {
          // atempo can only handle 0.5 to 2.0 range, chain multiple for larger changes
          let currentSpeed = speed;
          let tempoFilters: string[] = [];

          while (currentSpeed < 0.5 || currentSpeed > 2.0) {
            if (currentSpeed < 0.5) {
              tempoFilters.push('atempo=0.5');
              currentSpeed /= 0.5;
            } else {
              tempoFilters.push('atempo=2.0');
              currentSpeed /= 2.0;
            }
          }

          if (currentSpeed !== 1) {
            tempoFilters.push(`atempo=${currentSpeed}`);
          }

          if (tempoFilters.length > 0) {
            audioFilter = audioFilter + ',' + tempoFilters.join(',');
          }
        }

        // Use conditional audio with fallback
        // The '?' in [${index}:a?] means use if exists, otherwise ignore
        filters.push(`[${index}:a?]${audioFilter}[a${index}]`);
      }
    });

    // Concat videos - ensure proper stream mapping
    let finalVideoOutput = 'outv';
    // Use the actual number of validated videos for concatenation
    const concatenationVideoCount = validatedVideos.length;

    logger.info(`[FFmpeg Build] Concatenating ${concatenationVideoCount} videos (validated from ${variant.videoOrder.length} in variant order)`);

    if (variant.settings.audioMode === 'mute') {
      // Video-only concatenation
      const videoInputs = validatedVideos.map((_, i) => `[v${i}]`).join('');
      filters.push(`${videoInputs}concat=n=${concatenationVideoCount}:v=1:a=0[${finalVideoOutput}]`);
    } else {
      // Video and audio concatenation - ensure all streams are present
      const concatInputs = validatedVideos.map((_, i) => `[v${i}][a${i}]`).join('');
      filters.push(`${concatInputs}concat=n=${concatenationVideoCount}:v=1:a=1[${finalVideoOutput}][outa]`);
    }

    // Note: Aspect ratio already applied per video, no need to apply again after concatenation

    // Build FFmpeg command arguments (without 'ffmpeg' as it's the executable name)
    commands.push('-y'); // Overwrite output at the beginning

    // Add input validation
    commands.push('-loglevel', 'warning'); // Show warnings and errors
    commands.push('-stats'); // Show progress

    // Add thread optimization for better performance
    commands.push('-threads', '0'); // Auto-detect optimal thread count

    commands.push(...inputs);

    // Note: Removing stream_loop to avoid issues with video concatenation
    // Duration control will be handled after concatenation if needed

    // Add filter complex
    if (filters.length > 0) {
      commands.push('-filter_complex', filters.join(';'));
    }

    // Map outputs
    commands.push('-map', `[${finalVideoOutput}]`);
    if (variant.settings.audioMode !== 'mute') {
      commands.push('-map', '[outa]');
    }

    // Video settings - dimensions already normalized in filter, no need to specify again
    // The filter chain has already set the correct dimensions
    commands.push('-b:v', this.getBitrateValue(variant.settings.bitrate));
    commands.push('-r', variant.settings.frameRate.toString());

    // Apply duration control based on smartTrimming setting
    if (variant.settings.durationType === 'fixed' && variant.settings.fixedDuration) {
      if (!variant.settings.smartTrimming) {
        // When smart trimming is disabled, cut the final output to the specified duration
        commands.push('-t', variant.settings.fixedDuration.toString());
        logger.info(`[Duration Control] Applying fixed duration to final output: ${variant.settings.fixedDuration} seconds (smartTrimming: false)`);
      } else {
        logger.info(`[Duration Control] Smart trimming enabled - duration applied per video, not to final output`);
      }
    }

    // Add metadata
    const metadata = this.getMetadataInjection(variant.settings.metadataSource);
    for (const [key, value] of Object.entries(metadata)) {
      commands.push('-metadata', `${key}="${value}"`);
    }

    // Output settings - Determine quality based on settings
    commands.push('-c:v', 'libx264');

    // Adjust preset based on bitrate setting for better balance
    switch (variant.settings.bitrate) {
      case 'low':
        commands.push('-preset', 'faster');
        commands.push('-crf', '28'); // Lower quality, smaller file
        break;
      case 'high':
        commands.push('-preset', 'slow');
        commands.push('-crf', '18'); // Higher quality
        break;
      case 'medium':
      default:
        commands.push('-preset', 'medium');
        commands.push('-crf', '23'); // Balanced quality
        break;
    }

    // Audio codec or no audio
    if (variant.settings.audioMode === 'mute') {
      commands.push('-an'); // No audio
    } else {
      commands.push('-c:a', 'aac');
      commands.push('-b:a', '128k'); // Audio bitrate
      commands.push('-ar', '48000'); // Audio sample rate
      commands.push('-ac', '2'); // Stereo audio
    }

    // Add format flags for better compatibility
    commands.push('-movflags', '+faststart');
    commands.push('-pix_fmt', 'yuv420p'); // Ensure compatibility

    // Add keyframe interval for better seeking
    commands.push('-g', '250'); // GOP size
    commands.push('-keyint_min', '25');

    commands.push(outputPath);

    // Log the complete command for debugging
    logger.info('FFmpeg command arguments:', commands.join(' '));
    logger.info(`Output will contain ${actualVideoCount} concatenated videos`);

    // Final verification - ensure command has correct number of inputs
    const commandInputCount = commands.filter(arg => arg === '-i').length;
    if (commandInputCount !== actualVideoCount) {
      logger.error(`[FFmpeg Verification] Command input mismatch! Expected ${actualVideoCount} inputs, found ${commandInputCount}`);
      throw new Error(`FFmpeg command validation failed: input count mismatch (${commandInputCount} vs ${actualVideoCount})`);
    }

    logger.info(`[FFmpeg Verification] Command validated: ${commandInputCount} input videos confirmed`);

    return commands;
  }

  /**
   * Generate random transitions for video cuts
   */
  private generateTransitions(
    videoCount: number,
    transitionTypes: string[]
  ): string[] {
    const transitions: string[] = [];
    // n-1 transitions for n videos
    for (let i = 0; i < videoCount - 1; i++) {
      const randomIndex = Math.floor(Math.random() * transitionTypes.length);
      transitions.push(transitionTypes[randomIndex]);
    }
    return transitions;
  }

  /**
   * Generate color adjustments based on intensity
   */
  private generateColorAdjustments(intensity: 'low' | 'medium' | 'high') {
    const ranges = {
      low: { brightness: 0.05, contrast: 0.08, saturation: 0.1, hue: 3 },
      medium: { brightness: 0.1, contrast: 0.15, saturation: 0.2, hue: 5 },
      high: { brightness: 0.15, contrast: 0.2, saturation: 0.3, hue: 8 }
    };

    const range = ranges[intensity];

    return {
      brightness: (Math.random() * 2 - 1) * range.brightness, // -range to +range
      contrast: 1 + (Math.random() * 2 - 1) * range.contrast,  // 1-range to 1+range
      saturation: 1 + (Math.random() * 2 - 1) * range.saturation,
      hue: (Math.random() * 2 - 1) * range.hue
    };
  }

  /**
   * Get transition filter for FFmpeg
   */
  private getTransitionFilter(
    transition: string,
    duration: number,
    offset: number
  ): string {
    switch (transition) {
      case 'fade':
        return `xfade=transition=fade:duration=${duration}:offset=${offset}`;
      case 'dissolve':
        return `xfade=transition=dissolve:duration=${duration}:offset=${offset}`;
      case 'wipe':
        const direction = ['left', 'right', 'up', 'down'][Math.floor(Math.random() * 4)];
        return `xfade=transition=wipe${direction}:duration=${duration}:offset=${offset}`;
      case 'slide':
        const slideDir = ['left', 'right', 'up', 'down'][Math.floor(Math.random() * 4)];
        return `xfade=transition=slide${slideDir}:duration=${duration}:offset=${offset}`;
      case 'zoom':
        return `xfade=transition=circlecrop:duration=${duration}:offset=${offset}`;
      case 'blur':
        return `xfade=transition=fadeblack:duration=${duration}:offset=${offset}`;
      default:
        return ''; // No transition (hard cut)
    }
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}