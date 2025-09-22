# Manual Testing Guide for VideoMixPro Settings

This guide provides step-by-step instructions to manually test each setting to ensure they work correctly.

## Prerequisites
1. Backend running on localhost:3002
2. Frontend running on localhost:3000
3. Test videos uploaded to the platform

## Test Scenarios

### Test 1: Default Settings (Unselected)
**Expected**: All settings should be OFF by default when starting the process
1. Go to localhost:3000
2. Upload 3 test videos
3. Click "Process Videos"
4. Verify all checkboxes are unchecked:
   - ❌ Order Mixing
   - ❌ Speed Mixing
   - ❌ Different Starting Video
   - ❌ Transition Mixing
   - ❌ Color Mixing
   - ❌ Smart Trimming

### Test 2: Order Mixing Only
**Expected**: Different video orders should be generated
1. Check only "Order Mixing"
2. Set output count to 3
3. Process videos
4. Expected combinations: 6 (3! = 6 permutations)
5. Verify each output has different video order

### Test 3: Speed Mixing Only
**Expected**: Different playback speeds should be applied
1. Uncheck all, check only "Speed Mixing"
2. Select speeds: 0.5x, 1x, 2x
3. Set output count to 5
4. Process videos
5. Expected combinations: 27 (3³ = 27 speed combinations)
6. Verify videos play at different speeds

### Test 4: Transition Mixing Only
**Expected**: Different transitions between videos
1. Uncheck all, check only "Transition Mixing"
2. Select transitions: fade, dissolve, wipeleft
3. Set transition duration: 0.5s
4. Set output count to 5
5. Process videos
6. Expected combinations: 9 (3² = 9 transition combinations)
7. Verify smooth transitions between videos

### Test 5: Smart Trimming - Equal Mode
**Expected**: All videos trimmed to equal duration
1. Uncheck all, check only "Smart Trimming"
2. Select mode: "Equal duration"
3. Set target duration: 10 seconds
4. Process videos
5. Verify all videos are exactly 10 seconds
6. Verify each video contributes equally (≈3.33s each)

### Test 6: Smart Trimming - Weighted Mode
**Expected**: Videos trimmed proportionally to original length
1. Uncheck all, check only "Smart Trimming"
2. Select mode: "Weighted by length"
3. Set target duration: 10 seconds
4. Process videos
5. Verify total duration is 10 seconds
6. Verify longer videos contribute more time than shorter ones

### Test 7: Different Starting Video
**Expected**: Multiple outputs with different starting videos
1. Uncheck all, check only "Different Starting Video"
2. Set output count to 3
3. Process videos
4. Expected combinations: 3 (one for each starting video)
5. Verify Output 1 starts with Video 1, Output 2 starts with Video 2, etc.

### Test 8: Color Mixing Only
**Expected**: Different color profiles applied
1. Uncheck all, check only "Color Mixing"
2. Select profiles: original, vintage, vibrant
3. Set output count to 5
4. Process videos
5. Expected combinations: 27 (3³ = 27 color combinations)
6. Verify different color tones in outputs

### Test 9: Combined Settings Test 1 (Order + Speed)
**Expected**: Both order and speed variations
1. Check "Order Mixing" and "Speed Mixing"
2. Speeds: 0.5x, 1x
3. Set output count to 10
4. Process videos
5. Expected combinations: 48 (6 orders × 8 speed combinations)
6. Verify both different orders AND different speeds

### Test 10: Combined Settings Test 2 (Transition + Speed)
**Expected**: Both transitions and speed changes
1. Check "Transition Mixing" and "Speed Mixing"
2. Transitions: fade, dissolve
3. Speeds: 1x, 2x
4. Set output count to 10
5. Process videos
6. Expected combinations: 32 (8 speed × 4 transition combinations)
7. Verify smooth transitions with speed variations

### Test 11: All Settings Combined
**Expected**: Maximum complexity with all features
1. Check ALL settings:
   - ✅ Order Mixing
   - ✅ Speed Mixing (1x, 1.5x)
   - ✅ Different Starting Video
   - ✅ Transition Mixing (fade)
   - ✅ Color Mixing (original, vintage)
   - ✅ Smart Trimming (equal, 15s)
2. Set output count to 10
3. Process videos
4. Expected: Complex combinations with all features working together
5. Verify each output has:
   - Different video order OR different starting video
   - Speed variations
   - Smooth transitions
   - Color effects
   - Total duration of 15 seconds

## Validation Checklist

For each test, verify:
- [ ] Processing completes without errors
- [ ] Expected number of output videos generated
- [ ] Output videos play correctly
- [ ] Each setting produces expected visual/temporal effects
- [ ] No duplicated combinations
- [ ] All FFmpeg processes complete successfully
- [ ] Database records are created correctly

## Common Issues to Watch For

1. **FFmpeg "Invalid argument" errors** - Should be fixed with speed-before-fps ordering
2. **Constant frame rate issues** - xfade filter requires consistent FPS
3. **Duration calculation errors** - Especially with smart trimming + speed changes
4. **Transition offset errors** - Cumulative duration calculations
5. **Memory/performance issues** - With complex filter chains

## Error Investigation

If any test fails:
1. Check browser console for JavaScript errors
2. Check backend logs for processing errors
3. Check database for job status and error messages
4. Verify FFmpeg command construction in logs
5. Test individual FFmpeg commands manually

## Success Criteria

All tests pass when:
- ✅ No processing errors occur
- ✅ Expected number of outputs generated
- ✅ Each setting produces intended effects
- ✅ Settings can be combined without conflicts
- ✅ Default settings are unselected
- ✅ Complex combinations work correctly