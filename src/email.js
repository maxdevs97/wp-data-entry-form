const nodemailer = require('nodemailer');

/**
 * Send confirmation email to requester
 */
async function sendConfirmationEmail(submissionData) {
  try {
    const transporter = createTransporter();
    
    const emailHtml = generateConfirmationEmail(submissionData);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@sheragency.com',
      to: submissionData.requesterEmail,
      subject: `WordPress Migration Request Received - ${submissionData.requesterName}`,
      html: emailHtml,
      text: generatePlainTextEmail(submissionData)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Confirmation email sent: ${info.messageId}`);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('Error sending email:', error);
    // Don't fail submission if email fails
    return { success: false, error: error.message };
  }
}

/**
 * Create email transporter
 */
function createTransporter() {
  // Support multiple email providers
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

/**
 * Generate HTML confirmation email
 */
function generateConfirmationEmail(data) {
  const timestamp = new Date(data.timestamp).toLocaleString('en-US', { 
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'short'
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
    .info-box { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .info-row { margin: 10px 0; }
    .label { font-weight: 600; color: #666; }
    .value { color: #333; }
    .footer { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #999; }
    .priority-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .priority-urgent { background: #fee; color: #c00; }
    .priority-normal { background: #e8f5e9; color: #2e7d32; }
  </style>
</head>
<body>
  <div class="header">
    <h1>✅ Migration Request Received</h1>
  </div>
  
  <div class="content">
    <p>Hi ${data.requesterName},</p>
    
    <p>Your WordPress migration request has been successfully submitted and added to our queue for review.</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="label">Submitted:</span> 
        <span class="value">${timestamp}</span>
      </div>
      <div class="info-row">
        <span class="label">Priority:</span> 
        <span class="priority-badge priority-${data.priority.toLowerCase()}">${data.priority}</span>
      </div>
      <div class="info-row">
        <span class="label">Source Site:</span> 
        <span class="value">${data.sourceUrl}</span>
      </div>
      <div class="info-row">
        <span class="label">Destination Site:</span> 
        <span class="value">${data.destinationUrl}</span>
      </div>
      <div class="info-row">
        <span class="label">Content Type:</span> 
        <span class="value">${data.contentType}</span>
      </div>
    </div>

    <h3>What happens next?</h3>
    <ol>
      <li>Kit will review your request and validate requirements</li>
      <li>Forge will be assigned to execute the migration</li>
      <li>Quality assurance checks will be performed</li>
      <li>You'll receive a completion notification with results</li>
    </ol>

    ${data.specialInstructions !== 'None' ? `
    <h3>Your Special Instructions:</h3>
    <div class="info-box">
      <p style="margin: 0; white-space: pre-wrap;">${data.specialInstructions}</p>
    </div>
    ` : ''}

    <p><strong>Estimated processing time:</strong> ${data.priority === 'Urgent' ? '1-2 business days' : '3-5 business days'}</p>

    <p>If you have any questions or need to make changes to your request, please reply to this email.</p>

    <p>Thank you,<br>
    <strong>Sher Agency Automation Team</strong></p>
  </div>

  <div class="footer">
    <p>This is an automated message from the WordPress Migration Request System.</p>
    <p>© ${new Date().getFullYear()} Sher Agency. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email (fallback)
 */
function generatePlainTextEmail(data) {
  const timestamp = new Date(data.timestamp).toLocaleString('en-US', { 
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'short'
  });

  return `
WordPress Migration Request Received
=====================================

Hi ${data.requesterName},

Your WordPress migration request has been successfully submitted and added to our queue for review.

REQUEST DETAILS
---------------
Submitted: ${timestamp}
Priority: ${data.priority}
Source Site: ${data.sourceUrl}
Destination Site: ${data.destinationUrl}
Content Type: ${data.contentType}

WHAT HAPPENS NEXT?
-------------------
1. Kit will review your request and validate requirements
2. Forge will be assigned to execute the migration
3. Quality assurance checks will be performed
4. You'll receive a completion notification with results

${data.specialInstructions !== 'None' ? `
SPECIAL INSTRUCTIONS
--------------------
${data.specialInstructions}
` : ''}

Estimated processing time: ${data.priority === 'Urgent' ? '1-2 business days' : '3-5 business days'}

If you have any questions or need to make changes to your request, please reply to this email.

Thank you,
Sher Agency Automation Team

---
This is an automated message from the WordPress Migration Request System.
© ${new Date().getFullYear()} Sher Agency. All rights reserved.
  `.trim();
}

module.exports = {
  sendConfirmationEmail
};
