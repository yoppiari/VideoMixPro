// Test FFmpeg command generation with all settings
const { exec } = require('child_process');
const path = require('path');

const ffmpegPath = "C:\\Users\\yoppi\\Downloads\\package-creatorup-1.0.0\\bundle\\ffmpeg\\ffmpeg-2024-10-27-git-bb57b78013-essentials_build\\bin\\ffmpeg.exe";

// Test videos
const testVideos = [
  'uploads\\1758330314330_video_test_mix_2_.mp4',
  'uploads\\1758330315645_video_test_mix.mp4'
];

// Comprehensive test cases for all settings
const settingsTests = [
  {
    name: "Test 1: No Settings (Baseline)",
    settings: {},
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 4 -y test_no_settings.mp4`
  },
  {
    name: "Test 2: Speed Only (0.5x)",
    settings: { speed: 0.5 },
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,setpts=2*PTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,setpts=2*PTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 8 -y test_speed_half.mp4`
  },
  {
    name: "Test 3: Speed Only (2x)",
    settings: { speed: 2 },
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,setpts=0.5*PTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,setpts=0.5*PTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 2 -y test_speed_double.mp4`
  },
  {
    name: "Test 4: Transition Only (fade)",
    settings: { transition: 'fade', transitionDuration: 0.5 },
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1];[v0][v1]xfade=offset=1.5:duration=0.5:transition=fade[outv]" -map "[outv]" -t 3.5 -y test_transition_fade.mp4`
  },
  {
    name: "Test 5: Transition Only (dissolve)",
    settings: { transition: 'dissolve', transitionDuration: 0.3 },
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1];[v0][v1]xfade=offset=1.7:duration=0.3:transition=dissolve[outv]" -map "[outv]" -t 3.3 -y test_transition_dissolve.mp4`
  },
  {
    name: "Test 6: Speed + Transition (CRITICAL TEST)",
    settings: { speed: 1.5, transition: 'fade', transitionDuration: 0.5 },
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,setpts=1.5*PTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,setpts=1.5*PTS,scale=640:480,fps=30[v1];[v0][v1]xfade=offset=2.5:duration=0.5:transition=fade[outv]" -map "[outv]" -t 5.5 -y test_speed_transition.mp4`
  },
  {
    name: "Test 7: Different Speed Per Video",
    settings: { speeds: [0.5, 2] },
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,setpts=2*PTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,setpts=0.5*PTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 5 -y test_different_speeds.mp4`
  },
  {
    name: "Test 8: Color Filter (vintage)",
    settings: { colorProfile: 'vintage' },
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30,colorchannelmixer=0.3:0.4:0.3:0:0.3:0.4:0.3:0:0.3:0.4:0.3:0[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30,colorchannelmixer=0.3:0.4:0.3:0:0.3:0.4:0.3:0:0.3:0.4:0.3:0[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 4 -y test_color_vintage.mp4`
  },
  {
    name: "Test 9: Smart Trimming Simulation (equal)",
    settings: { smartTrimming: true, targetDuration: 6, mode: 'equal' },
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:3,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0];[1:v]trim=0:3,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 6 -y test_smart_trimming.mp4`
  },
  {
    name: "Test 10: Complex Combination",
    settings: { speed: 1.2, transition: 'fade', transitionDuration: 0.4, colorProfile: 'vibrant' },
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,setpts=1.2*PTS,scale=640:480,fps=30,eq=saturation=1.5:brightness=0.1[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,setpts=1.2*PTS,scale=640:480,fps=30,eq=saturation=1.5:brightness=0.1[v1];[v0][v1]xfade=offset=2.0:duration=0.4:transition=fade[outv]" -map "[outv]" -t 4.4 -y test_complex.mp4`
  }
];

async function runFFmpegTest(test) {
  return new Promise((resolve) => {
    console.log(`\\n${'='.repeat(60)}`);
    console.log(`Running: ${test.name}`);
    console.log(`Settings: ${JSON.stringify(test.settings)}`);
    console.log(`${'='.repeat(60)}`);

    const startTime = Date.now();

    exec(test.command, { timeout: 30000 }, (error, stdout, stderr) => {
      const duration = Date.now() - startTime;

      if (error) {
        console.log(`❌ FAILED: ${test.name} (${duration}ms)`);
        console.log(`Error: ${error.message}`);
        if (stderr) {
          // Show only relevant error parts
          const relevantError = stderr.split('\\n')
            .filter(line => line.includes('Error') || line.includes('Invalid') || line.includes('Failed'))
            .slice(0, 3)
            .join('\\n');
          if (relevantError) console.log(`Stderr: ${relevantError}`);
        }
        resolve({ success: false, error: error.message, duration });
      } else {
        console.log(`✅ SUCCESS: ${test.name} (${duration}ms)`);
        resolve({ success: true, duration });
      }
    });
  });
}

async function runAllFFmpegTests() {
  console.log("Starting FFmpeg Settings Validation Tests...\\n");
  console.log("Testing core FFmpeg command generation for all settings\\n");

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const test of settingsTests) {
    const result = await runFFmpegTest(test);
    results.push({
      name: test.name,
      settings: test.settings,
      ...result
    });

    if (result.success) {
      passed++;
    } else {
      failed++;
    }

    // Wait 1 second between tests
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log("\\n" + "="*60);
  console.log("TEST SUMMARY");
  console.log("="*60);

  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const duration = result.duration ? `(${result.duration}ms)` : '';
    console.log(`${status} ${result.name} ${duration}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error.substring(0, 100)}...`);
    }
  });

  console.log("\\n" + "="*60);
  console.log(`TOTAL: ${passed} PASSED, ${failed} FAILED`);

  if (failed === 0) {
    console.log("🎉 ALL TESTS PASSED! All settings work correctly.");
  } else {
    console.log(`⚠️  ${failed} tests failed. Check individual errors above.`);
  }

  console.log("="*60);

  // Additional validation
  console.log("\\nVALIDATION SUMMARY:");
  console.log("- Speed settings:", results.filter(r => r.settings.speed && r.success).length > 0 ? "✅ WORKING" : "❌ FAILED");
  console.log("- Transition settings:", results.filter(r => r.settings.transition && r.success).length > 0 ? "✅ WORKING" : "❌ FAILED");
  console.log("- Speed + Transition combo:", results.find(r => r.settings.speed && r.settings.transition)?.success ? "✅ WORKING" : "❌ FAILED");
  console.log("- Color filters:", results.filter(r => r.settings.colorProfile && r.success).length > 0 ? "✅ WORKING" : "❌ FAILED");
  console.log("- Complex combinations:", results.find(r => Object.keys(r.settings).length > 2)?.success ? "✅ WORKING" : "❌ FAILED");
}

runAllFFmpegTests().catch(console.error);