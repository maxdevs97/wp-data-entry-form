require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { validateRequest, testWPConnection } = require('./validators');
const { addToKitBacklog } = require('./backlog');
const { logToGoogleSheet } = require('./sheets');
const { sendConfirmationEmail } = require('./email');
const { logFeedbackToSheet, sendFeedbackNotificationEmail } = require('./feedback');
const jobManager = require('./jobs');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting: 3 requests per user per day
const submissionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3,
  message: { error: 'Rate limit exceeded. Maximum 3 requests per day per user.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use email as the rate limit key
    return req.body.requesterEmail || req.ip;
  }
});

// Password check middleware
const checkPassword = (req, res, next) => {
  const { password } = req.body;
  if (password !== process.env.FORM_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  next();
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Password verification endpoint
app.post('/api/verify-password', (req, res) => {
  const { password } = req.body;
  if (password === process.env.FORM_PASSWORD) {
    return res.json({ valid: true });
  }
  res.status(401).json({ valid: false, error: 'Invalid password' });
});

// Job status endpoint
app.get('/api/job-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobManager.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({ error: 'Failed to retrieve job status' });
  }
});

// Update job progress endpoint (called by migration framework)
app.post('/api/update-job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const updates = req.body;
    
    const job = await jobManager.updateJob(jobId, updates);
    
    res.json({ success: true, job });
  } catch (error) {
    console.error('Job update error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Feedback submission endpoint
app.post('/api/feedback', async (req, res) => {
  try {
    const { jobId, category, itemReference, message, requesterEmail, timestamp } = req.body;

    // Validate feedback data
    if (!jobId || !category || !message || !requesterEmail) {
      return res.status(400).json({ error: 'Missing required feedback fields' });
    }

    if (message.length < 10) {
      return res.status(400).json({ error: 'Feedback message must be at least 10 characters' });
    }

    const feedbackData = {
      jobId,
      category,
      itemReference: itemReference || '',
      message,
      requesterEmail,
      timestamp: timestamp || new Date().toISOString()
    };

    // Get job data for context in notification
    const job = await jobManager.getJob(jobId);

    // Log to Google Sheet
    await logFeedbackToSheet(feedbackData);

    // Send notification email to Max
    await sendFeedbackNotificationEmail(feedbackData, job);

    console.log(`✅ Feedback submitted for job ${jobId} by ${requesterEmail}`);

    res.json({ 
      success: true, 
      message: 'Thank you for your feedback! The team will review it shortly.'
    });

  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ 
      error: 'Failed to submit feedback. Please try again or contact support.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Restore backup endpoint
app.post('/api/restore/:jobId', checkPassword, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobManager.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (!job.backupInfo || !job.backupInfo.timestamp) {
      return res.status(400).json({ error: 'No backup available for this job' });
    }
    
    // Add restore request to Kit's backlog
    const restoreTask = {
      timestamp: new Date().toISOString(),
      type: 'restore_backup',
      jobId: job.jobId,
      backupTimestamp: job.backupInfo.timestamp,
      destinationUrl: job.submissionData.destinationUrl,
      requesterEmail: job.submissionData.requesterEmail,
      requesterName: job.submissionData.requesterName
    };
    
    await addToKitBacklog({
      ...restoreTask,
      requesterName: `RESTORE REQUEST - ${job.submissionData.requesterName}`,
      requesterEmail: job.submissionData.requesterEmail,
      sourceUrl: 'N/A (Restore)',
      destinationUrl: job.submissionData.destinationUrl,
      contentTypeDisplay: 'Backup Restoration',
      specialInstructions: `RESTORE BACKUP: ${job.backupInfo.timestamp}\nOriginal Job: ${job.jobId}\nBackup Directory: ${job.backupInfo.directory}`,
      status: 'Urgent - Restore Request'
    });
    
    res.json({ 
      success: true, 
      message: 'Restore request submitted to Kit. This will rollback the migration using the backup.',
      backupTimestamp: job.backupInfo.timestamp
    });
    
  } catch (error) {
    console.error('Restore request error:', error);
    res.status(500).json({ error: 'Failed to submit restore request' });
  }
});

// Main submission endpoint
app.post('/api/submit', submissionLimiter, checkPassword, async (req, res) => {
  try {
    const {
      requesterName,
      requesterEmail,
      sourceUrl,
      destinationUrl,
      wpUsername,
      wpPassword,
      contentTypeCertainPages,
      contentTypePostTypes,
      certainPages,
      postTypes,
      specialInstructions
    } = req.body;

    // Validate request
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Test WP REST API connection (fail fast)
    const wpConnection = await testWPConnection(destinationUrl, wpUsername, wpPassword);
    if (!wpConnection.valid) {
      return res.status(400).json({ 
        error: `WordPress connection failed: ${wpConnection.error}`,
        details: 'Please verify the destination URL and credentials are correct.'
      });
    }

    // Format content type for logging
    const contentTypeDisplay = [];
    if (contentTypeCertainPages) {
      contentTypeDisplay.push(`Certain Pages: ${certainPages.join(', ')}`);
    }
    if (contentTypePostTypes) {
      contentTypeDisplay.push(`Post Types: ${postTypes.join(', ')}`);
    }
    
    const submissionData = {
      timestamp: new Date().toISOString(),
      requesterName,
      requesterEmail,
      sourceUrl,
      destinationUrl,
      wpUsername, // Will be encrypted in real deployment
      wpPassword, // Will be encrypted in real deployment
      contentTypeCertainPages: contentTypeCertainPages || false,
      contentTypePostTypes: contentTypePostTypes || false,
      certainPages: certainPages || [],
      postTypes: postTypes || [],
      contentTypeDisplay: contentTypeDisplay.join(' | '),
      specialInstructions: specialInstructions || 'None',
      status: 'Pending Review'
    };

    // Create job for tracking
    const job = await jobManager.createJob(submissionData);

    // Add to Kit's backlog with job ID
    await addToKitBacklog({ ...submissionData, jobId: job.jobId });

    // Log to Google Sheet
    await logToGoogleSheet({ ...submissionData, jobId: job.jobId });

    // Note: Email notifications removed - using real-time polling instead

    res.json({ 
      success: true, 
      message: 'Migration request submitted successfully. Track progress below.',
      jobId: job.jobId,
      requestId: Buffer.from(submissionData.timestamp).toString('base64').substring(0, 12)
    });

  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ 
      error: 'Internal server error. Please try again or contact support.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 WordPress Data Entry Form running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
