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

// Cache for job reads (10 second TTL for running jobs, 5 seconds for completed)
const jobCache = new Map();
const JOB_CACHE_TTL_RUNNING = 10000; // 10 seconds for active jobs
const JOB_CACHE_TTL_COMPLETE = 5000; // 5 seconds for completed jobs

/**
 * Get authenticated Google Sheets client
 */
function getAuthenticatedSheets() {
  if (!credentials) {
    throw new Error('Google credentials not available');
  }

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    subject: 'max@sheragency.com' // Impersonate Max
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Retry wrapper with exponential backoff for rate-limited API calls
 */
async function retryWithBackoff(fn, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // If rate limited (429), wait and retry
      if (error.code === 429 || (error.errors && error.errors[0]?.reason === 'rateLimitExceeded')) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s
        console.warn(`⚠️ Rate limited. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      // For other errors, don't retry
      throw error;
    }
  }
  
  // All retries exhausted
  throw lastError;
}

/**
 * Get or create the Jobs sheet
 */
async function getJobsSheet() {
  const sheets = getAuthenticatedSheets();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID environment variable not set');
  }

  try {
    // Check if Jobs sheet exists
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const jobsSheet = response.data.sheets.find(
      sheet => sheet.properties.title === 'Jobs'
    );

    if (jobsSheet) {
      return { sheets, spreadsheetId, sheetId: jobsSheet.properties.sheetId };
    }

    // Create Jobs sheet if it doesn't exist
    console.log('Creating Jobs sheet...');
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: 'Jobs',
              gridProperties: {
                frozenRowCount: 1
              }
            }
          }
        }]
      }
    });

    // Add header row
    const headers = [
      'Job ID',
      'Status',
      'Stage',
      'Progress',
      'Items Processed',
      'Total Items',
      'Source URL',
      'Destination URL',
      'Content Type',
      'Created At',
      'Updated At',
      'Results JSON',
      'Error Message'
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Jobs!A1:M1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers]
      }
    });

    console.log('✅ Jobs sheet created with headers');

    // Get the newly created sheet ID
    const updatedResponse = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const newJobsSheet = updatedResponse.data.sheets.find(
      sheet => sheet.properties.title === 'Jobs'
    );

    return { sheets, spreadsheetId, sheetId: newJobsSheet.properties.sheetId };

  } catch (error) {
    console.error('Error getting/creating Jobs sheet:', error);
    throw error;
  }
}

/**
 * Find a job row by Job ID
 * Returns { rowIndex, job } or null if not found
 */
async function findJobRow(jobId) {
  // Check cache first with dynamic TTL based on job status
  const cached = jobCache.get(jobId);
  if (cached) {
    const ttl = (cached.data && (cached.data.job.status === 'complete' || cached.data.job.status === 'failed'))
      ? JOB_CACHE_TTL_COMPLETE
      : JOB_CACHE_TTL_RUNNING;
    
    if (Date.now() - cached.timestamp < ttl) {
      console.log(`📦 Cache hit for job ${jobId} (${ttl}ms TTL)`);
      return cached.data;
    }
  }

  const { sheets, spreadsheetId } = await getJobsSheet();

  try {
    const response = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Jobs!A:M'
      });
    });

    const rows = response.data.values || [];
    
    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] === jobId) {
        const job = rowToJob(row);
        const result = { rowIndex: i + 1, job }; // +1 for 1-indexed sheets
        
        // Cache the result
        jobCache.set(jobId, { timestamp: Date.now(), data: result });
        
        return result;
      }
    }

    // DON'T cache null results - this causes race conditions when jobs are just created
    // If the job doesn't exist yet, the next call will check again
    return null;

  } catch (error) {
    console.error(`Error finding job ${jobId}:`, error);
    return null;
  }
}

/**
 * Convert sheet row to job object
 */
function rowToJob(row) {
  const [
    jobId,
    status,
    stage,
    progress,
    itemsProcessed,
    itemsTotal,
    sourceUrl,
    destinationUrl,
    contentType,
    createdAt,
    updatedAt,
    resultsJson,
    errorMessage
  ] = row;

  const job = {
    jobId,
    status,
    createdAt,
    updatedAt,
    submissionData: {
      sourceUrl,
      destinationUrl,
      contentTypeDisplay: contentType
    },
    progress: {
      stage,
      percentComplete: parseInt(progress) || 0,
      itemsProcessed: parseInt(itemsProcessed) || 0,
      itemsTotal: parseInt(itemsTotal) || 0,
      message: getStageMessage(stage, parseInt(progress) || 0)
    },
    results: resultsJson ? JSON.parse(resultsJson) : null,
    errors: errorMessage ? [{ message: errorMessage }] : []
  };

  return job;
}

/**
 * Convert job object to sheet row
 */
function jobToRow(job) {
  return [
    job.jobId,
    job.status,
    job.progress.stage,
    job.progress.percentComplete,
    job.progress.itemsProcessed,
    job.progress.itemsTotal,
    job.submissionData.sourceUrl,
    job.submissionData.destinationUrl,
    job.submissionData.contentTypeDisplay || job.submissionData.contentType || 'N/A',
    job.createdAt,
    job.updatedAt,
    job.results ? JSON.stringify(job.results) : '',
    job.errors && job.errors.length > 0 ? job.errors[0].message : ''
  ];
}

/**
 * Get descriptive message for stage
 */
function getStageMessage(stage, progress) {
  const messages = {
    pending: 'Waiting to start...',
    extracting: 'Extracting content from source site...',
    transforming: 'Mapping content structure...',
    inserting: 'Inserting content into destination...',
    verifying: 'Verifying migration...',
    complete: 'Migration complete',
    failed: 'Migration failed',
    error: 'An error occurred'
  };
  return messages[stage] || `Processing... ${progress}%`;
}

/**
 * Append a new job to the Jobs sheet
 */
async function appendJob(job) {
  const { sheets, spreadsheetId } = await getJobsSheet();

  const row = jobToRow(job);

  try {
    await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Jobs!A:M',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [row]
        }
      });
    });

    console.log(`✅ Job ${job.jobId} appended to Google Sheets`);
    
    // Invalidate cache for this job
    jobCache.delete(job.jobId);
    
    return true;
  } catch (error) {
    console.error(`Error appending job ${job.jobId}:`, error);
    throw error;
  }
}

/**
 * Update a job row in the Jobs sheet
 */
async function updateJobRow(jobId, updates) {
  const jobData = await findJobRow(jobId);
  
  if (!jobData) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const { rowIndex, job } = jobData;
  const { sheets, spreadsheetId } = await getJobsSheet();

  // Merge updates
  const updatedJob = {
    ...job,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  // Handle nested updates
  if (updates.progress) {
    updatedJob.progress = { ...job.progress, ...updates.progress };
  }
  if (updates.submissionData) {
    updatedJob.submissionData = { ...job.submissionData, ...updates.submissionData };
  }

  const row = jobToRow(updatedJob);

  try {
    await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Jobs!A${rowIndex}:M${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [row]
        }
      });
    });

    console.log(`✅ Job ${jobId} updated in Google Sheets`);
    
    // Invalidate cache for this job
    jobCache.delete(jobId);
    
    return updatedJob;
  } catch (error) {
    console.error(`Error updating job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Log submission to Google Sheet audit trail (Submissions sheet)
 */
async function logToGoogleSheet(submissionData) {
  if (!credentials) {
    console.warn('Skipping Google Sheet logging (no credentials)');
    return { success: false, reason: 'No credentials' };
  }

  try {
    const sheets = getAuthenticatedSheets();
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

  // Add header row (credentials intentionally excluded for security)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Submissions!A1:K1',
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
        'Notes',
        'Job ID'
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
 * NOTE: Credentials (wpUsername, wpPassword) are intentionally excluded for security
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
    data.specialInstructions || 'None',
    data.jobId || 'N/A' // Track job ID for reference
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Submissions!A:K',
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
  logToGoogleSheet,
  getJobsSheet,
  findJobRow,
  appendJob,
  updateJobRow
};
