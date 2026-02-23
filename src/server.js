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
const { interpretWithAI, validateInputs } = require('./kit-ai-interpreter');

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
app.post('/api/restore/:jobId', async (req, res) => {
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

// Kit AI Interpretation Endpoint (NEW FLOW)
app.post('/api/submit-to-kit', async (req, res) => {
  try {
    console.log('🎯 Kit AI Endpoint - Received submission');
    
    // Extract raw form data
    const {
      sourceUrl,
      destinationUrl,
      wpUsername,
      wpPassword,
      contentTypeCertainPages,
      contentTypePostTypes,
      certainPagesTextarea,
      postTypesTextarea,
      specialInstructions,
      preserve
    } = req.body;
    
    // Basic validation
    const validation = validateInputs({
      sourceUrl,
      destinationUrl,
      wpUsername,
      wpPassword
    });
    
    if (!validation.valid) {
      return res.status(400).json({ 
        error: validation.errors.join(', ')
      });
    }
    
    // Test WP REST API connection (fail fast)
    console.log('🔌 Testing WordPress connection...');
    const wpConnection = await testWPConnection(destinationUrl, wpUsername, wpPassword);
    if (!wpConnection.valid) {
      return res.status(400).json({ 
        error: `WordPress connection failed: ${wpConnection.error}`,
        details: 'Please verify the destination URL and credentials are correct.'
      });
    }
    console.log('✅ WordPress connection successful');
    
    // Create job with status "processing_by_kit"
    const submissionData = {
      timestamp: new Date().toISOString(),
      requesterName: 'Team Member',
      requesterEmail: 'team@sheragency.com',
      priority: 'Normal',
      sourceUrl,
      destinationUrl,
      wpUsername,
      wpPassword,
      contentTypeCertainPages: contentTypeCertainPages || false,
      contentTypePostTypes: contentTypePostTypes || false,
      certainPagesRaw: certainPagesTextarea || '',
      postTypesRaw: postTypesTextarea || '',
      specialInstructions: specialInstructions || '',
      preserve: preserve || {},
      status: 'Processing by Kit'
    };
    
    console.log('📝 Creating job with status: processing_by_kit');
    const job = await jobManager.createJob(submissionData);
    
    // Update job status to processing_by_kit
    await jobManager.updateJob(job.jobId, {
      status: 'processing_by_kit',
      progress: {
        stage: 'kit_interpreting',
        message: 'Kit is interpreting your request...',
        percentComplete: 5,
        itemsProcessed: 0,
        itemsTotal: 0
      }
    });
    
    console.log(`✅ Job ${job.jobId} created with status: processing_by_kit`);
    
    // Log to Google Sheets immediately (without credentials)
    const safeSubmissionData = { ...submissionData };
    delete safeSubmissionData.wpUsername;
    delete safeSubmissionData.wpPassword;
    await logToGoogleSheet({ 
      ...safeSubmissionData, 
      jobId: job.jobId,
      status: 'Processing by Kit'
    });
    
    // Return jobId immediately for status polling
    res.json({
      success: true,
      message: 'Kit is interpreting your request...',
      jobId: job.jobId
    });
    
    // Background processing: AI interpretation + Forge spawning
    (async () => {
      try {
        console.log(`🤖 [${job.jobId}] Starting AI interpretation...`);
        
        // Update progress
        await jobManager.updateProgress(job.jobId, {
          stage: 'kit_interpreting',
          message: 'Interpreting content selections...',
          percentComplete: 10
        });
        
        // Call AI interpreter
        const interpretationResult = await interpretWithAI({
          contentTypeCertainPages,
          contentTypePostTypes,
          certainPagesRaw: certainPagesTextarea || '',
          postTypesRaw: postTypesTextarea || '',
          specialInstructions: specialInstructions || ''
        });
        
        console.log(`✅ [${job.jobId}] AI interpretation complete:`, JSON.stringify(interpretationResult.interpretation, null, 2));
        
        // Update job with interpreted data
        const interpretedData = {
          ...submissionData,
          certainPages: interpretationResult.interpretation.certainPages,
          postTypes: interpretationResult.interpretation.postTypes,
          specialInstructions: interpretationResult.interpretation.specialInstructions,
          aiInterpretation: interpretationResult,
          status: 'In Progress'
        };
        
        await jobManager.updateJob(job.jobId, {
          submissionData: interpretedData,
          progress: {
            stage: 'starting_migration',
            message: 'Starting migration with interpreted parameters...',
            percentComplete: 15
          }
        });
        
        console.log(`✅ [${job.jobId}] Updated job with interpreted data`);
        
        // Add to Kit's backlog with interpreted data
        const contentTypeDisplay = [];
        if (interpretationResult.interpretation.certainPages.length > 0) {
          contentTypeDisplay.push(`Certain Pages: ${interpretationResult.interpretation.certainPages.join(', ')}`);
        }
        if (interpretationResult.interpretation.postTypes.length > 0) {
          contentTypeDisplay.push(`Post Types: ${interpretationResult.interpretation.postTypes.join(', ')}`);
        }
        
        await addToKitBacklog({
          ...interpretedData,
          jobId: job.jobId,
          contentType: contentTypeDisplay.join(' | '),
          contentTypeDisplay: contentTypeDisplay.join(' | ')
        });
        
        console.log(`📋 [${job.jobId}] Added to Kit's backlog`);
        
        // Update status to in_progress
        await jobManager.updateJob(job.jobId, {
          status: 'running',
          progress: {
            stage: 'starting_migration',
            message: 'Migration framework initializing...',
            percentComplete: 20
          }
        });
        
        // Spawn Forge (call processJob)
        console.log(`🚀 [${job.jobId}] Spawning Forge to execute migration...`);
        await processJob(job.jobId);
        
        console.log(`✅ [${job.jobId}] Migration complete!`);
        
      } catch (error) {
        console.error(`❌ [${job.jobId}] Background processing error:`, error);
        
        // Update job with error
        await jobManager.failJob(job.jobId, error);
      }
    })();
    
  } catch (error) {
    console.error('❌ Kit AI endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error. Please try again or contact support.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Main submission endpoint (LEGACY - kept for backward compatibility)
app.post('/api/submit', async (req, res) => {
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

// QA Summary endpoint
app.get('/api/qa-summary/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const fs = require('fs-extra');
    const qaDir = path.join(__dirname, '../qa-reports', jobId);
    const summaryPath = path.join(qaDir, 'qa-summary.json');
    
    if (!fs.existsSync(summaryPath)) {
      return res.status(404).json({ error: 'QA summary not found' });
    }
    
    const summary = fs.readJsonSync(summaryPath);
    res.json(summary);
  } catch (error) {
    console.error('QA summary error:', error);
    res.status(500).json({ error: 'Failed to retrieve QA summary' });
  }
});

// QA Report HTML endpoint
app.get('/api/qa-report/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const fs = require('fs-extra');
    const qaDir = path.join(__dirname, '../qa-reports', jobId);
    const reportPath = path.join(qaDir, 'qa-report.html');
    
    if (!fs.existsSync(reportPath)) {
      return res.status(404).send('<html><body><h1>QA Report Not Found</h1><p>The QA report for this job is not available yet.</p></body></html>');
    }
    
    res.sendFile(reportPath);
  } catch (error) {
    console.error('QA report error:', error);
    res.status(500).send('<html><body><h1>Error</h1><p>Failed to load QA report.</p></body></html>');
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
