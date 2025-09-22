# Claude Development Notes for VideoMixPro

## Project Overview
VideoMixPro is a SaaS platform for automated video mixing and processing with anti-fingerprinting features for social media platforms.

## Key Files and Locations

### Backend (Node.js/Express)
- Main entry: `src/index.ts`
- Services: `src/services/`
  - `video-processing.service.ts` - Core video processing logic
  - `auto-mixing.service.ts` - Automated mixing algorithms
- Controllers: `src/controllers/`
- Database: Prisma ORM with SQLite (dev) / PostgreSQL (prod)

### Frontend (React)
- Main entry: `frontend/src/App.tsx`
- Components: `frontend/src/components/`
  - `ProcessingSettings.tsx` - Settings configuration UI
  - `JobMonitor.tsx` - Job monitoring and details display
- Services: `frontend/src/services/`

### Configuration
- `.env` - Environment variables
- `prisma/schema.prisma` - Database schema
- FFmpeg Path: `C:\Users\yoppi\Downloads\package-creatorup-1.0.0\bundle\ffmpeg\ffmpeg-2024-10-27-git-bb57b78013-essentials_build\bin\ffmpeg.exe`

## Common Commands
```bash
# Start backend
npm run dev

# Start frontend
cd frontend && npm start

# Database migrations
npx prisma migrate dev
npx prisma generate

# Run tests
node test-variant-generation-fix.js
node test-different-starting-video.js
node test-settings-fix.js
node test-job-settings-fix.js
```

## Recent Issues and Fixes (2025-09-21)

### 1. FFmpeg Path Issue (Fixed)
- Problem: FFmpeg not found
- Solution: Updated path in .env to point to bundled FFmpeg

### 2. Database Connection (Fixed)
- Problem: SQLite file path issues
- Solution: Using file:./prisma/dev.db for development

### 3. Settings Not Being Applied to Video Processing (Fixed)
- **Problem**: Job Details showed settings as "Enabled" but outputs were identical
- **Root Cause**: Variant generation only created variations when orderMixing was true
- **Solution**:
  - Added `generateRotatedOrders()` for independent "Different Starting Video" feature
  - Added `generateMinimalSpeedVariations()` to ensure output uniqueness
  - Fixed variant assignment logic to use different orders for each output
- **Files Modified**:
  - `src/services/auto-mixing.service.ts` - Complete variant generation rewrite
  - `src/controllers/processing.controller.ts` - Added settings parsing to job APIs

### 4. Job Details Showing "Disabled" (Fixed)
- **Problem**: All settings showed as "Disabled" in frontend despite being enabled
- **Root Cause**: Job list APIs didn't include parsed settings
- **Solution**: Added settings parsing in getProjectJobs and getUserJobs endpoints

### 5. Different Starting Video Not Working (Fixed)
- **Problem**: All outputs started with the same video
- **Root Cause**: Feature depended on orderMixing being enabled
- **Solution**: Implemented independent rotation logic that works without full permutation

## Key Features Working

### Anti-Fingerprinting Features
1. **Different Starting Video** ✅
   - Each output starts with a different video clip
   - Works independently without full order mixing
   - Cycles through videos: Output 1→A, Output 2→B, Output 3→C, Output 4→A...

2. **Speed Variations** ✅
   - Applies different playback speeds to videos
   - Configurable speed ranges (0.5x - 2.0x)
   - Minimal variations (0.95x-1.05x) when disabled for uniqueness

3. **Order Mixing** ✅
   - Full permutation of video orders
   - 3 videos = 6 different possible orders

4. **Smart Trimming** ✅
   - Intelligent duration distribution
   - Proportional or weighted modes
   - Fixed duration support (e.g., 15s for TikTok)

5. **Aspect Ratio Support** ✅
   - TikTok (9:16)
   - YouTube (16:9)
   - Instagram Square (1:1)
   - YouTube Shorts (9:16)

## Testing Approach
Always verify settings are actually applied by:
1. Checking Job Details display matches configuration
2. Inspecting actual output files for variations
3. Running test scripts to validate variant generation
4. Checking logs for variant selection details

## Important Implementation Details

### Variant Generation Logic
```javascript
// When Different Starting Video is enabled without Order Mixing:
generateRotatedOrders(videos, outputCount) {
  // Output 1: [A, B, C]
  // Output 2: [B, C, A]
  // Output 3: [C, A, B]
  // etc.
}

// Minimal speed variations for uniqueness:
generateMinimalSpeedVariations(videos, outputCount) {
  // Variations: [0.95, 0.97, 1.0, 1.02, 1.05]
  // Ensures outputs are never identical
}
```

### Settings Sanitization
- All boolean settings are explicitly converted: `Boolean(settings.orderMixing)`
- Transitions and colors are force-disabled for stability
- Default values are applied for missing settings

## Important Notes
- Always run lint/typecheck before committing: `npm run lint`
- Settings are stored as JSON strings in database
- Frontend uses localStorage for settings persistence
- FFmpeg commands are built dynamically based on variants
- Prisma client uses different output dirs for dev vs prod
- Job monitoring uses in-memory tracking + database persistence

## Debugging Tips
1. Check backend logs for `[Variant Generation]` entries
2. Look for `[Auto-Mixing] Selected variant` to see which variant was chosen
3. Frontend console shows settings being sent
4. Job Details API response includes parsed settings
5. Use test scripts to validate variant generation logic

## Future Improvements
- Add transition effects (currently disabled for stability)
- Implement color variations (currently disabled)
- Add more metadata sources (CapCut, VN, InShot)
- Implement batch download with progress tracking
- Add real-time processing progress via WebSockets