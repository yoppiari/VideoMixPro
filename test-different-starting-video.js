// Test script to verify "Different Starting Video" feature works correctly
const { AutoMixingService } = require('./src/services/auto-mixing.service.ts');

// Mock video clips (3 videos like in the actual project)
const mockClips = [
  {
    id: 'video-a-id',
    path: 'uploads/video-a.mp4',
    duration: 10.5,
    metadata: {},
    originalName: 'Video A',
    groupId: null
  },
  {
    id: 'video-b-id',
    path: 'uploads/video-b.mp4',
    duration: 8.2,
    metadata: {},
    originalName: 'Video B',
    groupId: null
  },
  {
    id: 'video-c-id',
    path: 'uploads/video-c.mp4',
    duration: 9.7,
    metadata: {},
    originalName: 'Video C',
    groupId: null
  }
];

// Test settings with Different Starting Video enabled
const testSettings = {
  // Core features
  orderMixing: true,
  speedMixing: true,
  differentStartingVideo: true,  // This is the key feature we're testing
  groupMixing: false,

  // Speed settings
  speedRange: { min: 0.5, max: 2 },
  allowedSpeeds: [0.5, 0.75, 1, 1.25, 1.5, 2],

  // Quality settings
  metadataSource: 'normal',
  bitrate: 'medium',
  resolution: 'hd',
  frameRate: 30,
  aspectRatio: 'original',

  // Audio and duration
  audioMode: 'mute',
  durationType: 'original',

  // Output count
  outputCount: 5  // 5 outputs for 3 videos
};

async function testDifferentStartingVideo() {
  console.log('🧪 Testing "Different Starting Video" Feature');
  console.log('=============================================\n');

  console.log('Test Setup:');
  console.log(`- Videos: ${mockClips.length} (A, B, C)`);
  console.log(`- Outputs: ${testSettings.outputCount}`);
  console.log(`- Different Starting Video: ${testSettings.differentStartingVideo}`);
  console.log(`- Order Mixing: ${testSettings.orderMixing}`);
  console.log(`- Speed Mixing: ${testSettings.speedMixing}\n`);

  try {
    const autoMixingService = new AutoMixingService();

    console.log('🔄 Generating variants...');
    const variants = await autoMixingService.generateVariants(mockClips, testSettings);

    console.log(`✅ Generated ${variants.length} variants\n`);

    // Analyze starting videos
    console.log('📊 Starting Video Analysis:');
    console.log('============================');

    const startingVideos = variants.map((variant, index) => ({
      output: index + 1,
      variantId: variant.id,
      startingVideoId: variant.videoOrder[0],
      startingVideoName: mockClips.find(c => c.id === variant.videoOrder[0])?.originalName || 'Unknown',
      fullOrder: variant.videoOrder.map(id => mockClips.find(c => c.id === id)?.originalName || id).join(' → ')
    }));

    startingVideos.forEach(info => {
      console.log(`Output ${info.output}: ${info.startingVideoName} (${info.variantId})`);
      console.log(`   Full order: ${info.fullOrder}`);
    });

    // Validation
    console.log('\n🔍 Validation Results:');
    console.log('======================');

    const uniqueStartingVideos = new Set(startingVideos.map(info => info.startingVideoId));
    const totalVideos = mockClips.length;
    const expectedUniqueStarts = Math.min(testSettings.outputCount, totalVideos);

    console.log(`Unique starting videos: ${uniqueStartingVideos.size}/${expectedUniqueStarts} expected`);
    console.log(`Starting video IDs: ${Array.from(uniqueStartingVideos).join(', ')}`);

    // Check if we have different starting videos
    const hasDifferentStarts = uniqueStartingVideos.size > 1;

    if (hasDifferentStarts && uniqueStartingVideos.size >= Math.min(totalVideos, testSettings.outputCount)) {
      console.log('✅ SUCCESS: Different Starting Video feature working correctly!');
      console.log('   - Each output starts with a different video when possible');
      console.log('   - Round-robin distribution is working');
    } else if (hasDifferentStarts) {
      console.log('⚠️ PARTIAL SUCCESS: Some different starting videos, but not optimal distribution');
      console.log(`   - Expected at least ${Math.min(totalVideos, testSettings.outputCount)} unique starts`);
      console.log(`   - Got ${uniqueStartingVideos.size} unique starts`);
    } else {
      console.log('❌ FAILURE: All outputs start with the same video!');
      console.log('   - Different Starting Video feature is not working');
      console.log(`   - All outputs start with: ${startingVideos[0].startingVideoName}`);
    }

    // Speed variation analysis
    console.log('\n🏃 Speed Variation Analysis:');
    console.log('============================');

    variants.forEach((variant, index) => {
      const speeds = Array.from(variant.speeds.values());
      const speedsStr = speeds.map(s => `${s}x`).join(', ');
      console.log(`Output ${index + 1}: Speeds [${speedsStr}]`);
    });

    // Test edge cases
    console.log('\n🔬 Edge Case Testing:');
    console.log('=====================');

    // Test with more outputs than videos
    const edgeSettings = { ...testSettings, outputCount: 7 };
    console.log(`Testing with ${edgeSettings.outputCount} outputs and ${mockClips.length} videos...`);

    const edgeVariants = await autoMixingService.generateVariants(mockClips, edgeSettings);
    const edgeStartingVideos = new Set(edgeVariants.map(v => v.videoOrder[0]));

    console.log(`Edge case result: ${edgeStartingVideos.size} unique starting videos`);

    if (edgeStartingVideos.size === mockClips.length) {
      console.log('✅ Edge case handling: Correct (cycles through all videos)');
    } else {
      console.log('⚠️ Edge case handling: May need improvement');
    }

  } catch (error) {
    console.log('❌ Test failed with error:');
    console.log(error.message);
    console.log('\nThis could indicate:');
    console.log('- AutoMixingService import issues');
    console.log('- Missing dependencies');
    console.log('- Logic errors in variant generation');
  }

  console.log('\n🏁 Test Complete');
  console.log('================');
  console.log('If the test shows ✅ SUCCESS, the Different Starting Video feature is working correctly.');
  console.log('Each output video will start with a different video clip as intended.');
}

// Run the test
testDifferentStartingVideo().catch(console.error);