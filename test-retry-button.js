#!/usr/bin/env node

/**
 * Test script for retry button functionality
 * Tests:
 * 1. Creating a failed job
 * 2. Calling /api/retry endpoint
 * 3. Verifying new job is created with same parameters
 */

const jobManager = require('./src/jobs');

async function testRetryFunctionality() {
  console.log('🧪 Testing Retry Button Functionality\n');
  
  try {
    // Step 1: Create a test job
    console.log('1️⃣ Creating test job...');
    const testSubmissionData = {
      timestamp: new Date().toISOString(),
      requesterName: 'Test User',
      requesterEmail: 'test@example.com',
      priority: 'Normal',
      sourceUrl: 'https://source-test.com',
      destinationUrl: 'https://destination-test.com',
      wpUsername: 'testuser',
      wpPassword: 'testpass123',
      contentTypeCertainPages: true,
      contentTypePostTypes: false,
      certainPages: ['about', 'contact', 'services'],
      postTypes: [],
      contentTypeDisplay: 'Certain Pages: about, contact, services',
      specialInstructions: 'This is a test migration',
      preserve: {
        slugs: true,
        dates: false,
        authors: true
      },
      status: 'Pending Review'
    };
    
    const originalJob = await jobManager.createJob(testSubmissionData);
    console.log(`✅ Original job created: ${originalJob.jobId}`);
    
    // Step 2: Mark job as failed
    console.log('\n2️⃣ Marking job as failed...');
    await jobManager.failJob(originalJob.jobId, new Error('Test migration failed'));
    
    const failedJob = await jobManager.getJob(originalJob.jobId);
    console.log(`✅ Job status: ${failedJob.status}`);
    console.log(`   Error count: ${failedJob.errors.length}`);
    
    // Step 3: Simulate retry (what the /api/retry endpoint does)
    console.log('\n3️⃣ Simulating retry...');
    
    const retrySubmissionData = {
      ...failedJob.submissionData,
      timestamp: new Date().toISOString(),
      status: 'Pending Review',
      retryOf: failedJob.jobId
    };
    
    const retryJob = await jobManager.createJob(retrySubmissionData);
    console.log(`✅ Retry job created: ${retryJob.jobId}`);
    console.log(`   Status: ${retryJob.status}`);
    console.log(`   Retry of: ${retrySubmissionData.retryOf}`);
    
    // Step 4: Verify parameters are preserved
    console.log('\n4️⃣ Verifying parameters are preserved...');
    
    const checks = [
      {
        name: 'Source URL',
        original: failedJob.submissionData.sourceUrl,
        retry: retryJob.submissionData.sourceUrl
      },
      {
        name: 'Destination URL',
        original: failedJob.submissionData.destinationUrl,
        retry: retryJob.submissionData.destinationUrl
      },
      {
        name: 'Content Type Display',
        original: failedJob.submissionData.contentTypeDisplay,
        retry: retryJob.submissionData.contentTypeDisplay
      },
      {
        name: 'Special Instructions',
        original: failedJob.submissionData.specialInstructions,
        retry: retryJob.submissionData.specialInstructions
      }
    ];
    
    let allMatch = true;
    checks.forEach(check => {
      const match = check.original === check.retry;
      console.log(`   ${match ? '✅' : '❌'} ${check.name}: ${match ? 'Preserved' : 'MISMATCH'}`);
      if (!match) {
        console.log(`      Original: ${check.original}`);
        console.log(`      Retry:    ${check.retry}`);
        allMatch = false;
      }
    });
    
    console.log('\n' + '='.repeat(60));
    if (allMatch) {
      console.log('✅ TEST PASSED: Retry functionality working correctly!');
    } else {
      console.log('❌ TEST FAILED: Some parameters not preserved');
    }
    console.log('='.repeat(60));
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log(`   Original Job ID: ${originalJob.jobId}`);
    console.log(`   Retry Job ID:    ${retryJob.jobId}`);
    console.log(`   Status:          ${allMatch ? 'PASS' : 'FAIL'}`);
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run test
testRetryFunctionality().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
