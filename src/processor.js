const jobManager = require('./jobs');

/**
 * Migration Job Processor
 * Simulates the migration process with realistic stages and progress updates
 */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Process a migration job through all stages
 */
async function processJob(jobId) {
  try {
    console.log(`🚀 Starting job processing for ${jobId}`);
    
    // Get job details
    const job = await jobManager.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    // Update job to running
    await jobManager.updateJob(jobId, { status: 'running' });
    console.log(`✅ Job ${jobId} status set to 'running'`);
    
    // Stage 1: Extract data from source
    await extractData(jobId, job);
    
    // Stage 2: Transform/map content
    await transformData(jobId, job);
    
    // Stage 3: Insert into destination
    await insertData(jobId, job);
    
    // Stage 4: Verify migration
    await verifyMigration(jobId, job);
    
    // Stage 5: Complete with results
    await completeWithResults(jobId, job);
    
    console.log(`✅ Job ${jobId} completed successfully`);
    
  } catch (error) {
    console.error(`❌ Job ${jobId} failed:`, error);
    await jobManager.failJob(jobId, error);
  }
}

/**
 * Stage 1: Extract data from source
 */
async function extractData(jobId, job) {
  console.log(`[${jobId}] Stage 1: Extracting data from source...`);
  
  await jobManager.updateProgress(jobId, {
    stage: 'extracting',
    message: 'Extracting content from source site...',
    percentComplete: 10
  });
  
  // Simulate extraction time (2-4 seconds)
  await sleep(2000 + Math.random() * 2000);
  
  // Determine item count based on content type
  const { submissionData } = job;
  let itemsTotal = 0;
  
  if (submissionData.contentTypeCertainPages && submissionData.certainPages) {
    itemsTotal += submissionData.certainPages.length;
  }
  if (submissionData.contentTypePostTypes && submissionData.postTypes) {
    // Estimate 5-15 posts per post type
    itemsTotal += submissionData.postTypes.length * (5 + Math.floor(Math.random() * 10));
  }
  
  // Default to at least 5 items
  if (itemsTotal === 0) itemsTotal = 5;
  
  await jobManager.updateProgress(jobId, {
    stage: 'extracting',
    message: `Found ${itemsTotal} items to migrate`,
    percentComplete: 20,
    itemsTotal
  });
  
  console.log(`[${jobId}] ✅ Extraction complete: ${itemsTotal} items found`);
  await sleep(1000);
}

/**
 * Stage 2: Transform/map content
 */
async function transformData(jobId, job) {
  console.log(`[${jobId}] Stage 2: Transforming content...`);
  
  await jobManager.updateProgress(jobId, {
    stage: 'transforming',
    message: 'Mapping content structure and preserving settings...',
    percentComplete: 30
  });
  
  // Simulate transformation time
  await sleep(2000 + Math.random() * 2000);
  
  await jobManager.updateProgress(jobId, {
    stage: 'transforming',
    message: 'Content transformation complete',
    percentComplete: 40
  });
  
  console.log(`[${jobId}] ✅ Transformation complete`);
  await sleep(1000);
}

/**
 * Stage 3: Insert into destination (with progress updates)
 */
async function insertData(jobId, job) {
  console.log(`[${jobId}] Stage 3: Inserting data into destination...`);
  
  const currentJob = await jobManager.getJob(jobId);
  const { itemsTotal } = currentJob.progress;
  
  await jobManager.updateProgress(jobId, {
    stage: 'inserting',
    message: 'Beginning content insertion...',
    percentComplete: 45,
    itemsProcessed: 0
  });
  
  // Simulate processing items one by one with progress updates
  for (let i = 1; i <= itemsTotal; i++) {
    // Calculate progress (45% -> 85% during insertion)
    const progressPercent = 45 + Math.floor((i / itemsTotal) * 40);
    
    await jobManager.updateProgress(jobId, {
      stage: 'inserting',
      message: `Inserting item ${i} of ${itemsTotal}...`,
      percentComplete: progressPercent,
      itemsProcessed: i
    });
    
    // Simulate time per item (0.5-1.5 seconds)
    await sleep(500 + Math.random() * 1000);
  }
  
  console.log(`[${jobId}] ✅ Insertion complete: ${itemsTotal} items inserted`);
  await sleep(500);
}

/**
 * Stage 4: Verify migration
 */
async function verifyMigration(jobId, job) {
  console.log(`[${jobId}] Stage 4: Verifying migration...`);
  
  await jobManager.updateProgress(jobId, {
    stage: 'verifying',
    message: 'Verifying all content was migrated successfully...',
    percentComplete: 90
  });
  
  // Simulate verification time
  await sleep(2000 + Math.random() * 2000);
  
  await jobManager.updateProgress(jobId, {
    stage: 'verifying',
    message: 'Verification complete',
    percentComplete: 95
  });
  
  console.log(`[${jobId}] ✅ Verification complete`);
  await sleep(500);
}

/**
 * Stage 5: Complete with results
 */
async function completeWithResults(jobId, job) {
  console.log(`[${jobId}] Stage 5: Finalizing results...`);
  
  const currentJob = await jobManager.getJob(jobId);
  const { itemsTotal, itemsProcessed } = currentJob.progress;
  const { submissionData } = currentJob;
  
  // Generate mock results based on migrated items
  const migratedPosts = [];
  
  // If certain pages were specified, use those
  if (submissionData.certainPages && submissionData.certainPages.length > 0) {
    submissionData.certainPages.forEach((pagePath, index) => {
      migratedPosts.push({
        title: pagePath.split('/').pop() || `Page ${index + 1}`,
        sourceUrl: `${submissionData.sourceUrl}${pagePath}`,
        destinationUrl: `${submissionData.destinationUrl}${pagePath}`
      });
    });
  }
  
  // Add some post type items
  if (submissionData.postTypes && submissionData.postTypes.length > 0) {
    const remainingItems = itemsTotal - migratedPosts.length;
    for (let i = 0; i < remainingItems; i++) {
      const postType = submissionData.postTypes[i % submissionData.postTypes.length];
      migratedPosts.push({
        title: `${postType.charAt(0).toUpperCase() + postType.slice(1)} ${i + 1}`,
        sourceUrl: `${submissionData.sourceUrl}/${postType}/${i + 1}`,
        destinationUrl: `${submissionData.destinationUrl}/${postType}/${i + 1}`
      });
    }
  }
  
  // Calculate duration
  const startTime = new Date(currentJob.createdAt);
  const endTime = new Date();
  const durationMs = endTime - startTime;
  const durationSeconds = Math.floor(durationMs / 1000);
  const durationMinutes = Math.floor(durationSeconds / 60);
  const remainingSeconds = durationSeconds % 60;
  const duration = durationMinutes > 0 
    ? `${durationMinutes}m ${remainingSeconds}s`
    : `${durationSeconds}s`;
  
  const results = {
    totalMigrated: itemsProcessed || itemsTotal,
    totalFailed: 0,
    duration,
    migratedPosts: migratedPosts.slice(0, itemsTotal), // Cap at itemsTotal
    completedAt: endTime.toISOString()
  };
  
  // Create backup info (simulated)
  const backupInfo = {
    timestamp: new Date().toISOString(),
    directory: `/backups/${jobId}`,
    message: 'Backup created before migration (simulated for demo)'
  };
  
  await jobManager.setBackupInfo(jobId, backupInfo);
  await jobManager.completeJob(jobId, results);
  
  console.log(`[${jobId}] ✅ Job completed with ${results.totalMigrated} items migrated in ${duration}`);
}

module.exports = {
  processJob
};
