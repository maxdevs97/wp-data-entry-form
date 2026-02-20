const sheets = require('./sheets');

/**
 * Job tracking manager - Google Sheets Edition
 * Stores job status and results in Google Sheets for persistence across deployments
 */

class JobManager {
  constructor() {
    console.log('✅ JobManager initialized with Google Sheets backend');
  }

  /**
   * Create a new job
   */
  async createJob(submissionData) {
    const jobId = this.generateJobId();
    const job = {
      jobId,
      status: 'pending', // pending | running | complete | failed
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submissionData: {
        requesterName: submissionData.requesterName,
        requesterEmail: submissionData.requesterEmail,
        sourceUrl: submissionData.sourceUrl,
        destinationUrl: submissionData.destinationUrl,
        contentTypeDisplay: submissionData.contentTypeDisplay,
        specialInstructions: submissionData.specialInstructions
      },
      progress: {
        stage: 'pending', // pending | extracting | transforming | inserting | verifying | complete
        message: 'Waiting to start...',
        percentComplete: 0,
        itemsProcessed: 0,
        itemsTotal: 0
      },
      results: null, // Will be populated on completion
      backupInfo: null, // Will be populated when backup is created
      errors: []
    };

    try {
      await sheets.appendJob(job);
      console.log(`✅ Job ${jobId} created and saved to Google Sheets`);
      return job;
    } catch (error) {
      console.error(`❌ Failed to create job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Update job status and progress
   */
  async updateJob(jobId, updates) {
    try {
      const updatedJob = await sheets.updateJobRow(jobId, updates);
      console.log(`✅ Job ${jobId} updated in Google Sheets`);
      return updatedJob;
    } catch (error) {
      console.error(`❌ Failed to update job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId, progressUpdates) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Merge progress updates
    const updatedProgress = {
      ...job.progress,
      ...progressUpdates
    };

    return await this.updateJob(jobId, { progress: updatedProgress });
  }

  /**
   * Mark job as complete with results
   */
  async completeJob(jobId, results) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const updates = {
      status: 'complete',
      progress: {
        ...job.progress,
        stage: 'complete',
        message: 'Migration complete',
        percentComplete: 100
      },
      results,
      completedAt: new Date().toISOString()
    };

    return await this.updateJob(jobId, updates);
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId, error) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const errorObj = {
      timestamp: new Date().toISOString(),
      message: error.message || error,
      stack: error.stack
    };

    const updates = {
      status: 'failed',
      progress: {
        ...job.progress,
        stage: 'failed',
        message: 'Migration failed'
      },
      errors: [...(job.errors || []), errorObj],
      failedAt: new Date().toISOString()
    };

    return await this.updateJob(jobId, updates);
  }

  /**
   * Store backup information
   */
  async setBackupInfo(jobId, backupInfo) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    return await this.updateJob(jobId, { backupInfo });
  }

  /**
   * Get job by ID
   */
  async getJob(jobId) {
    try {
      console.log(`🔍 Looking for job: ${jobId} in Google Sheets`);
      
      const jobData = await sheets.findJobRow(jobId);
      
      if (jobData) {
        console.log(`✅ Job ${jobId} found with status: ${jobData.job.status}`);
        return jobData.job;
      }
      
      console.error(`❌ Job ${jobId} not found in Google Sheets`);
      return null;
    } catch (error) {
      console.error(`❌ Error reading job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Save job to Google Sheets
   * This is kept for backward compatibility, but updateJob is preferred
   */
  async saveJob(job) {
    try {
      // Check if job exists
      const existingJob = await sheets.findJobRow(job.jobId);
      
      if (existingJob) {
        // Update existing job
        await sheets.updateJobRow(job.jobId, job);
      } else {
        // Append new job
        await sheets.appendJob(job);
      }
      
      console.log(`💾 Job ${job.jobId} saved successfully to Google Sheets`);
    } catch (error) {
      console.error(`❌ Failed to save job ${job.jobId}:`, error);
      throw error;
    }
  }

  /**
   * List all jobs (newest first)
   * Note: This is less efficient with Sheets, but kept for compatibility
   */
  async listJobs(limit = 50) {
    try {
      const { sheets: sheetsApi, spreadsheetId } = await sheets.getJobsSheet();
      
      const response = await sheetsApi.spreadsheets.values.get({
        spreadsheetId,
        range: 'Jobs!A:M'
      });

      const rows = response.data.values || [];
      const jobs = [];

      // Skip header row
      for (let i = 1; i < rows.length; i++) {
        try {
          const job = this.rowToJob(rows[i]);
          jobs.push(job);
        } catch (error) {
          console.error(`Error parsing job row ${i}:`, error);
        }
      }

      // Sort by createdAt (newest first)
      jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return jobs.slice(0, limit);
    } catch (error) {
      console.error('Error listing jobs:', error);
      return [];
    }
  }

  /**
   * Convert sheet row to job object (helper for listJobs)
   */
  rowToJob(row) {
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

    return {
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
        itemsTotal: parseInt(itemsTotal) || 0
      },
      results: resultsJson ? JSON.parse(resultsJson) : null,
      errors: errorMessage ? [{ message: errorMessage }] : []
    };
  }

  /**
   * Generate unique job ID
   */
  generateJobId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `job-${timestamp}-${random}`;
  }

  /**
   * Clean old jobs (older than X days)
   * Note: This is more complex with Sheets and not implemented yet
   * Jobs should be manually archived or cleaned via Sheet interface
   */
  async cleanOldJobs(daysToKeep = 30) {
    console.warn('cleanOldJobs not implemented for Google Sheets backend');
    console.warn('Please manually archive old jobs in the Google Sheet');
    return 0;
  }
}

module.exports = new JobManager();
