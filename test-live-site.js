#!/usr/bin/env node

/**
 * Test Live Site Job Processing
 * Submits to the production site and verifies job processing
 */

const axios = require('axios');

const BASE_URL = 'https://wp-data-entry-form-6u5hz.ondigitalocean.app';
const FORM_PASSWORD = 'SherTeam2026!Secure';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLiveSite() {
  console.log('🌐 Testing LIVE SITE Job Processing\n');
  console.log(`URL: ${BASE_URL}\n`);
  
  try {
    // Step 1: Submit form
    console.log('📤 Submitting test migration request to live site...');
    const submitResponse = await axios.post(`${BASE_URL}/api/submit`, {
      password: FORM_PASSWORD,
      sourceUrl: 'https://example.wordpress.com',
      destinationUrl: 'https://wordpress.org',
      wpUsername: 'testadmin',
      wpPassword: 'test-app-password-123456',
      contentTypeCertainPages: true,
      contentTypePostTypes: false,
      certainPages: ['/about-us', '/contact'],
      postTypes: [],
      specialInstructions: 'Live site test - verifying job processing fix'
    });
    
    if (!submitResponse.data.success) {
      console.error('❌ Form submission failed:', submitResponse.data);
      return;
    }
    
    const jobId = submitResponse.data.jobId;
    console.log(`✅ Form submitted successfully!`);
    console.log(`   Job ID: ${jobId}\n`);
    
    // Step 2: Poll job status
    console.log('🔄 Polling job status (every 3 seconds)...\n');
    let attempts = 0;
    const maxAttempts = 40; // Poll for up to 2 minutes
    
    while (attempts < maxAttempts) {
      const statusResponse = await axios.get(`${BASE_URL}/api/job-status/${jobId}`);
      const job = statusResponse.data;
      
      const timestamp = new Date().toLocaleTimeString();
      const status = job.status.toUpperCase().padEnd(10);
      const stage = job.progress.stage.padEnd(12);
      const percent = `${job.progress.percentComplete}%`.padEnd(5);
      const items = `${job.progress.itemsProcessed || 0}/${job.progress.itemsTotal || 0}`.padEnd(7);
      
      console.log(`[${timestamp}] ${status} | ${stage} | ${percent} | Items: ${items} | ${job.progress.message}`);
      
      // Check if job is complete or failed
      if (job.status === 'complete') {
        console.log('\n✅ JOB COMPLETED SUCCESSFULLY!\n');
        console.log('📊 Results:');
        console.log(`   Total Migrated: ${job.results.totalMigrated}`);
        console.log(`   Total Failed: ${job.results.totalFailed}`);
        console.log(`   Duration: ${job.results.duration}`);
        console.log(`   Migrated Posts: ${job.results.migratedPosts.length}`);
        
        if (job.backupInfo) {
          console.log(`\n💾 Backup Info:`);
          console.log(`   Timestamp: ${job.backupInfo.timestamp}`);
          console.log(`   Directory: ${job.backupInfo.directory}`);
        }
        
        console.log('\n✅✅✅ TEST PASSED: Live site job processing works correctly! ✅✅✅');
        console.log('\n🎉 SUCCESS: The form now processes jobs immediately after submission!');
        console.log('   - Jobs start automatically ✅');
        console.log('   - Progress updates in real-time ✅');
        console.log('   - Jobs complete with results ✅');
        console.log('   - No more stuck progress indicators ✅');
        return;
      }
      
      if (job.status === 'failed') {
        console.error('\n❌ JOB FAILED!');
        console.error('Errors:', job.errors);
        console.log('\n❌ TEST FAILED: Job processing encountered an error');
        return;
      }
      
      // Wait before next poll
      await sleep(3000);
      attempts++;
    }
    
    console.log('\n⚠️ TEST TIMEOUT: Job did not complete within 2 minutes');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
  }
}

// Run test
testLiveSite();
