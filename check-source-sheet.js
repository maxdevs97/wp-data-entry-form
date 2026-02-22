require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

async function checkSheet() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    subject: 'max@sheragency.com'
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = '1_2ojO0QAtYiHVHGv1EGOoUi5i9Ady7ey4tJUEYAfXpk';
  
  // Get sheet info
  const info = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  console.log('📄 Sheet:', info.data.properties.title);
  console.log('📑 Tabs:', info.data.sheets.map(s => s.properties.title).join(', '));
  
  // Read first few rows
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A1:Z25'
  });
  
  const rows = response.data.values || [];
  console.log(`\n📊 Found ${rows.length} rows\n`);
  console.log('HEADER:', rows[0].join(' | '));
  console.log('\nFirst 5 data rows:');
  rows.slice(1, 6).forEach((row, i) => {
    console.log(`${i+2}. ${row.slice(0, 5).join(' | ')}`);
  });
}

checkSheet().catch(console.error);
