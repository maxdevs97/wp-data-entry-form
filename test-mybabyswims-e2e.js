#!/usr/bin/env node
require('dotenv').config();

async function runE2ETest() {
  console.log('🧪 WordPress Data Entry Form - E2E Test');
  console.log('Source: mybabyswims.com');
  console.log('Destination: mbstest3.wpengine.com');
  console.log('Post Types: post only (expect 9 items)\n');

  // Step 1: Submit migration
  console.log('📤 Step 1: Submitting migration...');
  
  const submissionData = {
    password: process.env.FORM_PASSWORD,
    sourceUrl: 'https://mybabyswims.com',
    destinationUrl: 'https://mbstest3.wpengine.com',
    wpUsername: 'maxschaffer',
    wpPassword: 'Vdkg dqdi OWi1 lMfZ ngVX YSTT',
    contentTypePostTypes: true,
    postTypes: 'post',
    specialInstructions: 'E2E test - verify 9 posts only (not 24 with pages)'
  };

  try {
    const submitResponse = await fetch('https://wp-data-entry-form-6u5hz.ondigitalocean.app/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submissionData)
    });

    const submitResult = await submitResponse.json();
    
    if (!submitResponse.ok) {
      console.error(`❌ Submission failed (${submitResponse.status}):`, submitResult);
      process.exit(1);
    }

    console.log('✅ Submission successful!');
    console.log('Job ID:', submitResult.jobId);
    console.log('Message:', submitResult.message);

    const jobId = submitResult.jobId;
    
    // Step 2: Poll for completion
    console.log('\n⏳ Step 2: Monitoring job progress...\n');
    
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes
    
    while (attempts < maxAttempts) {
      const statusResponse = await fetch(
        `https://wp-data-entry-form-6u5hz.ondigitalocean.app/api/job-status/${jobId}`
      );
      
      const job = await statusResponse.json();
      
      console.log(`[${new Date().toISOString().substr(11, 8)}] Status: ${job.status} | Progress: ${job.progress.percentComplete}% | Phase: ${job.progress.currentPhase}`);
      
      if (job.progress.details) {
        console.log(`  Details: ${job.progress.details}`);
      }
      
      // Check for completion or failure
      if (job.status === 'completed') {
        console.log('\n✅ Migration completed successfully!\n');
        console.log('=== FINAL RESULTS ===');
        console.log('Job ID:', job.jobId);
        console.log('Status:', job.status);
        console.log('Items Found:', job.results?.itemsFound || 'N/A');
        console.log('Items Cataloged:', job.results?.itemsCataloged || 'N/A');
        console.log('Items Migrated:', job.results?.itemsMigrated || 'N/A');
        console.log('Items Failed:', job.results?.itemsFailed || 'N/A');
        console.log('Content Types:', JSON.stringify(job.migrationPlan?.content_types || []));
        
        // Verify expectations
        console.log('\n=== VERIFICATION ===');
        const itemsFound = job.results?.itemsFound || 0;
        const contentTypes = job.migrationPlan?.content_types || [];
        
        if (itemsFound === 9) {
          console.log('✅ Items found: 9 (correct)');
        } else {
          console.log(`❌ Items found: ${itemsFound} (expected 9)`);
        }
        
        if (JSON.stringify(contentTypes) === '["post"]') {
          console.log('✅ Content types: ["post"] (correct)');
        } else {
          console.log(`❌ Content types: ${JSON.stringify(contentTypes)} (expected ["post"])`);
        }
        
        break;
      }
      
      if (job.status === 'failed' || job.status === 'error') {
        console.log('\n❌ Migration failed!\n');
        console.log('=== FAILURE DETAILS ===');
        console.log('Job ID:', job.jobId);
        console.log('Status:', job.status);
        console.log('Error:', job.error || 'Unknown error');
        console.log('Items Found:', job.results?.itemsFound || 'N/A');
        console.log('Content Types:', JSON.stringify(job.migrationPlan?.content_types || []));
        process.exit(1);
      }
      
      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      console.log('\n⏰ Test timeout - migration did not complete in 10 minutes');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ E2E test error:', error.message);
    process.exit(1);
  }
}

runE2ETest();
