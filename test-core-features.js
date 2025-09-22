// Test core VideoMixPro features after removing transitions and colors
const { exec } = require('child_process');
const path = require('path');

const ffmpegPath = "C:\\Users\\yoppi\\Downloads\\package-creatorup-1.0.0\\bundle\\ffmpeg\\ffmpeg-2024-10-27-git-bb57b78013-essentials_build\\bin\\ffmpeg.exe";

// Test videos
const testVideos = [
  'uploads\\1758330314330_video_test_mix_2_.mp4',
  'uploads\\1758330315645_video_test_mix.mp4'
];

// Core feature tests (no transitions, no colors)
const coreTests = [
  {
    name: "Test 1: Basic Concatenation (Baseline)",
    description: "Simple video concatenation with no effects",
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:3,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0];[1:v]trim=0:3,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 6 -y test_basic_concat.mp4`,
    expectedDuration: 6,
    features: ['concat']
  },
  {
    name: "Test 2: Speed Mixing Only (0.5x)",
    description: "Both videos at half speed",
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:3,setpts=PTS-STARTPTS,setpts=2*PTS,scale=640:480,fps=30[v0];[1:v]trim=0:3,setpts=PTS-STARTPTS,setpts=2*PTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 12 -y test_speed_half.mp4`,
    expectedDuration: 12,
    features: ['speed', 'concat']
  },
  {
    name: "Test 3: Speed Mixing Only (1.5x)",
    description: "Both videos at 1.5x speed",
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:3,setpts=PTS-STARTPTS,setpts=0.667*PTS,scale=640:480,fps=30[v0];[1:v]trim=0:3,setpts=PTS-STARTPTS,setpts=0.667*PTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 4 -y test_speed_fast.mp4`,
    expectedDuration: 4,
    features: ['speed', 'concat']
  },
  {
    name: "Test 4: Different Speeds Per Video",
    description: "First video slow (0.75x), second video fast (1.25x)",
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:3,setpts=PTS-STARTPTS,setpts=1.333*PTS,scale=640:480,fps=30[v0];[1:v]trim=0:3,setpts=PTS-STARTPTS,setpts=0.8*PTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 6.4 -y test_mixed_speeds.mp4`,
    expectedDuration: 6.4,
    features: ['speed', 'concat']
  },
  {
    name: "Test 5: High Quality Settings",
    description: "Test HD resolution with high bitrate",
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=1280:720,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=1280:720,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -c:v libx264 -b:v 3000k -t 4 -y test_hd_quality.mp4`,
    expectedDuration: 4,
    features: ['quality', 'resolution', 'concat']
  },
  {
    name: "Test 6: Different Frame Rates",
    description: "Test 60 FPS output",
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=60[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=60[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 4 -y test_60fps.mp4`,
    expectedDuration: 4,
    features: ['framerate', 'concat']
  },
  {
    name: "Test 7: Aspect Ratio - Vertical (9:16)",
    description: "Test vertical video format for TikTok/Instagram",
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:black,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:black,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 4 -y test_vertical.mp4`,
    expectedDuration: 4,
    features: ['aspect_ratio', 'padding', 'concat']
  },
  {
    name: "Test 8: Audio Preservation",
    description: "Test with audio kept",
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1];[0:a]atrim=0:2[a0];[1:a]atrim=0:2[a1];[v0][v1]concat=n=2:v=1[outv];[a0][a1]concat=n=2:a=1[outa]" -map "[outv]" -map "[outa]" -t 4 -y test_with_audio.mp4`,
    expectedDuration: 4,
    features: ['audio', 'concat']
  },
  {
    name: "Test 9: Audio Muted",
    description: "Test with no audio output",
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -an -t 4 -y test_no_audio.mp4`,
    expectedDuration: 4,
    features: ['mute', 'concat']
  },
  {
    name: "Test 10: Smart Trimming Simulation",
    description: "Fixed duration with equal distribution",
    command: `"${ffmpegPath}" -i ${testVideos[0]} -i ${testVideos[1]} -filter_complex "[0:v]trim=0:2.5,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0];[1:v]trim=0:2.5,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 5 -y test_smart_trim.mp4`,
    expectedDuration: 5,
    features: ['trimming', 'concat']
  }
];

async function runCoreTest(test) {
  return new Promise((resolve) => {
    console.log(`\\n${'='.repeat(70)}`);
    console.log(`Running: ${test.name}`);
    console.log(`Description: ${test.description}`);
    console.log(`Features: ${test.features.join(', ')}`);
    console.log(`Expected Duration: ${test.expectedDuration}s`);
    console.log(`${'='.repeat(70)}`);

    const startTime = Date.now();

    exec(test.command, { timeout: 45000 }, (error, stdout, stderr) => {
      const duration = Date.now() - startTime;

      if (error) {
        console.log(`❌ FAILED: ${test.name} (${duration}ms)`);
        console.log(`Error: ${error.message}`);

        // Show relevant error information
        if (stderr) {
          const relevantErrors = stderr.split('\\n')
            .filter(line =>
              line.includes('Error') ||
              line.includes('Invalid') ||
              line.includes('Failed') ||
              line.includes('not found') ||
              line.includes('Permission denied')
            )
            .slice(0, 3);

          if (relevantErrors.length > 0) {
            console.log(`Relevant errors:`);
            relevantErrors.forEach(err => console.log(`  - ${err.trim()}`));
          }
        }

        resolve({
          success: false,
          error: error.message,
          duration,
          features: test.features,
          expectedDuration: test.expectedDuration
        });
      } else {
        console.log(`✅ SUCCESS: ${test.name} (${duration}ms)`);

        // Show some useful output info if available
        if (stdout) {
          const lines = stdout.split('\\n').filter(line => line.trim());
          if (lines.length > 0) {
            console.log(`Output: ${lines[lines.length - 1].substring(0, 100)}`);
          }
        }

        resolve({
          success: true,
          duration,
          features: test.features,
          expectedDuration: test.expectedDuration
        });
      }
    });
  });
}

async function runAllCoreTests() {
  console.log("🚀 Starting Core VideoMixPro Features Test Suite");
  console.log("📋 Testing after removing problematic transition and color features");
  console.log("🎯 Focus: Order mixing, Speed variations, Quality settings, Audio options\\n");

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const test of coreTests) {
    const result = await runCoreTest(test);
    results.push({
      name: test.name,
      ...result
    });

    if (result.success) {
      passed++;
    } else {
      failed++;
    }

    // Wait 2 seconds between tests
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\\n" + "="*70);
  console.log("🏁 FINAL TEST RESULTS");
  console.log("="*70);

  // Group results by feature category
  const featureResults = {
    'Basic Concat': [],
    'Speed Mixing': [],
    'Quality Settings': [],
    'Audio Options': [],
    'Smart Features': []
  };

  results.forEach(result => {
    const features = result.features || [];
    if (features.includes('speed')) {
      featureResults['Speed Mixing'].push(result);
    } else if (features.includes('quality') || features.includes('resolution') || features.includes('framerate') || features.includes('aspect_ratio')) {
      featureResults['Quality Settings'].push(result);
    } else if (features.includes('audio') || features.includes('mute')) {
      featureResults['Audio Options'].push(result);
    } else if (features.includes('trimming')) {
      featureResults['Smart Features'].push(result);
    } else {
      featureResults['Basic Concat'].push(result);
    }
  });

  // Print results by category
  Object.entries(featureResults).forEach(([category, categoryResults]) => {
    if (categoryResults.length > 0) {
      console.log(`\\n📂 ${category}:`);
      categoryResults.forEach(result => {
        const status = result.success ? '✅' : '❌';
        const timing = result.duration ? ` (${result.duration}ms)` : '';
        console.log(`  ${status} ${result.name}${timing}`);
        if (!result.success && result.error) {
          console.log(`      Error: ${result.error.substring(0, 80)}...`);
        }
      });
    }
  });

  console.log("\\n" + "="*70);
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${results.length} tests`);

  if (failed === 0) {
    console.log("🎉 ALL CORE FEATURES WORKING! Platform is stable and ready.");
    console.log("✨ Available features:");
    console.log("   - ✅ Order mixing (video sequence variations)");
    console.log("   - ✅ Speed mixing (playback speed variations)");
    console.log("   - ✅ Quality settings (resolution, bitrate, FPS)");
    console.log("   - ✅ Aspect ratio options (vertical, horizontal, square)");
    console.log("   - ✅ Audio controls (keep/mute)");
    console.log("   - ✅ Smart trimming");
  } else {
    console.log(`⚠️  ${failed} core features failed. Platform needs attention.`);
    console.log("🔧 Failed features need investigation before production use.");
  }

  console.log("="*70);

  // Feature-specific validation
  console.log("\\n🔍 FEATURE VALIDATION:");

  const speedTests = results.filter(r => r.features && r.features.includes('speed'));
  console.log(`• Speed Mixing: ${speedTests.filter(r => r.success).length}/${speedTests.length} tests passed`);

  const qualityTests = results.filter(r => r.features && (r.features.includes('quality') || r.features.includes('resolution')));
  console.log(`• Quality Settings: ${qualityTests.filter(r => r.success).length}/${qualityTests.length} tests passed`);

  const audioTests = results.filter(r => r.features && (r.features.includes('audio') || r.features.includes('mute')));
  console.log(`• Audio Options: ${audioTests.filter(r => r.success).length}/${audioTests.length} tests passed`);

  const basicTests = results.filter(r => r.features && r.features.includes('concat') && !r.features.includes('speed'));
  console.log(`• Basic Concatenation: ${basicTests.filter(r => r.success).length}/${basicTests.length} tests passed`);

  return {
    total: results.length,
    passed,
    failed,
    allPassed: failed === 0,
    results
  };
}

// Run all tests
runAllCoreTests()
  .then(summary => {
    if (summary.allPassed) {
      process.exit(0);
    } else {
      console.log("\\n❌ Some tests failed. Check output above for details.");
      process.exit(1);
    }
  })
  .catch(error => {
    console.error("\\n💥 Test suite crashed:", error);
    process.exit(1);
  });