#!/usr/bin/env node
/**
 * Test script for the automated QA system
 * Verifies all components are working correctly
 */

const fs = require('fs-extra');
const path = require('path');

console.log('🧪 Testing Automated QA System');
console.log('================================\n');

// Test 1: Check if EnhancedContentVerifier module loads
console.log('Test 1: Loading EnhancedContentVerifier module...');
try {
  const EnhancedContentVerifier = require('./core/verify-enhanced');
  console.log('✅ EnhancedContentVerifier loaded successfully\n');
} catch (error) {
  console.error('❌ Failed to load EnhancedContentVerifier:', error.message);
  process.exit(1);
}

// Test 2: Check if processor.js imports the enhanced verifier
console.log('Test 2: Checking processor.js imports...');
try {
  const processorContent = fs.readFileSync('./src/processor.js', 'utf8');
  if (processorContent.includes("require('../core/verify-enhanced')")) {
    console.log('✅ Processor correctly imports EnhancedContentVerifier\n');
  } else {
    console.log('⚠️  Processor may still use old verifier\n');
  }
} catch (error) {
  console.error('❌ Failed to check processor:', error.message);
}

// Test 3: Check if status.html has QA section
console.log('Test 3: Checking status page QA section...');
try {
  const statusHtml = fs.readFileSync('./public/status.html', 'utf8');
  if (statusHtml.includes('qaSection') && statusHtml.includes('Quality Assurance Report')) {
    console.log('✅ Status page has QA section\n');
  } else {
    console.log('⚠️  Status page missing QA section\n');
  }
} catch (error) {
  console.error('❌ Failed to check status page:', error.message);
}

// Test 4: Check if status.js has QA loading functions
console.log('Test 4: Checking status.js QA functions...');
try {
  const statusJs = fs.readFileSync('./public/status.js', 'utf8');
  if (statusJs.includes('loadQAResults') && statusJs.includes('displayQAResults')) {
    console.log('✅ Status JS has QA display functions\n');
  } else {
    console.log('⚠️  Status JS missing QA functions\n');
  }
} catch (error) {
  console.error('❌ Failed to check status JS:', error.message);
}

// Test 5: Check if server.js has QA endpoints
console.log('Test 5: Checking server QA endpoints...');
try {
  const serverJs = fs.readFileSync('./src/server.js', 'utf8');
  const hasQaSummary = serverJs.includes('/api/qa-summary/:jobId');
  const hasQaReport = serverJs.includes('/api/qa-report/:jobId');
  
  if (hasQaSummary && hasQaReport) {
    console.log('✅ Server has both QA endpoints\n');
  } else {
    console.log('⚠️  Server missing QA endpoints\n');
    if (!hasQaSummary) console.log('   - Missing /api/qa-summary/:jobId');
    if (!hasQaReport) console.log('   - Missing /api/qa-report/:jobId');
  }
} catch (error) {
  console.error('❌ Failed to check server:', error.message);
}

// Test 6: Check if styles.css has QA styles
console.log('Test 6: Checking CSS for QA styles...');
try {
  const stylesCSS = fs.readFileSync('./public/styles.css', 'utf8');
  if (stylesCSS.includes('score-badge') && stylesCSS.includes('qa-summary')) {
    console.log('✅ CSS has QA styling\n');
  } else {
    console.log('⚠️  CSS missing some QA styles\n');
  }
} catch (error) {
  console.error('❌ Failed to check CSS:', error.message);
}

// Test 7: Simulate QA report generation
console.log('Test 7: Testing QA report generation...');
try {
  const EnhancedContentVerifier = require('./core/verify-enhanced');
  
  // Mock config
  const mockConfig = {
    source: {
      url: 'https://source.example.com',
      rest_endpoint: '/wp-json/wp/v2',
      auth: { method: 'none' }
    },
    destination: {
      url: 'https://dest.example.com',
      rest_endpoint: '/wp-json/wp/v2',
      auth: { method: 'application_password', username: 'test', password: 'test' }
    },
    directories: {
      snapshots: './content-snapshots/test',
      results: './insertion-results/test',
      qa_reports: './qa-reports/test'
    }
  };
  
  // Create test directories
  fs.ensureDirSync(mockConfig.directories.qa_reports);
  
  // Test HTML report generation
  const verifier = new EnhancedContentVerifier(mockConfig);
  const mockSummary = {
    total: 3,
    verified: 3,
    passed: 2,
    failed: 1,
    average_score: 88.5,
    items: [
      {
        title: 'Test Post 1',
        source_id: 1,
        destination_id: 101,
        destination_url: 'https://dest.example.com/test-post-1',
        overall_score: 95,
        passed: true,
        errors: [],
        checks: {}
      },
      {
        title: 'Test Post 2',
        source_id: 2,
        destination_id: 102,
        destination_url: 'https://dest.example.com/test-post-2',
        overall_score: 92,
        passed: true,
        errors: [],
        checks: {}
      },
      {
        title: 'Test Post 3',
        source_id: 3,
        destination_id: 103,
        destination_url: 'https://dest.example.com/test-post-3',
        overall_score: 78,
        passed: false,
        errors: [{ check: 'content_fidelity', message: 'Content mismatch' }],
        checks: {}
      }
    ],
    generated_at: new Date().toISOString()
  };
  
  verifier.generateHTMLReport(mockSummary);
  
  const reportPath = path.join(mockConfig.directories.qa_reports, 'qa-report.html');
  if (fs.existsSync(reportPath)) {
    const reportSize = fs.statSync(reportPath).size;
    console.log(`✅ HTML report generated successfully (${reportSize} bytes)`);
    console.log(`   Report location: ${reportPath}\n`);
    
    // Clean up test files
    fs.removeSync('./qa-reports/test');
  } else {
    console.log('⚠️  HTML report not created\n');
  }
} catch (error) {
  console.error('❌ Failed to test QA report generation:', error.message);
  console.error(error.stack);
}

console.log('================================');
console.log('✅ QA System Test Complete!\n');
console.log('Next steps:');
console.log('1. Test locally with: npm start');
console.log('2. Submit a test migration and check QA results');
console.log('3. Deploy to DigitalOcean when ready');
console.log('4. Verify QA reports appear on production');
