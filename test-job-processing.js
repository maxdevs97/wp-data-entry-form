#!/usr/bin/env node

/**
 * Test Job Processing
 * Submits a form and polls for job updates to verify processing works
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const FORM_PASSWORD = process.env.FORM_PASSWORD || 'test-password';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testJobProcessing() {
  console.log('🧪 Testing Job Processing\n');
  
  try {
    // Step 1: Submit form
    console.log('📤 Submitting test migration request...');
    const submitResponse = await axios.post(`${BASE_URL}/api/submit`, {
      password: FORM_PASSWORD,
      sourceUrl: 'https://example.com',
      destinationUrl: 'https://destination.com',
      wpUsername: 'admin',
      wpPassword: 'test-app-password-1234',
      contentTypeCertainPages: true,
      contentTypePostTypes: true,
      certainPages: ['/about', '/contact', '/services'],
      postTypes: ['post', 'page'],
      specialInstructions: 'Test migration for job processing verification'
    });
    
    if (!submitResponse.data.success) {
      console.error('❌ Form submission failed:', submitResponse.data);
      return;
    }
    
    const jobId = submitResponse.data.jobId;
    console.log(`✅ Form submitted successfully!`);
    console.log(`   Job ID: ${jobId}\n`);
    
    // Step 2: Poll job status
    console.log('🔄 Polling job status (every 2 seconds)...\n');
    let attempts = 0;
    const maxAttempts = 60; // Poll for up to 2 minutes
    
    while (attempts < maxAttempts) {
      const statusResponse = await axios.get(`${BASE_URL}/api/job-status/${jobId}`);
      const job = statusResponse.data;
      
      console.log(`[${new Date().toLocaleTimeString()}] Status: ${job.status} | Stage: ${job.progress.stage} | Progress: ${job.progress.percentComplete}%`);
      console.log(`   Message: ${job.progress.message}`);
      console.log(`   Items: ${job.progress.itemsProcessed || 0} / ${job.progress.itemsTotal || 0}\n`);
      
      // Check if job is complete or failed
      if (job.status === 'complete') {
        console.log('✅ JOB COMPLETED SUCCESSFULLY!\n');
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
        
        console.log('\n✅ TEST PASSED: Job processing works correctly!');
        return;
      }
      
      if (job.status === 'failed') {
        console.error('❌ JOB FAILED!');
        console.error('Errors:', job.errors);
        console.log('\n❌ TEST FAILED: Job processing encountered an error');
        return;
      }
      
      // Wait before next poll
      await sleep(2000);
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
testJobProcessing();
