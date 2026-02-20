#!/usr/bin/env node

/**
 * Test Job Manager directly
 * Tests job creation and retrieval without server
 */

const jobManager = require('./src/jobs');
const fs = require('fs-extra');
const path = require('path');

async function testJobManager() {
  console.log('🧪 Testing Job Manager\n');
  
  try {
    // Clean up test jobs
    const jobsDir = path.join(__dirname, 'jobs');
    console.log(`📁 Jobs directory: ${jobsDir}`);
    
    // Create a test job
    console.log('\n1️⃣ Creating test job...');
    const submissionData = {
      requesterName: 'Test User',
      requesterEmail: 'test@example.com',
      sourceUrl: 'https://source.com',
      destinationUrl: 'https://destination.com',
      contentTypeDisplay: 'Test Content',
      specialInstructions: 'Test instructions'
    };
    
    const job = await jobManager.createJob(submissionData);
    console.log(`✅ Job created with ID: ${job.jobId}`);
    
    // Verify job file exists
    const jobPath = path.join(jobsDir, `${job.jobId}.json`);
    const fileExists = await fs.pathExists(jobPath);
    console.log(`📄 Job file exists: ${fileExists ? '✅ YES' : '❌ NO'}`);
    
    if (!fileExists) {
      console.error('❌ TEST FAILED: Job file was not created!');
      return;
    }
    
    // Read the file directly
    const fileContent = await fs.readJson(jobPath);
    console.log(`📖 Job file content:`, JSON.stringify(fileContent, null, 2).substring(0, 200) + '...');
    
    // Test retrieval
    console.log('\n2️⃣ Testing job retrieval...');
    const retrievedJob = await jobManager.getJob(job.jobId);
    
    if (!retrievedJob) {
      console.error('❌ TEST FAILED: Job could not be retrieved!');
      return;
    }
    
    console.log(`✅ Job retrieved successfully`);
    console.log(`   Job ID: ${retrievedJob.jobId}`);
    console.log(`   Status: ${retrievedJob.status}`);
    console.log(`   Progress: ${retrievedJob.progress.percentComplete}%`);
    
    // Test immediate retrieval (race condition check)
    console.log('\n3️⃣ Testing immediate retrieval (race condition)...');
    const job2 = await jobManager.createJob(submissionData);
    const immediateRetrieval = await jobManager.getJob(job2.jobId);
    
    if (!immediateRetrieval) {
      console.error('❌ TEST FAILED: Job could not be retrieved immediately after creation!');
      console.error('   This indicates a race condition issue.');
      return;
    }
    
    console.log(`✅ Job retrieved immediately after creation`);
    
    // Test multiple rapid retrievals
    console.log('\n4️⃣ Testing multiple rapid retrievals...');
    const results = await Promise.all([
      jobManager.getJob(job.jobId),
      jobManager.getJob(job.jobId),
      jobManager.getJob(job.jobId),
      jobManager.getJob(job.jobId),
      jobManager.getJob(job.jobId)
    ]);
    
    const allSuccessful = results.every(r => r !== null);
    console.log(`   ${allSuccessful ? '✅' : '❌'} All 5 rapid retrievals ${allSuccessful ? 'succeeded' : 'failed'}`);
    
    if (!allSuccessful) {
      console.error('❌ TEST FAILED: Some rapid retrievals failed!');
      return;
    }
    
    // Test update
    console.log('\n5️⃣ Testing job update...');
    await jobManager.updateProgress(job.jobId, {
      stage: 'extracting',
      message: 'Extracting data...',
      percentComplete: 25,
      itemsTotal: 10
    });
    
    const updatedJob = await jobManager.getJob(job.jobId);
    if (updatedJob.progress.percentComplete !== 25) {
      console.error('❌ TEST FAILED: Job update did not persist!');
      return;
    }
    
    console.log(`✅ Job update persisted correctly (${updatedJob.progress.percentComplete}%)`);
    
    console.log('\n✅✅✅ ALL TESTS PASSED! ✅✅✅');
    console.log('\n📊 Summary:');
    console.log('   ✅ Job creation works');
    console.log('   ✅ Job file is written to disk');
    console.log('   ✅ Job retrieval works');
    console.log('   ✅ Immediate retrieval works (no race condition)');
    console.log('   ✅ Rapid concurrent retrievals work');
    console.log('   ✅ Job updates persist');
    
  } catch (error) {
    console.error('\n❌ TEST ERROR:', error);
    console.error(error.stack);
  }
}

testJobManager();
