#!/usr/bin/env node
/**
 * Check Google Sheet for jobs
 */

const { google } = require('googleapis');
const fs = require('fs');

async function checkSheet() {
  try {
    // Load credentials from parent directory
    const credPath = '../.env.google-service-account.json';
    const credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      subject: 'max@sheragency.com'
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1_2ojO0QAtYiHVHGv1EGOoUi5i9Ady7ey4tJUEYAfXpk';
    
    console.log('📊 Checking Google Sheet for jobs...\n');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Jobs!A:N'
    });
    
    const rows = response.data.values || [];
    
    console.log(`Found ${rows.length} rows (including header)\n`);
    
    if (rows.length > 0) {
      console.log('Header:', rows[0].join(' | '));
      console.log('');
    }
    
    // Show last 10 jobs
    const dataRows = rows.slice(1);
    const recentJobs = dataRows.slice(-10);
    
    console.log(`Last ${recentJobs.length} jobs:`);
    recentJobs.forEach((row, idx) => {
      const jobId = row[0];
      const status = row[1];
      const stage = row[2];
      const progress = row[3];
      const createdAt = row[9];
      
      console.log(`${idx + 1}. ${jobId} | ${status} | ${stage} | ${progress}% | ${createdAt}`);
    });
    
    // Check for our recent test jobs
    const testJobs = dataRows.filter(row => 
      row[0] && row[0].includes('job-177169')
    );
    
    if (testJobs.length > 0) {
      console.log(`\n🔍 Found ${testJobs.length} recent test job(s):`);
      testJobs.forEach(row => {
        console.log(`  ${row[0]} | Status: ${row[1]} | Stage: ${row[2]}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSheet();
