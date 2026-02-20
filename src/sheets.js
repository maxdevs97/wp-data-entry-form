const { google } = require('googleapis');
const fs = require('fs');

// Load Google Service Account credentials
let credentials;
try {
  // Try environment variable first (for DigitalOcean deployment)
  if (process.env.GOOGLE_CREDENTIALS) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    console.log('✅ Google credentials loaded from environment variable');
  } 
  // Fall back to file path (for local development)
  else if (process.env.GOOGLE_CREDENTIALS_PATH) {
    const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
    credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    console.log('✅ Google credentials loaded from file path');
  }
  else {
    throw new Error('No Google credentials found in environment');
  }
} catch (error) {
  console.error('⚠️ Google credentials not found. Sheet logging will be skipped.', error.message);
  credentials = null;
}

/**
 * Log submission to Google Sheet audit trail
 */
async function logToGoogleSheet(submissionData) {
  if (!credentials) {
    console.warn('Skipping Google Sheet logging (no credentials)');
    return { success: false, reason: 'No credentials' };
  }

  try {
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      subject: 'max@sheragency.com' // Impersonate Max
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!spreadsheetId) {
      // Create new spreadsheet if ID not provided
      const newSheet = await createAuditSheet(sheets);
      console.log(`📊 Created new audit sheet: ${newSheet.url}`);
      console.log(`⚠️ Add GOOGLE_SHEET_ID=${newSheet.id} to your .env file`);
      return await appendToSheet(sheets, newSheet.id, submissionData);
    }

    return await appendToSheet(sheets, spreadsheetId, submissionData);

  } catch (error) {
    console.error('Error logging to Google Sheet:', error);
    // Don't fail the submission if sheet logging fails
    return { success: false, error: error.message };
  }
}

/**
 * Create new audit trail spreadsheet
 */
async function createAuditSheet(sheets) {
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'WordPress Migration Requests - Audit Trail'
      },
      sheets: [{
        properties: {
          title: 'Submissions',
          gridProperties: {
            frozenRowCount: 1
          }
        }
      }]
    }
  });

  const spreadsheetId = response.data.spreadsheetId;

  // Add header row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Submissions!A1:J1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        'Timestamp',
        'Requester',
        'Email',
        'Source URL',
        'Destination URL',
        'Content Type',
        'Priority',
        'Status',
        'Completion Time',
        'Notes'
      ]]
    }
  });

  // Make sheet publicly readable
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateSpreadsheetProperties: {
          properties: {
            title: 'WordPress Migration Requests - Audit Trail'
          },
          fields: 'title'
        }
      }]
    }
  });

  return {
    id: spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
  };
}

/**
 * Append row to existing sheet
 */
async function appendToSheet(sheets, spreadsheetId, data) {
  const row = [
    data.timestamp,
    data.requesterName || 'Team Member',
    data.requesterEmail || 'team@sheragency.com',
    data.sourceUrl,
    data.destinationUrl,
    data.contentType || data.contentTypeDisplay || 'N/A',
    data.priority || 'Normal',
    data.status,
    '', // Completion time (filled later)
    data.specialInstructions || 'None'
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Submissions!A:J',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row]
    }
  });

  console.log(`✅ Logged to Google Sheet: ${spreadsheetId}`);
  return { success: true, spreadsheetId };
}

module.exports = {
  logToGoogleSheet
};
