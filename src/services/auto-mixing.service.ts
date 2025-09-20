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

export class AutoMixingService {
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

      // Validate minimum videos
      if (videos.length < 2) {
        throw new Error('Minimum 2 videos required for mixing');
      }

      // Get all possible orders
      let orders: string[][] = [videos.map(v => v.id)]; // Default order

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

      // Randomly select requested number of variants
      if (variants.length > settings.outputCount) {
        // Shuffle and take first outputCount items
        const shuffled = this.shuffleArray(variants);
        return shuffled.slice(0, settings.outputCount);
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

    // Log video order for debugging
    logger.info(`Building FFmpeg command for ${variant.videoOrder.length} videos`);

    // Validate all videos exist
    const validVideos: VideoClip[] = [];
    const missingVideos: string[] = [];

    variant.videoOrder.forEach((id, idx) => {
      const video = videoMap.get(id);
      if (video) {
        // Check if file exists
        if (!fs.existsSync(video.path)) {
          missingVideos.push(`${video.originalName || video.path} (${video.path})`);
          logger.error(`Video file not found: ${video.path}`);
        } else {
          logger.info(`Video ${idx + 1}: ${video.originalName || video.path} (Duration: ${video.duration}s, Path: ${video.path})`);
          validVideos.push(video);
        }
      } else {
        missingVideos.push(`Video ID: ${id}`);
        logger.error(`Video ID ${id} not found in video map`);
      }
    });

    // Throw detailed error if videos are missing
    if (missingVideos.length > 0) {
      throw new Error(`Cannot process videos. Missing files:\n${missingVideos.join('\n')}\n\nPlease ensure all video files exist and are accessible.`);
    }

    if (validVideos.length < 2) {
      throw new Error(`Minimum 2 videos required for mixing. Found: ${validVideos.length}`);
    }

    // Build input files
    const inputs: string[] = [];
    const filters: string[] = [];

    // Get target resolution and frame rate
    const targetDimensions = this.getResolutionDimensions(variant.settings.resolution);
    const targetFPS = variant.settings.frameRate;

    // Track which videos have audio
    const hasAudioTrack: boolean[] = [];

    variant.videoOrder.forEach((videoId, index) => {
      const video = videoMap.get(videoId);
      if (!video) {
        throw new Error(`Critical error: Video ID ${videoId} not found`);
      }

      inputs.push('-i', video.path);

      // Build filter chain for each video
      let videoFilterChain: string[] = [];

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
    const actualVideoCount = variant.videoOrder.length;

    logger.info(`Concatenating ${actualVideoCount} videos`);

    if (variant.settings.audioMode === 'mute') {
      // Video-only concatenation
      const videoInputs = variant.videoOrder.map((_, i) => `[v${i}]`).join('');
      filters.push(`${videoInputs}concat=n=${actualVideoCount}:v=1:a=0[${finalVideoOutput}]`);
    } else {
      // Video and audio concatenation - ensure all streams are present
      const concatInputs = variant.videoOrder.map((_, i) => `[v${i}][a${i}]`).join('');
      filters.push(`${concatInputs}concat=n=${actualVideoCount}:v=1:a=1[${finalVideoOutput}][outa]`);
    }

    // Note: Aspect ratio already applied per video, no need to apply again after concatenation

    // Build FFmpeg command
    commands.push('ffmpeg');
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

    // Note: Duration limiting disabled to ensure all videos are fully concatenated
    // The full concatenated video will be produced without cutting
    // if (variant.settings.durationType === 'fixed' && variant.settings.fixedDuration) {
    //   commands.push('-t', variant.settings.fixedDuration.toString());
    // }

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
    logger.info('FFmpeg command:', commands.join(' '));
    logger.info(`Output will contain ${actualVideoCount} concatenated videos`);

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