const { google } = require('googleapis');
const fs = require('fs');

async function addColumnN() {
  const credentials = JSON.parse(fs.readFileSync('../.env.google-service-account.json', 'utf-8'));
  
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    subject: 'max@sheragency.com'
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || '1_2ojO0QAtYiHVHGv1EGOoUi5i9Ady7ey4tJUEYAfXpk';

  console.log('Adding "Submission Data JSON" header to column N...');

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Jobs!N1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [['Submission Data JSON']]
    }
  });

  console.log('✅ Column N header added successfully!');
}

addColumnN().catch(console.error);
