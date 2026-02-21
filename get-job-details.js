#!/usr/bin/env node
/**
 * Get job details from Google Sheet
 */

const { google } = require('googleapis');
const fs = require('fs');

async function getJobDetails(jobId) {
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
    
    console.log(`📊 Getting details for job ${jobId}...\n`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Jobs!A:N'
    });
    
    const rows = response.data.values || [];
    
    // Find the job
    const jobRow = rows.find(row => row[0] === jobId);
    
    if (!jobRow) {
      console.log('❌ Job not found in sheet');
      return;
    }
    
    const headers = rows[0];
    
    console.log('Job Details:');
    console.log('='.repeat(60));
    
    headers.forEach((header, idx) => {
      const value = jobRow[idx] || '(empty)';
      console.log(`${header}: ${value}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const jobId = process.argv[2] || 'job-1771699494948-liprxi2';
getJobDetails(jobId);
