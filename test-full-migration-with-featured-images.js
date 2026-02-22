#!/usr/bin/env node

const processor = require('./src/processor');
const jobManager = require('./src/jobs');

async function testMigration() {
  console.log('=== Starting Test Migration with Featured Images ===\n');
  
  // Create a test job
  const submissionData = {
    sourceUrl: 'https://mybabyswims.com',
    destinationUrl: 'https://mbstest3.sherstaging.com',
    wpUsername: 'clients@sheragency.com',
    wpPassword: 'x3KWwkjWMgVz2HcDot1VQSyx',
    contentTypePostTypes: true,
    postTypes: ['post'],
    preserve: {}
  };
  
  const job = await jobManager.createJob(submissionData, 'test@example.com');
  console.log('✅ Created test job:', job.id);
  console.log('');
  
  try {
    await processor.processJob(job.id);
    
    // Get the completed job
    const completedJob = await jobManager.getJob(job.id);
    
    console.log('\n=== Migration Complete ===');
    console.log('Status:', completedJob.status);
    console.log('Total Migrated:', completedJob.results?.totalMigrated);
    console.log('Total Failed:', completedJob.results?.totalFailed);
    console.log('');
    
    // Check if posts have featured images
    const axios = require('axios');
    const auth = Buffer.from('clients@sheragency.com:x3KWwkjWMgVz2HcDot1VQSyx').toString('base64');
    
    const response = await axios.get('https://mbstest3.sherstaging.com/wp-json/wp/v2/posts', {
      headers: { 'Authorization': `Basic ${auth}` },
      params: { per_page: 5, orderby: 'modified', order: 'desc' }
    });
    
    console.log('=== Verification: Recently Created Posts ===');
    response.data.forEach((post, i) => {
      console.log(`${i + 1}. "${post.title.rendered.substring(0, 50)}..."`);
      console.log(`   ID: ${post.id}`);
      console.log(`   Featured Media: ${post.featured_media > 0 ? `✅ YES (ID: ${post.featured_media})` : '❌ NO'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

testMigration();
