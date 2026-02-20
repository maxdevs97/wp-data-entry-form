const { google } = require('googleapis');
const fs = require('fs');
const nodemailer = require('nodemailer');

// Load Google Service Account credentials
let credentials;
try {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || 
                   '/Users/max/.openclaw/workspace-forge/.env.google-service-account.json';
  credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
} catch (error) {
  console.error('⚠️ Google credentials not found. Feedback logging will be skipped.');
  credentials = null;
}

/**
 * Log feedback to Google Sheet
 */
async function logFeedbackToSheet(feedbackData) {
  if (!credentials) {
    console.warn('Skipping Google Sheet logging (no credentials)');
    return { success: false, reason: 'No credentials' };
  }

  try {
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      subject: 'max@sheragency.com'
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!spreadsheetId) {
      console.warn('No GOOGLE_SHEET_ID configured for feedback logging');
      return { success: false, reason: 'No sheet ID' };
    }

    // Ensure Feedback tab exists
    await ensureFeedbackTab(sheets, spreadsheetId);

    // Append feedback row
    return await appendFeedbackToSheet(sheets, spreadsheetId, feedbackData);

  } catch (error) {
    console.error('Error logging feedback to Google Sheet:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Ensure Feedback tab exists in the spreadsheet
 */
async function ensureFeedbackTab(sheets, spreadsheetId) {
  try {
    // Get existing sheets
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheet.data.sheets || [];
    
    const feedbackTabExists = existingSheets.some(
      sheet => sheet.properties.title === 'Feedback'
    );

    if (!feedbackTabExists) {
      // Create Feedback tab
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: 'Feedback',
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            }
          }]
        }
      });

      // Add header row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Feedback!A1:G1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'Timestamp',
            'Job ID',
            'Category',
            'Item Reference',
            'Message',
            'Requester Email',
            'Status'
          ]]
        }
      });

      console.log('✅ Created Feedback tab in Google Sheet');
    }

  } catch (error) {
    console.error('Error ensuring Feedback tab:', error);
    throw error;
  }
}

/**
 * Append feedback row to sheet
 */
async function appendFeedbackToSheet(sheets, spreadsheetId, data) {
  const row = [
    data.timestamp,
    data.jobId,
    data.category,
    data.itemReference || 'N/A',
    data.message,
    data.requesterEmail,
    'New'
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Feedback!A:G',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row]
    }
  });

  console.log(`✅ Logged feedback to Google Sheet: ${spreadsheetId}`);
  return { success: true, spreadsheetId };
}

/**
 * Send feedback notification email to Max
 */
async function sendFeedbackNotificationEmail(feedbackData, jobData) {
  try {
    const transporter = createTransporter();
    
    const categoryLabels = {
      wrong_label: 'Wrong Post Type Label',
      missing_data: 'Missing Data/Content',
      incorrect_mapping: 'Incorrect Mapping',
      broken_link: 'Broken Link or URL',
      formatting_issue: 'Formatting Issue',
      other: 'Other Issue'
    };

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .container { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .info-box { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff6b6b; }
    .label { font-weight: 600; color: #666; display: inline-block; width: 140px; }
    .value { color: #333; }
    .message-box { background: #fff8f8; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffe0e0; }
    .message-box pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; font-family: inherit; }
    .footer { background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #999; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; background: #fee; color: #c00; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📣 New Migration Feedback Received</h1>
    </div>
    
    <div class="content">
      <p>A user has reported an issue with a migration.</p>
      
      <div class="info-box">
        <p><span class="label">Job ID:</span> <span class="value">${feedbackData.jobId}</span></p>
        <p><span class="label">Category:</span> <span class="badge">${categoryLabels[feedbackData.category] || feedbackData.category}</span></p>
        <p><span class="label">Item Reference:</span> <span class="value">${feedbackData.itemReference || 'Not specified'}</span></p>
        <p><span class="label">Submitted by:</span> <span class="value">${feedbackData.requesterEmail}</span></p>
        <p><span class="label">Timestamp:</span> <span class="value">${new Date(feedbackData.timestamp).toLocaleString('en-US', { timeZone: 'America/Chicago' })}</span></p>
      </div>

      <h3>User's Message:</h3>
      <div class="message-box">
        <pre>${feedbackData.message}</pre>
      </div>

      ${jobData ? `
      <h3>Related Migration:</h3>
      <div class="info-box">
        <p><span class="label">Source:</span> <span class="value">${jobData.submissionData.sourceUrl}</span></p>
        <p><span class="label">Destination:</span> <span class="value">${jobData.submissionData.destinationUrl}</span></p>
        <p><span class="label">Content Type:</span> <span class="value">${jobData.submissionData.contentTypeDisplay}</span></p>
        <p><span class="label">Status:</span> <span class="value">${jobData.status}</span></p>
      </div>
      ` : ''}

      <p><strong>Action Required:</strong> Please review this feedback and investigate the reported issue.</p>
      
      <p style="margin-top: 30px;">
        <a href="https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit#gid=Feedback" 
           style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          View Feedback in Google Sheets →
        </a>
      </p>
    </div>

    <div class="footer">
      <p>WordPress Migration Feedback System</p>
      <p>© ${new Date().getFullYear()} Sher Agency</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@sheragency.com',
      to: 'max@sheragency.com',
      subject: `🚨 Migration Feedback: ${categoryLabels[feedbackData.category]} - Job ${feedbackData.jobId}`,
      html: emailHtml
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Feedback notification email sent to Max: ${info.messageId}`);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('Error sending feedback notification email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create email transporter
 */
function createTransporter() {
  if (process.env.EMAIL_PROVIDER === 'smtp') {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Default: console logger for development
  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true
  });
}

module.exports = {
  logFeedbackToSheet,
  sendFeedbackNotificationEmail
};
