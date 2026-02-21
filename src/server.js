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
const { processJob } = require('./processor');

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

// Status page route (serves status.html for /status URLs)
app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/status.html'));
});

// Rate limiting: DISABLED for testing
// const submissionLimiter = rateLimit({
//   windowMs: 24 * 60 * 60 * 1000, // 24 hours
//   max: 3,
//   message: { error: 'Rate limit exceeded. Maximum 3 requests per day.' },
//   standardHeaders: true,
//   legacyHeaders: false,
//   keyGenerator: (req) => {
//     // Use IP address as the rate limit key
//     return req.ip;
//   }
// });

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
    console.log(`📡 Job status request for: ${jobId}`);
    
    const job = await jobManager.getJob(jobId);
    
    if (!job) {
      console.error(`❌ Job ${jobId} not found when polling`);
      return res.status(404).json({ error: 'Job not found' });
    }
    
    console.log(`✅ Returning job ${jobId} status: ${job.status} (${job.progress.percentComplete}%)`);
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
      requesterEmail: requesterEmail || 'team-member',
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

// Retry failed migration endpoint
app.post('/api/retry', async (req, res) => {
  try {
    const { jobId } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    console.log(`🔄 Retry request for job: ${jobId}`);
    
    // Retrieve the original job
    const originalJob = await jobManager.getJob(jobId);
    
    if (!originalJob) {
      return res.status(404).json({ error: 'Original job not found' });
    }
    
    // Only allow retry for failed jobs
    if (originalJob.status !== 'failed' && originalJob.status !== 'error') {
      return res.status(400).json({ 
        error: 'Can only retry failed jobs',
        currentStatus: originalJob.status
      });
    }
    
    console.log(`✅ Found original job. Creating new job with same parameters...`);
    
    // Extract original submission data (with all settings preserved)
    const retrySubmissionData = {
      ...originalJob.submissionData,
      timestamp: new Date().toISOString(),
      status: 'Pending Review',
      retryOf: jobId // Track that this is a retry
    };
    
    // Create new job
    const newJob = await jobManager.createJob(retrySubmissionData);
    console.log(`✅ Retry job created: ${newJob.jobId}`);
    
    // Verify job can be retrieved
    const verifyJob = await jobManager.getJob(newJob.jobId);
    if (!verifyJob) {
      console.error(`❌ CRITICAL: Retry job ${newJob.jobId} cannot be retrieved!`);
      throw new Error('Job creation failed - file system error');
    }
    
    // Start background processing
    processJob(newJob.jobId).catch(err => {
      console.error(`❌ Background retry job ${newJob.jobId} processing error:`, err);
    });
    
    // Add to Kit's backlog
    await addToKitBacklog({ 
      ...retrySubmissionData, 
      jobId: newJob.jobId,
      specialInstructions: `[RETRY of ${jobId}] ${retrySubmissionData.specialInstructions || 'None'}`
    });
    
    // Log to Google Sheet
    const safeSubmissionData = { ...retrySubmissionData };
    delete safeSubmissionData.wpUsername;
    delete safeSubmissionData.wpPassword;
    await logToGoogleSheet({ ...safeSubmissionData, jobId: newJob.jobId });
    
    console.log(`✅ Retry successful. New job ID: ${newJob.jobId}`);
    
    res.json({
      success: true,
      message: 'Retry migration created successfully',
      newJobId: newJob.jobId,
      originalJobId: jobId
    });
    
  } catch (error) {
    console.error('Retry error:', error);
    res.status(500).json({ 
      error: 'Failed to create retry migration',
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
      destinationUrl: job.submissionData.destinationUrl
    };
    
    await addToKitBacklog({
      ...restoreTask,
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
app.post('/api/submit', checkPassword, async (req, res) => {
  try {
    const {
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
      requesterName: 'Team Member', // Default value for team submissions
      requesterEmail: 'team@sheragency.com', // Default value
      priority: 'Normal', // Default priority
      sourceUrl,
      destinationUrl,
      wpUsername, // Will be encrypted in real deployment
      wpPassword, // Will be encrypted in real deployment
      contentTypeCertainPages: contentTypeCertainPages || false,
      contentTypePostTypes: contentTypePostTypes || false,
      certainPages: certainPages || [],
      postTypes: postTypes || [],
      contentType: contentTypeDisplay.join(' | '), // For backlog/sheets compatibility
      contentTypeDisplay: contentTypeDisplay.join(' | '),
      specialInstructions: specialInstructions || 'None',
      preserve: req.body.preserve || {}, // Store preserve preferences
      status: 'Pending Review'
    };

    // Create job for tracking
    console.log(`📝 Creating new job for migration...`);
    const job = await jobManager.createJob(submissionData);
    console.log(`✅ Job created: ${job.jobId}`);

    // Verify job can be retrieved immediately (catches file system issues)
    const verifyJob = await jobManager.getJob(job.jobId);
    if (!verifyJob) {
      console.error(`❌ CRITICAL: Job ${job.jobId} was created but cannot be retrieved!`);
      throw new Error('Job creation failed - file system error');
    }
    console.log(`✅ Job ${job.jobId} verified and ready for polling`);

    // Start background job processing immediately (non-blocking)
    processJob(job.jobId).catch(err => {
      console.error(`❌ Background job ${job.jobId} processing error:`, err);
    });

    // Add to Kit's backlog with job ID
    await addToKitBacklog({ ...submissionData, jobId: job.jobId });

    // Log to Google Sheet (exclude credentials for security)
    const safeSubmissionData = { ...submissionData };
    delete safeSubmissionData.wpUsername;
    delete safeSubmissionData.wpPassword;
    await logToGoogleSheet({ ...safeSubmissionData, jobId: job.jobId });

    // Note: Email notifications removed - using real-time polling instead

    console.log(`✅ Returning response with jobId: ${job.jobId}`);
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
