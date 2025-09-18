import { VideoService } from '@/services/video.service';
import ffmpeg from 'fluent-ffmpeg';

// Mock ffmpeg
jest.mock('fluent-ffmpeg');

const mockFfmpeg = ffmpeg as jest.MockedFunction<typeof ffmpeg>;

describe('VideoService', () => {
  let videoService: VideoService;

  beforeEach(() => {
    videoService = new VideoService();
    jest.clearAllMocks();
  });

  describe('extractMetadata', () => {
    it('should extract video metadata successfully', async () => {
      const mockMetadata = {
        format: {
          duration: 120.5,
          format_name: 'mp4',
          bit_rate: '1000000'
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            r_frame_rate: '30/1'
          }
        ]
      };

      // Mock ffprobe
      const mockFfprobe = jest.fn().mockImplementation((path, callback) => {
        callback(null, mockMetadata);
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      const result = await videoService.extractMetadata('/path/to/video.mp4');

      expect(result).toEqual({
        duration: 120.5,
        format: 'mp4',
        resolution: '1920x1080',
        bitrate: 1000000,
        fps: 30,
        codec: 'h264'
      });
    });

    it('should handle ffprobe error', async () => {
      const mockFfprobe = jest.fn().mockImplementation((path, callback) => {
        callback(new Error('FFprobe failed'), null);
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      await expect(videoService.extractMetadata('/path/to/video.mp4'))
        .rejects.toThrow('Failed to extract video metadata');
    });

    it('should handle missing video stream', async () => {
      const mockMetadata = {
        format: {
          duration: 120.5,
          format_name: 'mp4'
        },
        streams: [
          {
            codec_type: 'audio',
            codec_name: 'aac'
          }
        ]
      };

      const mockFfprobe = jest.fn().mockImplementation((path, callback) => {
        callback(null, mockMetadata);
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      await expect(videoService.extractMetadata('/path/to/video.mp4'))
        .rejects.toThrow('Failed to parse video metadata');
    });
  });

  describe('extractDetailedMetadata', () => {
    it('should extract detailed video metadata with audio', async () => {
      const mockMetadata = {
        format: {
          duration: 120.5,
          format_name: 'mp4',
          bit_rate: '1000000',
          size: 50000000
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            r_frame_rate: '30/1'
          },
          {
            codec_type: 'audio',
            codec_name: 'aac',
            channels: 2,
            sample_rate: 44100
          }
        ]
      };

      const mockFfprobe = jest.fn().mockImplementation((path, callback) => {
        callback(null, mockMetadata);
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      const result = await videoService.extractDetailedMetadata('/path/to/video.mp4');

      expect(result).toEqual({
        duration: 120.5,
        format: 'mp4',
        resolution: '1920x1080',
        bitrate: 1000000,
        fps: 30,
        codec: 'h264',
        size: 50000000,
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 44100
      });
    });

    it('should extract detailed video metadata without audio', async () => {
      const mockMetadata = {
        format: {
          duration: 120.5,
          format_name: 'mp4',
          size: 50000000
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            r_frame_rate: '25/1'
          }
        ]
      };

      const mockFfprobe = jest.fn().mockImplementation((path, callback) => {
        callback(null, mockMetadata);
      });
      mockFfmpeg.ffprobe = mockFfprobe;

      const result = await videoService.extractDetailedMetadata('/path/to/video.mp4');

      expect(result).toEqual({
        duration: 120.5,
        format: 'mp4',
        resolution: '1920x1080',
        bitrate: undefined,
        fps: 25,
        codec: 'h264',
        size: 50000000
      });
    });
  });

  describe('validateVideo', () => {
    it('should validate video successfully', async () => {
      const mockMetadata = {
        duration: 120.5,
        format: 'mp4',
        resolution: '1920x1080',
        fps: 30,
        codec: 'h264'
      };

      // Mock extractMetadata method
      jest.spyOn(videoService, 'extractMetadata').mockResolvedValue(mockMetadata);

      const result = await videoService.validateVideo('/path/to/video.mp4');

      expect(result).toBe(true);
    });

    it('should reject video with zero duration', async () => {
      const mockMetadata = {
        duration: 0,
        format: 'mp4',
        resolution: '1920x1080',
        fps: 30,
        codec: 'h264'
      };

      jest.spyOn(videoService, 'extractMetadata').mockResolvedValue(mockMetadata);

      const result = await videoService.validateVideo('/path/to/video.mp4');

      expect(result).toBe(false);
    });

    it('should reject video with invalid resolution', async () => {
      const mockMetadata = {
        duration: 120.5,
        format: 'mp4',
        resolution: '0x0',
        fps: 30,
        codec: 'h264'
      };

      jest.spyOn(videoService, 'extractMetadata').mockResolvedValue(mockMetadata);

      const result = await videoService.validateVideo('/path/to/video.mp4');

      expect(result).toBe(false);
    });

    it('should handle extraction error', async () => {
      jest.spyOn(videoService, 'extractMetadata').mockRejectedValue(new Error('Extraction failed'));

      const result = await videoService.validateVideo('/path/to/video.mp4');

      expect(result).toBe(false);
    });
  });
});