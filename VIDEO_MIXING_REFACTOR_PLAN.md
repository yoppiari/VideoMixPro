# VIDEO MIXING SYSTEM REFACTOR PLAN
Last Updated: 2025-09-19

## OVERVIEW
Complete refactor of VideoMixPro mixing system from 5-template system to simplified order/speed mixing with enhanced quality settings.

## CURRENT STATUS
- Project: "Coba Video Baru"
- 4 videos uploaded successfully
- System ready for refactor implementation

## REFACTOR REQUIREMENTS

### 1. UPLOAD VALIDATION CHANGES
**Current**: Allows single video upload
**Target**: Minimum 2 videos required

Implementation:
- Frontend: Add validation check in VideoUpload.tsx
- Show warning: "Minimum 2 videos required for mixing"
- Disable processing button if < 2 videos

### 2. MIXING ALGORITHM SIMPLIFICATION
**Remove**: 5 templates (Corporate, Social Media, Highlight Reel, Educational, Promotional)
**Add**: 2 basic mix types

#### A. ORDER MIX (Urutan Video)
- Permutation of video sequences
- Example with 4 videos (A,B,C,D):
  - ABCD, ACDB, BDAC, CABD, etc.
  - Total: 4! = 24 permutations

#### B. SPEED MIX (Kecepatan Video)
- Random speed variations per video
- Speed options: 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x
- Each video can have different speed

### 3. METADATA MODIFIER SETTINGS
Add metadata injection to disguise video source:

**Options**:
- **Normal**: Clean/default metadata
- **CapCut**: Mimics CapCut export
  - encoder: 'CapCut'
  - software: 'CapCut for Windows'
- **VN Editor**: Mimics VN Video Editor
  - encoder: 'VN Video Editor'
  - software: 'VN - Video Editor & Maker'
  - comment: 'Made with VN'
- **InShot**: Mimics InShot app
  - encoder: 'InShot'
  - software: 'InShot Video Editor'
  - handler_name: 'InShot Inc.'

### 4. VIDEO QUALITY SETTINGS

#### A. BITRATE (Kualitas Video)
Controls file size vs quality trade-off:
- **Rendah (File Kecil)**: 1-2 Mbps
- **Medium (Seimbang)**: 4-6 Mbps
- **Tinggi (Kualitas Terbaik)**: 8-12 Mbps

#### B. RESOLUTION
Determines video dimensions:
- **SD (480p)**: 854×480
- **HD (720p)**: 1280×720
- **Full HD (1080p)**: 1920×1080

#### C. FRAME RATE (FPS)
Controls motion smoothness:
- **24 FPS (Sinematik)**: Film look
- **30 FPS (Standar Medsos)**: Standard social media
- **60 FPS (Sangat Halus)**: Very smooth motion

### 5. VARIANT CALCULATION
Display estimated possible variants:

```
Formula:
Total Variants = Order Permutations × (Speed Options ^ Number of Videos)

Example (4 videos, 6 speed options):
24 × (6^4) = 24 × 1296 = 31,104 possible variants
```

User inputs desired output count (e.g., 100 from 31,104 possibilities)

### 6. PREVIEW & SETTINGS UI

```
Project Settings Panel:
├── Mixing Options
│   ├── ☑ Order Mixing (Enable/Disable)
│   ├── ☑ Speed Mixing (Enable/Disable)
│   ├── Speed Range: [0.5x] - [2x]
│   └── Allowed Speeds: [0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x]
│
├── Video Quality
│   ├── Metadata Source: [Dropdown: Normal/CapCut/VN/InShot]
│   ├── Bitrate: [Dropdown: Rendah/Medium/Tinggi]
│   ├── Resolution: [Dropdown: SD/HD/Full HD]
│   └── Frame Rate: [Dropdown: 24/30/60 FPS]
│
├── Variant Estimation
│   ├── Total Possible: 31,104 variants
│   └── Generate Count: [Input: 100]
│
└── [Preview] [Start Processing]
```

## IMPLEMENTATION FILES TO MODIFY

### Backend Files:
1. `src/services/auto-mixing.service.ts`
   - Remove template system
   - Implement order permutation logic
   - Implement speed variation logic
   - Add metadata injection

2. `src/services/video-processing.service.ts`
   - Update FFmpeg commands for new settings
   - Add bitrate control
   - Add resolution scaling
   - Add FPS conversion
   - Inject metadata tags

3. `src/controllers/processing.controller.ts`
   - Add validation for minimum 2 videos
   - Update processing parameters

4. `src/utils/validation.ts`
   - Update project settings schema
   - Add new quality settings validation

### Frontend Files:
1. `frontend/src/components/videos/VideoUpload.tsx`
   - Add minimum 2 videos validation
   - Show warning message

2. `frontend/src/components/processing/ProcessingSettings.tsx` (NEW)
   - Create settings panel UI
   - Mixing options toggles
   - Quality dropdowns
   - Variant calculator
   - Preview button

3. `frontend/src/pages/ProjectDetail.tsx`
   - Integrate new settings panel
   - Update processing flow

4. `frontend/src/types/index.ts`
   - Update types for new settings structure

### Database Schema:
1. `prisma/schema.prisma`
   - Update Project settings JSON structure
   - Add fields for new quality settings

## FFMPEG COMMAND EXAMPLES

### With Metadata Injection (CapCut):
```bash
ffmpeg -i input.mp4 \
  -metadata encoder="CapCut" \
  -metadata software="CapCut for Windows" \
  -b:v 4M \
  -s 1280x720 \
  -r 30 \
  output.mp4
```

### Speed Variation:
```bash
ffmpeg -i input.mp4 \
  -filter:v "setpts=0.5*PTS" \  # 2x speed
  -filter:a "atempo=2.0" \
  output.mp4
```

## TESTING CHECKLIST
- [ ] Upload single video → Show error
- [ ] Upload 2+ videos → Allow processing
- [ ] Test all metadata options
- [ ] Test all bitrate levels
- [ ] Test all resolutions
- [ ] Test all frame rates
- [ ] Verify variant calculation
- [ ] Generate batch with no duplicates
- [ ] Check output metadata with ffprobe

## ROLLBACK PLAN
If issues occur:
1. Git stash changes
2. Restore original auto-mixing.service.ts
3. Clear Redis queue
4. Reset database to last migration

## SUCCESS CRITERIA
- Minimum 2 videos enforced
- Order/speed mixing working
- Metadata correctly injected
- Quality settings applied
- Variant estimation accurate
- No duplicate outputs in batch
- All tests passing

## NOTES
- Keep original 5-template code commented for reference
- Ensure backward compatibility with existing projects
- Monitor FFmpeg memory usage with high output counts
- Consider adding progress callback for large batches

---
This document serves as reference if Claude encounters errors during implementation.