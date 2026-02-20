const axios = require('axios');

/**
 * Job tracking integration for WordPress Data Entry Form
 * Updates job status and progress during migration
 */

class JobTracker {
  constructor(jobId, formApiUrl = 'http://localhost:3000') {
    this.jobId = jobId;
    this.formApiUrl = formApiUrl;
    this.enabled = !!jobId;
  }

  /**
   * Update job status
   */
  async updateStatus(status) {
    if (!this.enabled) return;
    
    try {
      await axios.post(`${this.formApiUrl}/api/update-job/${this.jobId}`, {
        status
      });
    } catch (error) {
      console.error('[JobTracker] Failed to update status:', error.message);
    }
  }

  /**
   * Update job progress
   */
  async updateProgress(stage, message, percentComplete = 0, itemsProcessed = 0, itemsTotal = 0) {
    if (!this.enabled) return;
    
    try {
      await axios.post(`${this.formApiUrl}/api/update-job/${this.jobId}`, {
        progress: {
          stage,
          message,
          percentComplete,
          itemsProcessed,
          itemsTotal
        }
      });
    } catch (error) {
      console.error('[JobTracker] Failed to update progress:', error.message);
    }
  }

  /**
   * Set backup information
   */
  async setBackupInfo(backupInfo) {
    if (!this.enabled) return;
    
    try {
      await axios.post(`${this.formApiUrl}/api/update-job/${this.jobId}`, {
        backupInfo: {
          timestamp: backupInfo.timestamp,
          directory: backupInfo.directory,
          databaseSize: backupInfo.database?.size,
          filesSize: backupInfo.files?.size,
          success: backupInfo.success
        }
      });
    } catch (error) {
      console.error('[JobTracker] Failed to set backup info:', error.message);
    }
  }

  /**
   * Complete job with results
   */
  async complete(results) {
    if (!this.enabled) return;
    
    try {
      await axios.post(`${this.formApiUrl}/api/update-job/${this.jobId}`, {
        status: 'complete',
        progress: {
          stage: 'complete',
          message: 'Migration complete',
          percentComplete: 100
        },
        results
      });
    } catch (error) {
      console.error('[JobTracker] Failed to complete job:', error.message);
    }
  }

  /**
   * Fail job with error
   */
  async fail(error) {
    if (!this.enabled) return;
    
    try {
      await axios.post(`${this.formApiUrl}/api/update-job/${this.jobId}`, {
        status: 'failed',
        progress: {
          stage: 'failed',
          message: 'Migration failed'
        },
        errors: [{
          timestamp: new Date().toISOString(),
          message: error.message || error,
          stack: error.stack
        }]
      });
    } catch (error) {
      console.error('[JobTracker] Failed to mark job as failed:', error.message);
    }
  }

  /**
   * Helper: Track extraction stage
   */
  async startExtraction(totalItems) {
    await this.updateStatus('running');
    await this.updateProgress('extracting', 'Extracting content from source...', 10, 0, totalItems);
  }

  async updateExtraction(itemsProcessed, totalItems) {
    const percent = Math.min(10 + Math.floor((itemsProcessed / totalItems) * 20), 30);
    await this.updateProgress('extracting', `Extracted ${itemsProcessed} of ${totalItems} items`, percent, itemsProcessed, totalItems);
  }

  async completeExtraction() {
    await this.updateProgress('extracting', 'Extraction complete', 30);
  }

  /**
   * Helper: Track transformation stage
   */
  async startTransformation(totalItems) {
    await this.updateProgress('transforming', 'Transforming content...', 30, 0, totalItems);
  }

  async updateTransformation(itemsProcessed, totalItems) {
    const percent = Math.min(30 + Math.floor((itemsProcessed / totalItems) * 20), 50);
    await this.updateProgress('transforming', `Transformed ${itemsProcessed} of ${totalItems} items`, percent, itemsProcessed, totalItems);
  }

  async completeTransformation() {
    await this.updateProgress('transforming', 'Transformation complete', 50);
  }

  /**
   * Helper: Track insertion stage
   */
  async startInsertion(totalItems) {
    await this.updateProgress('inserting', 'Inserting content into destination...', 50, 0, totalItems);
  }

  async updateInsertion(itemsProcessed, totalItems) {
    const percent = Math.min(50 + Math.floor((itemsProcessed / totalItems) * 30), 80);
    await this.updateProgress('inserting', `Inserted ${itemsProcessed} of ${totalItems} items`, percent, itemsProcessed, totalItems);
  }

  async completeInsertion() {
    await this.updateProgress('inserting', 'Insertion complete', 80);
  }

  /**
   * Helper: Track verification stage
   */
  async startVerification(totalItems) {
    await this.updateProgress('verifying', 'Verifying migration quality...', 80, 0, totalItems);
  }

  async updateVerification(itemsProcessed, totalItems) {
    const percent = Math.min(80 + Math.floor((itemsProcessed / totalItems) * 20), 100);
    await this.updateProgress('verifying', `Verified ${itemsProcessed} of ${totalItems} items`, percent, itemsProcessed, totalItems);
  }

  async completeVerification() {
    await this.updateProgress('verifying', 'Verification complete', 100);
  }
}

module.exports = JobTracker;
