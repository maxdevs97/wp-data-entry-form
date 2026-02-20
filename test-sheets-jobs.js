#!/usr/bin/env node

/**
 * Test script for Google Sheets job storage
 * Tests: create, get, update, and list jobs
 */

require('dotenv').config();
const jobManager = require('./src/jobs');

async function testJobStorage() {
  console.log('\n🧪 Testing Google Sheets Job Storage\n');
  
  try {
    // Test 1: Create a job
    console.log('📝 Test 1: Creating a new job...');
    const submissionData = {
      requesterName: 'Test User',
      requesterEmail: 'test@example.com',
      sourceUrl: 'https://source.example.com',
      destinationUrl: 'https://dest.example.com',
      contentTypeDisplay: 'All Pages',
      specialInstructions: 'Test migration'
    };
    
    const job = await jobManager.createJob(submissionData);
    console.log(`✅ Job created with ID: ${job.jobId}`);
    console.log(`   Status: ${job.status}, Stage: ${job.progress.stage}`);
    
    // Wait a moment for sheets API
    await sleep(1000);
    
    // Test 2: Get the job
    console.log('\n🔍 Test 2: Retrieving job by ID...');
    const retrievedJob = await jobManager.getJob(job.jobId);
    
    if (!retrievedJob) {
      throw new Error('Job not found after creation!');
    }
    
    console.log(`✅ Job retrieved successfully`);
    console.log(`   Job ID: ${retrievedJob.jobId}`);
    console.log(`   Status: ${retrievedJob.status}`);
    console.log(`   Stage: ${retrievedJob.progress.stage}`);
    
    // Test 3: Update job progress
    console.log('\n🔄 Test 3: Updating job progress...');
    await jobManager.updateProgress(job.jobId, {
      stage: 'extracting',
      message: 'Extracting content...',
      percentComplete: 25,
      itemsTotal: 10
    });
    
    await sleep(1000);
    
    const updatedJob = await jobManager.getJob(job.jobId);
    console.log(`✅ Job progress updated`);
    console.log(`   Stage: ${updatedJob.progress.stage}`);
    console.log(`   Progress: ${updatedJob.progress.percentComplete}%`);
    console.log(`   Items Total: ${updatedJob.progress.itemsTotal}`);
    
    // Test 4: Update with more progress
    console.log('\n🔄 Test 4: Simulating migration progress...');
    
    for (let i = 1; i <= 10; i++) {
      await jobManager.updateProgress(job.jobId, {
        stage: 'inserting',
        message: `Inserting item ${i} of 10...`,
        percentComplete: 50 + (i * 4),
        itemsProcessed: i,
        itemsTotal: 10
      });
      
      await sleep(500); // 500ms between updates
    }
    
    console.log(`✅ Progress updates completed`);
    
    // Test 5: Complete the job
    console.log('\n✅ Test 5: Completing job with results...');
    const results = {
      totalMigrated: 10,
      totalFailed: 0,
      duration: '15s',
      completedAt: new Date().toISOString()
    };
    
    await jobManager.completeJob(job.jobId, results);
    
    await sleep(1000);
    
    const completedJob = await jobManager.getJob(job.jobId);
    console.log(`✅ Job completed successfully`);
    console.log(`   Status: ${completedJob.status}`);
    console.log(`   Stage: ${completedJob.progress.stage}`);
    console.log(`   Progress: ${completedJob.progress.percentComplete}%`);
    console.log(`   Items Migrated: ${completedJob.results.totalMigrated}`);
    
    // Test 6: Test missing job
    console.log('\n❓ Test 6: Testing non-existent job...');
    const missingJob = await jobManager.getJob('job-nonexistent-12345');
    
    if (missingJob === null) {
      console.log(`✅ Correctly returned null for missing job`);
    } else {
      throw new Error('Should have returned null for missing job');
    }
    
    // Test 7: List all jobs
    console.log('\n📋 Test 7: Listing all jobs...');
    const allJobs = await jobManager.listJobs(5);
    console.log(`✅ Retrieved ${allJobs.length} jobs`);
    
    for (const j of allJobs) {
      console.log(`   - ${j.jobId}: ${j.status} (${j.progress.stage})`);
    }
    
    console.log('\n✅ All tests passed!');
    console.log(`\n🔗 View jobs in Google Sheets:`);
    console.log(`   https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit#gid=0`);
    console.log(`\n💡 Test job ID: ${job.jobId}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
testJobStorage();
