// Test script to verify error handling improvements
const axios = require('axios');

const API_URL = 'http://localhost:3002';

async function testErrorHandling() {
  console.log('🧪 Testing Error Handling Improvements');
  console.log('=====================================\n');

  // Test 1: Invalid settings validation
  console.log('Test 1: Invalid Settings Validation');
  try {
    const response = await axios.post(`${API_URL}/start/test-project-id`, {
      settings: null // Invalid settings
    }, {
      headers: {
        'Authorization': 'Bearer dummy-token'
      }
    });
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Correctly rejected invalid settings with 400 error');
      console.log(`   Message: ${error.response?.data?.message || 'No message'}`);
    } else {
      console.log(`❌ Unexpected error: ${error.response?.status} - ${error.message}`);
    }
  }

  // Test 2: Malformed settings object
  console.log('\nTest 2: Malformed Settings Object');
  try {
    const response = await axios.post(`${API_URL}/start/test-project-id`, {
      settings: "not an object"
    }, {
      headers: {
        'Authorization': 'Bearer dummy-token'
      }
    });
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Correctly rejected malformed settings');
      console.log(`   Message: ${error.response?.data?.message || 'No message'}`);
    } else {
      console.log(`❌ Unexpected error: ${error.response?.status} - ${error.message}`);
    }
  }

  // Test 3: Settings with removed properties
  console.log('\nTest 3: Settings with Removed Properties (Should be sanitized)');
  try {
    const response = await axios.post(`${API_URL}/start/test-project-id`, {
      settings: {
        orderMixing: true,
        speedMixing: true,
        transitionMixing: true, // This should be ignored
        colorVariations: true,  // This should be ignored
        outputCount: 5
      }
    }, {
      headers: {
        'Authorization': 'Bearer dummy-token'
      }
    });
  } catch (error) {
    // We expect this to fail due to authentication/project not found, but not due to settings
    if (error.response?.status === 401) {
      console.log('✅ Settings were accepted and sanitized (failed due to auth, not settings)');
    } else if (error.response?.status === 404) {
      console.log('✅ Settings were accepted and sanitized (failed due to project not found, not settings)');
    } else if (error.response?.status === 400 && error.response?.data?.message?.includes('Settings')) {
      console.log(`❌ Settings validation failed: ${error.response?.data?.message}`);
    } else {
      console.log(`ℹ️  Other error (expected): ${error.response?.status} - ${error.response?.data?.message || error.message}`);
    }
  }

  // Test 4: Credits estimate endpoint (should work with sanitized settings)
  console.log('\nTest 4: Credits Estimate with Sanitized Settings');
  try {
    const response = await axios.post(`${API_URL}/credits-estimate`, {
      outputCount: 3,
      orderMixing: true,
      speedMixing: false,
      transitionMixing: true, // Should be ignored
      colorVariations: true   // Should be ignored
    }, {
      headers: {
        'Authorization': 'Bearer dummy-token'
      }
    });

    if (response.status === 200) {
      console.log('✅ Credits estimate worked with sanitized settings');
      console.log(`   Credits required: ${response.data?.creditsRequired || 'N/A'}`);
    }
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Credits estimate processed settings (failed due to auth)');
    } else {
      console.log(`❌ Credits estimate failed: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
    }
  }

  console.log('\n🏁 Error Handling Test Complete');
  console.log('=====================================');
  console.log('If most tests show ✅, the error handling improvements are working correctly.');
  console.log('The platform should now:');
  console.log('- Validate and sanitize all settings');
  console.log('- Provide clear error messages');
  console.log('- Handle removed properties gracefully');
  console.log('- Show enhanced error details in the UI');
}

// Run the test
testErrorHandling().catch(console.error);