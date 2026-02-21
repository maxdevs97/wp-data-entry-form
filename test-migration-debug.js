#!/usr/bin/env node
/**
 * Test migration submission with debug logging
 */

const axios = require('axios');

const API_URL = 'https://wp-data-entry-form-6u5hz.ondigitalocean.app';
const FORM_PASSWORD = 'SherTeam2026!Secure';

async function submitMigration() {
  console.log('🧪 Submitting test migration...\n');
  
  const payload = {
    password: FORM_PASSWORD, // Form password in body
    sourceUrl: 'https://mybabyswims.com/',
    destinationUrl: 'https://mbstest3.sherstaging.com/',
    wpUsername: 'clients@sheragency.com',
    wpPassword: 'x3KWwkjWMgVz2HcDot1VQSyx',
    contentTypePostTypes: true,
    postTypes: ['post'], // Only posts
    preserve: {
      dates: true,
      authors: true,
      slugs: true,
      metadata: true
    }
  };
  
  try {
    const response = await axios.post(`${API_URL}/api/submit`, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Migration submitted successfully!\n');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    const jobId = response.data.jobId;
    const statusUrl = `${API_URL}/status/${jobId}`;
    
    console.log('\n📊 Status page:', statusUrl);
    console.log('🔗 Job ID:', jobId);
    
    // Wait a moment, then check status
    console.log('\n⏳ Waiting 20 seconds before checking status (Google Sheets sync)...');
    await new Promise(resolve => setTimeout(resolve, 20000));
    
    // Poll status for 2 minutes
    console.log('\n📡 Polling status...\n');
    
    for (let i = 0; i < 24; i++) { // 24 x 5 sec = 2 minutes
      const statusResponse = await axios.get(`${API_URL}/api/status/${jobId}`);
      const status = statusResponse.data;
      
      console.log(`[${new Date().toLocaleTimeString()}] Status: ${status.status} | Stage: ${status.stage || 'N/A'} | Progress: ${status.percentComplete || 0}%`);
      console.log(`  Items: Total=${status.itemsTotal || 0}, Cataloged=${status.itemsCataloged || 0}, Migrated=${status.totalMigrated || 0}, Failed=${status.totalFailed || 0}`);
      console.log(`  Message: ${status.message || 'N/A'}\n`);
      
      if (status.status === 'complete' || status.status === 'failed') {
        console.log('\n🏁 Migration finished!');
        console.log('Final status:', JSON.stringify(status, null, 2));
        
        if (status.itemsTotal === 9 && status.itemsCataloged === 9 && status.totalMigrated === 9 && status.totalFailed === 0) {
          console.log('\n✅✅✅ PERFECT! 9/9/9/0 achieved! ✅✅✅');
        } else {
          console.log('\n❌ Test FAILED - results not perfect:');
          console.log(`  Expected: 9 total, 9 cataloged, 9 migrated, 0 failed`);
          console.log(`  Got: ${status.itemsTotal} total, ${status.itemsCataloged} cataloged, ${status.totalMigrated} migrated, ${status.totalFailed} failed`);
        }
        
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second intervals
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

submitMigration();
