#!/usr/bin/env node

const https = require('https');

const BASE_URL = 'https://solofiles.azurewebsites.net';

async function testEndpoint(path, description) {
  return new Promise((resolve) => {
    console.log(`\n🔍 Testing ${description}...`);
    console.log(`   URL: ${BASE_URL}${path}`);
    
    const req = https.request(`${BASE_URL}${path}`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log(`   ✅ Status: ${res.statusCode}`);
          console.log(`   📄 Response:`, JSON.stringify(parsed, null, 2));
          resolve({ success: true, data: parsed, status: res.statusCode });
        } catch (error) {
          console.log(`   ❌ Status: ${res.statusCode}`);
          console.log(`   📄 Raw response: ${data.substring(0, 200)}...`);
          resolve({ success: false, error: 'Invalid JSON', status: res.statusCode });
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ Error: ${error.message}`);
      resolve({ success: false, error: error.message });
    });
    
    req.setTimeout(10000, () => {
      console.log(`   ⏰ Request timed out`);
      req.abort();
      resolve({ success: false, error: 'Timeout' });
    });
    
    req.end();
  });
}

async function main() {
  console.log('🚀 Testing Azure SMB File Browser Pagination Deployment');
  console.log('=' .repeat(60));
  
  // Test endpoints
  const tests = [
    { path: '/api/pagination-test', desc: 'Pagination Test Endpoint' },
    { path: '/api/pagination-test?page=2&limit=10', desc: 'Pagination Test with Params' },
    { path: '/api/health', desc: 'Health Check' },
    { path: '/api/browse?page=1&limit=10', desc: 'Browse API with Pagination' },
    { path: '/', desc: 'Frontend HTML' }
  ];
  
  let successCount = 0;
  let totalTests = tests.length;
  
  for (const test of tests) {
    const result = await testEndpoint(test.path, test.desc);
    if (result.success) {
      successCount++;
    }
    
    // Add a small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log(`📊 Results: ${successCount}/${totalTests} tests passed`);
  
  if (successCount === totalTests) {
    console.log('🎉 All tests passed! Pagination deployment appears successful.');
  } else {
    console.log('⚠️  Some tests failed. Deployment may need troubleshooting.');
  }
  
  console.log('\nIf tests are failing, please check:');
  console.log('1. Azure Web App is running and not stopped');
  console.log('2. GitHub Actions deployment completed successfully');
  console.log('3. No configuration or environment variable issues');
  console.log('4. Try accessing the app directly in browser');
}

// Run the tests
main().catch(console.error);