const fetch = require('node-fetch');

async function testVideoAPI() {
  const baseUrl = 'http://localhost:3002/api/v1';

  try {
    // First, login to get token
    console.log('🔐 Logging in...');
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@videomix.pro',
        password: 'Admin123!'
      })
    });

    const loginData = await loginResponse.json();

    if (!loginData.success) {
      console.error('❌ Login failed:', loginData.error);
      return;
    }

    const token = loginData.data.token;
    console.log('✅ Login successful!');

    // Get projects
    console.log('\n📁 Fetching projects...');
    const projectsResponse = await fetch(`${baseUrl}/projects`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const projectsData = await projectsResponse.json();

    if (!projectsData.success) {
      console.error('❌ Failed to fetch projects:', projectsData.error);
      return;
    }

    console.log(`✅ Found ${projectsData.data.length} projects`);

    // Test Hijab project specifically
    const hijabProject = projectsData.data.find(p => p.name === 'Hijab');

    if (!hijabProject) {
      console.log('⚠️ Hijab project not found');
      return;
    }

    console.log(`\n🎬 Testing Hijab project (ID: ${hijabProject.id})`);

    // Get videos for Hijab project
    const videosResponse = await fetch(`${baseUrl}/videos/project/${hijabProject.id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const videosData = await videosResponse.json();

    if (!videosData.success) {
      console.error('❌ Failed to fetch videos:', videosData.error);
      return;
    }

    console.log(`✅ API returned ${videosData.data.length} videos`);

    // Check video details
    console.log('\n📊 Video Details:');
    videosData.data.forEach((video, index) => {
      console.log(`\n${index + 1}. ${video.originalName}`);
      console.log(`   - Status: ${video.status}`);
      console.log(`   - Has metadata: ${video.metadata ? 'Yes' : 'No'}`);
      console.log(`   - Format: ${video.format}`);
      console.log(`   - Duration: ${video.duration}s`);
    });

    // Count by status
    const statusCounts = videosData.data.reduce((acc, video) => {
      acc[video.status] = (acc[video.status] || 0) + 1;
      return acc;
    }, {});

    console.log('\n📈 Status Summary:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   - ${status}: ${count}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testVideoAPI();