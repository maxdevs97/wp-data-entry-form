#!/usr/bin/env node

const { google } = require('googleapis');
const fs = require('fs');

async function createAuditSheet() {
  try {
    // Load credentials
    const credPath = process.env.GOOGLE_CREDENTIALS_PATH || 
                     '/Users/max/.openclaw/workspace/.env.google-service-account.json';
    const credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));

    // Create auth client
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      subject: 'max@sheragency.com'
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Create spreadsheet
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: 'WordPress Migration Requests - Audit Trail'
        },
        sheets: [{
          properties: {
            title: 'Submissions',
            gridProperties: {
              frozenRowCount: 1,
              frozenColumnCount: 1
            }
          }
        }]
      }
    });

    const spreadsheetId = response.data.spreadsheetId;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    console.log(`✅ Audit sheet created!`);
    console.log(`   ID: ${spreadsheetId}`);
    console.log(`   URL: ${spreadsheetUrl}`);

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

    // Format header row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.2, green: 0.3, blue: 0.5 },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: 0,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 10
              }
            }
          }
        ]
      }
    });

    console.log(`\n📋 Add this to your .env file:`);
    console.log(`   GOOGLE_SHEET_ID=${spreadsheetId}`);
    console.log(`\n🔗 Share this URL with the team for read-only access:`);
    console.log(`   ${spreadsheetUrl}`);

  } catch (error) {
    console.error('❌ Error creating audit sheet:', error.message);
    process.exit(1);
  }
}

createAuditSheet();
