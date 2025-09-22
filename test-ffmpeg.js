// Test FFmpeg commands untuk debug video mixing issues
const { exec } = require('child_process');
const path = require('path');

const ffmpegPath = "C:\\Users\\yoppi\\Downloads\\package-creatorup-1.0.0\\bundle\\ffmpeg\\ffmpeg-2024-10-27-git-bb57b78013-essentials_build\\bin\\ffmpeg.exe";

// Test cases untuk berbagai kombinasi settings
const tests = [
  {
    name: "Test 1: Simple concat (no transitions, no speed)",
    command: `"${ffmpegPath}" -i uploads\\1758330314330_video_test_mix_2_.mp4 -i uploads\\1758330315645_video_test_mix.mp4 -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 4 -y test_concat.mp4`
  },
  {
    name: "Test 2: With speed change (no transitions)",
    command: `"${ffmpegPath}" -i uploads\\1758330314330_video_test_mix_2_.mp4 -i uploads\\1758330315645_video_test_mix.mp4 -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30,setpts=0.5*PTS[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30,setpts=0.5*PTS[v1];[v0][v1]concat=n=2:v=1:a=0[outv]" -map "[outv]" -t 2 -y test_speed.mp4`
  },
  {
    name: "Test 3: With transition (no speed)",
    command: `"${ffmpegPath}" -i uploads\\1758330314330_video_test_mix_2_.mp4 -i uploads\\1758330315645_video_test_mix.mp4 -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1];[v0][v1]xfade=offset=1.5:duration=0.5:transition=fade[outv]" -map "[outv]" -t 3.5 -y test_transition.mp4`
  },
  {
    name: "Test 4: With transition AND speed (problematic)",
    command: `"${ffmpegPath}" -i uploads\\1758330314330_video_test_mix_2_.mp4 -i uploads\\1758330315645_video_test_mix.mp4 -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v0t];[v0t]setpts=2*PTS[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30[v1t];[v1t]setpts=2*PTS[v1];[v0][v1]xfade=offset=3.5:duration=0.5:transition=fade[outv]" -map "[outv]" -t 7.5 -y test_transition_speed.mp4`
  },
  {
    name: "Test 5: Fix attempt - speed before fps",
    command: `"${ffmpegPath}" -i uploads\\1758330314330_video_test_mix_2_.mp4 -i uploads\\1758330315645_video_test_mix.mp4 -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,setpts=2*PTS,scale=640:480,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,setpts=2*PTS,scale=640:480,fps=30[v1];[v0][v1]xfade=offset=3.5:duration=0.5:transition=fade[outv]" -map "[outv]" -t 7.5 -y test_fix1.mp4`
  },
  {
    name: "Test 6: Fix attempt - explicit settb",
    command: `"${ffmpegPath}" -i uploads\\1758330314330_video_test_mix_2_.mp4 -i uploads\\1758330315645_video_test_mix.mp4 -filter_complex "[0:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30,setpts=2*PTS,settb=1/30,fps=30[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS,scale=640:480,fps=30,setpts=2*PTS,settb=1/30,fps=30[v1];[v0][v1]xfade=offset=3.5:duration=0.5:transition=fade[outv]" -map "[outv]" -t 7.5 -y test_fix2.mp4`
  }
];

async function runTest(test) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${test.name}`);
    console.log(`${'='.repeat(60)}`);

    exec(test.command, (error, stdout, stderr) => {
      if (error) {
        console.log(`❌ FAILED: ${test.name}`);
        console.log(`Error: ${error.message}`);
        if (stderr) console.log(`Stderr: ${stderr.substring(0, 500)}`);
      } else {
        console.log(`✅ SUCCESS: ${test.name}`);
      }
      resolve();
    });
  });
}

async function runAllTests() {
  console.log("Starting FFmpeg command tests...\n");

  for (const test of tests) {
    await runTest(test);
    // Wait 1 second between tests
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log("\n" + "=".repeat(60));
  console.log("All tests completed!");
  console.log("Check the generated files to see which approaches work.");
}

runAllTests();