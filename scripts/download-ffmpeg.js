const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🎬 FFmpeg Setup for Windows\n');

const FFMPEG_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
const FFMPEG_DIR = path.join(process.cwd(), 'ffmpeg');

async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        });
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

async function setupFFmpeg() {
  try {
    // Check if FFmpeg is already in PATH
    try {
      execSync('ffmpeg -version', { stdio: 'ignore' });
      console.log('✅ FFmpeg is already installed and available in PATH');
      return;
    } catch {
      console.log('FFmpeg not found in PATH, setting up local installation...\n');
    }

    // Check if local FFmpeg exists
    const localFFmpeg = path.join(FFMPEG_DIR, 'bin', 'ffmpeg.exe');
    if (fs.existsSync(localFFmpeg)) {
      console.log('✅ FFmpeg is already installed locally at:', FFMPEG_DIR);
      console.log('\n📝 Add this to your .env.development file:');
      console.log(`FFMPEG_PATH="${localFFmpeg.replace(/\\/g, '\\\\')}"`);
      console.log(`FFPROBE_PATH="${path.join(FFMPEG_DIR, 'bin', 'ffprobe.exe').replace(/\\/g, '\\\\')}"`);
      return;
    }

    console.log('📥 Downloading FFmpeg...');
    console.log('This may take a few minutes depending on your internet connection.\n');

    // Create ffmpeg directory
    if (!fs.existsSync(FFMPEG_DIR)) {
      fs.mkdirSync(FFMPEG_DIR, { recursive: true });
    }

    // Alternative: Direct download instructions
    console.log('🔗 Manual Download Option:');
    console.log('1. Visit: https://www.gyan.dev/ffmpeg/builds/');
    console.log('2. Download: ffmpeg-release-essentials.zip');
    console.log('3. Extract to:', FFMPEG_DIR);
    console.log('4. The structure should be: ffmpeg/bin/ffmpeg.exe\n');

    console.log('📝 After extraction, add these to your .env.development file:');
    console.log(`FFMPEG_PATH="${path.join(FFMPEG_DIR, 'bin', 'ffmpeg.exe').replace(/\\/g, '\\\\')}"`);
    console.log(`FFPROBE_PATH="${path.join(FFMPEG_DIR, 'bin', 'ffprobe.exe').replace(/\\/g, '\\\\')}"`);

    console.log('\n🔄 Alternative: Add FFmpeg to system PATH');
    console.log('1. Download FFmpeg from https://ffmpeg.org/download.html');
    console.log('2. Extract to C:\\ffmpeg');
    console.log('3. Add C:\\ffmpeg\\bin to your system PATH');
    console.log('4. Then use in .env.development:');
    console.log('   FFMPEG_PATH="ffmpeg"');
    console.log('   FFPROBE_PATH="ffprobe"');

  } catch (error) {
    console.error('❌ Error setting up FFmpeg:', error.message);
    process.exit(1);
  }
}

// Run setup
setupFFmpeg();