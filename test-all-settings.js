// Comprehensive test for all VideoMixPro settings
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_URL = 'http://localhost:3002';
const TEST_USER_ID = 'test-user-123';

// Test configurations for each setting
const testConfigurations = [
  {
    name: "Test 1: Order Mixing Only",
    settings: {
      orderMixing: true,
      speedMixing: false,
      differentStarting: false,
      transitionMixing: false,
      colorMixing: false,
      smartTrimming: false,
      outputCount: 3
    },
    expectedCombinations: 6 // 3! = 6 for 3 videos
  },
  {
    name: "Test 2: Speed Mixing Only",
    settings: {
      orderMixing: false,
      speedMixing: true,
      speeds: [0.5, 1, 2],
      differentStarting: false,
      transitionMixing: false,
      colorMixing: false,
      smartTrimming: false,
      outputCount: 3
    },
    expectedCombinations: 27 // 3^3 = 27 speed combinations
  },
  {
    name: "Test 3: Transition Mixing Only",
    settings: {
      orderMixing: false,
      speedMixing: false,
      differentStarting: false,
      transitionMixing: true,
      transitions: ['fade', 'dissolve', 'wipeleft'],
      transitionDuration: 0.5,
      colorMixing: false,
      smartTrimming: false,
      outputCount: 3
    },
    expectedCombinations: 9 // 3^2 = 9 transition combinations
  },
  {
    name: "Test 4: Smart Trimming with Equal Mode",
    settings: {
      orderMixing: false,
      speedMixing: false,
      differentStarting: false,
      transitionMixing: false,
      colorMixing: false,
      smartTrimming: true,
      trimmingMode: 'equal',
      targetDuration: 10,
      outputCount: 2
    },
    expectedCombinations: 1
  },
  {
    name: "Test 5: Smart Trimming with Weighted Mode",
    settings: {
      orderMixing: false,
      speedMixing: false,
      differentStarting: false,
      transitionMixing: false,
      colorMixing: false,
      smartTrimming: true,
      trimmingMode: 'weighted',
      targetDuration: 10,
      outputCount: 2
    },
    expectedCombinations: 1
  },
  {
    name: "Test 6: Different Starting Video",
    settings: {
      orderMixing: false,
      speedMixing: false,
      differentStarting: true,
      transitionMixing: false,
      colorMixing: false,
      smartTrimming: false,
      outputCount: 3
    },
    expectedCombinations: 3 // One for each starting video
  },
  {
    name: "Test 7: Color Mixing Only",
    settings: {
      orderMixing: false,
      speedMixing: false,
      differentStarting: false,
      transitionMixing: false,
      colorMixing: true,
      colorProfiles: ['original', 'vintage', 'vibrant'],
      smartTrimming: false,
      outputCount: 3
    },
    expectedCombinations: 27 // 3^3 = 27 color combinations
  },
  {
    name: "Test 8: Combined Order + Speed",
    settings: {
      orderMixing: true,
      speedMixing: true,
      speeds: [0.5, 1],
      differentStarting: false,
      transitionMixing: false,
      colorMixing: false,
      smartTrimming: false,
      outputCount: 5
    },
    expectedCombinations: 48 // 6 orders * 8 speed combinations
  },
  {
    name: "Test 9: Combined Transition + Speed",
    settings: {
      orderMixing: false,
      speedMixing: true,
      speeds: [1, 2],
      differentStarting: false,
      transitionMixing: true,
      transitions: ['fade', 'dissolve'],
      transitionDuration: 0.5,
      colorMixing: false,
      smartTrimming: false,
      outputCount: 5
    },
    expectedCombinations: 32 // 8 speed * 4 transition combinations
  },
  {
    name: "Test 10: All Settings Combined",
    settings: {
      orderMixing: true,
      speedMixing: true,
      speeds: [1, 1.5],
      differentStarting: true,
      transitionMixing: true,
      transitions: ['fade'],
      transitionDuration: 0.3,
      colorMixing: true,
      colorProfiles: ['original', 'vintage'],
      smartTrimming: true,
      trimmingMode: 'equal',
      targetDuration: 15,
      outputCount: 10
    },
    expectedCombinations: 768 // Complex calculation
  }
];

// Helper function to create test videos
async function createTestVideos() {
  console.log("Creating test video files...");

  // Check if test videos exist
  const testVideos = [
    'test_video_1.mp4',
    'test_video_2.mp4',
    'test_video_3.mp4'
  ];

  for (const videoFile of testVideos) {
    const videoPath = path.join(__dirname, 'uploads', videoFile);
    if (!fs.existsSync(videoPath)) {
      // Copy existing test videos if available
      const sourceVideo = path.join(__dirname, 'uploads', '1758330314330_video_test_mix_2_.mp4');
      if (fs.existsSync(sourceVideo)) {
        fs.copyFileSync(sourceVideo, videoPath);
        console.log(`Created ${videoFile}`);
      }
    }
  }

  return testVideos;
}

// Helper function to upload videos
async function uploadVideos(videoFiles) {
  console.log("Uploading test videos...");
  const uploadedVideos = [];

  for (const videoFile of videoFiles) {
    const videoPath = path.join(__dirname, 'uploads', videoFile);

    const formData = new FormData();
    formData.append('video', fs.createReadStream(videoPath));
    formData.append('userId', TEST_USER_ID);

    try {
      const response = await axios.post(`${API_URL}/api/videos/upload`, formData, {
        headers: formData.getHeaders()
      });

      uploadedVideos.push(response.data);
      console.log(`Uploaded: ${videoFile} -> ID: ${response.data.id}`);
    } catch (error) {
      console.error(`Failed to upload ${videoFile}:`, error.message);
    }
  }

  return uploadedVideos;
}

// Helper function to create project
async function createProject(videos, settings, testName) {
  console.log(`\nCreating project for: ${testName}`);

  try {
    const response = await axios.post(`${API_URL}/api/projects/create`, {
      userId: TEST_USER_ID,
      name: testName,
      videos: videos.map(v => v.id),
      settings: settings
    });

    console.log(`Project created: ${response.data.id}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to create project:`, error.response?.data || error.message);
    return null;
  }
}

// Helper function to process project
async function processProject(projectId) {
  console.log(`Processing project: ${projectId}`);

  try {
    const response = await axios.post(`${API_URL}/api/projects/${projectId}/process`, {
      userId: TEST_USER_ID
    });

    console.log(`Processing started: ${response.data.jobs?.length || 0} jobs created`);
    return response.data;
  } catch (error) {
    console.error(`Failed to process project:`, error.response?.data || error.message);
    return null;
  }
}

// Helper function to monitor jobs
async function monitorJobs(projectId, timeout = 60000) {
  console.log(`Monitoring jobs for project: ${projectId}`);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await axios.get(`${API_URL}/api/projects/${projectId}/status`, {
        params: { userId: TEST_USER_ID }
      });

      const project = response.data;
      const jobs = project.jobs || [];

      const completed = jobs.filter(j => j.status === 'completed').length;
      const failed = jobs.filter(j => j.status === 'failed').length;
      const processing = jobs.filter(j => j.status === 'processing').length;
      const pending = jobs.filter(j => j.status === 'pending').length;

      console.log(`Status: ${completed} completed, ${failed} failed, ${processing} processing, ${pending} pending`);

      // Check if all jobs are done
      if (processing === 0 && pending === 0) {
        if (failed > 0) {
          console.log("Some jobs failed:");
          jobs.filter(j => j.status === 'failed').forEach(job => {
            console.log(`  - Job ${job.id}: ${job.error || 'Unknown error'}`);
          });
        }

        return {
          success: failed === 0,
          completed,
          failed,
          total: jobs.length
        };
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Failed to check status:`, error.message);
    }
  }

  return {
    success: false,
    error: 'Timeout reached'
  };
}

// Main test function
async function runTests() {
  console.log("="*60);
  console.log("Starting Comprehensive VideoMixPro Settings Test");
  console.log("="*60);

  // Create and upload test videos
  const videoFiles = await createTestVideos();
  const uploadedVideos = await uploadVideos(videoFiles);

  if (uploadedVideos.length < 3) {
    console.error("Failed to upload required test videos");
    return;
  }

  const results = [];

  // Run each test configuration
  for (const testConfig of testConfigurations) {
    console.log("\n" + "="*60);
    console.log(testConfig.name);
    console.log("="*60);

    // Create project with test settings
    const project = await createProject(uploadedVideos, testConfig.settings, testConfig.name);

    if (!project) {
      results.push({
        test: testConfig.name,
        status: 'FAILED',
        error: 'Could not create project'
      });
      continue;
    }

    // Process the project
    const processResult = await processProject(project.id);

    if (!processResult) {
      results.push({
        test: testConfig.name,
        status: 'FAILED',
        error: 'Could not start processing'
      });
      continue;
    }

    // Monitor job completion
    const jobResult = await monitorJobs(project.id);

    results.push({
      test: testConfig.name,
      status: jobResult.success ? 'PASSED' : 'FAILED',
      completed: jobResult.completed,
      failed: jobResult.failed,
      total: jobResult.total,
      expectedCombinations: testConfig.expectedCombinations,
      error: jobResult.error
    });

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Print summary
  console.log("\n" + "="*60);
  console.log("TEST SUMMARY");
  console.log("="*60);

  results.forEach(result => {
    const status = result.status === 'PASSED' ? '✅' : '❌';
    console.log(`${status} ${result.test}`);
    if (result.status === 'PASSED') {
      console.log(`   Completed: ${result.completed}/${result.total} jobs`);
    } else {
      console.log(`   Error: ${result.error || `${result.failed} jobs failed`}`);
    }
  });

  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;

  console.log("\n" + "="*60);
  console.log(`TOTAL: ${passed} PASSED, ${failed} FAILED`);
  console.log("="*60);
}

// Run the tests
runTests().catch(console.error);