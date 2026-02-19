const fs = require('fs-extra');
const path = require('path');

/**
 * Job tracking manager
 * Stores job status and results in JSON files
 */

const JOBS_DIR = path.join(__dirname, '../jobs');

class JobManager {
  constructor() {
    this.ensureJobsDir();
  }

  async ensureJobsDir() {
    await fs.ensureDir(JOBS_DIR);
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

    await this.saveJob(job);
    return job;
  }

  /**
   * Update job status and progress
   */
  async updateJob(jobId, updates) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    Object.assign(job, updates);
    job.updatedAt = new Date().toISOString();

    await this.saveJob(job);
    return job;
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId, progressUpdates) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    Object.assign(job.progress, progressUpdates);
    job.updatedAt = new Date().toISOString();

    await this.saveJob(job);
    return job;
  }

  /**
   * Mark job as complete with results
   */
  async completeJob(jobId, results) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.status = 'complete';
    job.progress.stage = 'complete';
    job.progress.message = 'Migration complete';
    job.progress.percentComplete = 100;
    job.results = results;
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    await this.saveJob(job);
    return job;
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId, error) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.status = 'failed';
    job.progress.stage = 'failed';
    job.progress.message = 'Migration failed';
    job.errors.push({
      timestamp: new Date().toISOString(),
      message: error.message || error,
      stack: error.stack
    });
    job.failedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    await this.saveJob(job);
    return job;
  }

  /**
   * Store backup information
   */
  async setBackupInfo(jobId, backupInfo) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.backupInfo = backupInfo;
    job.updatedAt = new Date().toISOString();

    await this.saveJob(job);
    return job;
  }

  /**
   * Get job by ID
   */
  async getJob(jobId) {
    const jobPath = path.join(JOBS_DIR, `${jobId}.json`);
    
    try {
      if (await fs.pathExists(jobPath)) {
        return await fs.readJson(jobPath);
      }
      return null;
    } catch (error) {
      console.error('Error reading job:', error);
      return null;
    }
  }

  /**
   * Save job to disk
   */
  async saveJob(job) {
    const jobPath = path.join(JOBS_DIR, `${job.jobId}.json`);
    await fs.writeJson(jobPath, job, { spaces: 2 });
  }

  /**
   * List all jobs (newest first)
   */
  async listJobs(limit = 50) {
    await this.ensureJobsDir();
    
    const files = await fs.readdir(JOBS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    const jobs = [];
    for (const file of jsonFiles) {
      try {
        const job = await fs.readJson(path.join(JOBS_DIR, file));
        jobs.push(job);
      } catch (error) {
        console.error(`Error reading job file ${file}:`, error);
      }
    }

    // Sort by createdAt (newest first)
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return jobs.slice(0, limit);
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
   * Clean old jobs (older than 30 days)
   */
  async cleanOldJobs(daysToKeep = 30) {
    const jobs = await this.listJobs(1000);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    let cleaned = 0;
    for (const job of jobs) {
      const jobDate = new Date(job.createdAt);
      if (jobDate < cutoffDate) {
        const jobPath = path.join(JOBS_DIR, `${job.jobId}.json`);
        await fs.remove(jobPath);
        cleaned++;
      }
    }

    return cleaned;
  }
}

module.exports = new JobManager();
