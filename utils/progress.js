const fs = require('fs-extra');
const path = require('path');

class ProgressTracker {
  constructor(projectName, logDir = './logs') {
    this.projectName = projectName;
    this.progressFile = path.join(logDir, `${projectName}-progress.json`);
    this.checkpointFile = path.join(logDir, `${projectName}-checkpoint.json`);
    
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      inProgress: 0,
      startTime: null,
      endTime: null,
      currentBatch: 0,
      completedItems: [],
      failedItems: [],
      skippedItems: []
    };
    
    this.loadProgress();
  }

  loadProgress() {
    if (fs.existsSync(this.progressFile)) {
      try {
        this.stats = fs.readJsonSync(this.progressFile);
      } catch (e) {
        // Start fresh if corrupted
      }
    }
  }

  saveProgress() {
    fs.writeJsonSync(this.progressFile, this.stats, { spaces: 2 });
  }

  saveCheckpoint(data) {
    fs.writeJsonSync(this.checkpointFile, {
      timestamp: new Date().toISOString(),
      ...data
    }, { spaces: 2 });
  }

  loadCheckpoint() {
    if (fs.existsSync(this.checkpointFile)) {
      return fs.readJsonSync(this.checkpointFile);
    }
    return null;
  }

  start(total) {
    this.stats.total = total;
    this.stats.startTime = new Date().toISOString();
    this.saveProgress();
  }

  complete(itemId, itemData = {}) {
    this.stats.completed++;
    this.stats.completedItems.push({ id: itemId, ...itemData, timestamp: new Date().toISOString() });
    this.saveProgress();
  }

  fail(itemId, error, itemData = {}) {
    this.stats.failed++;
    this.stats.failedItems.push({ 
      id: itemId, 
      error: error.message || error, 
      ...itemData, 
      timestamp: new Date().toISOString() 
    });
    this.saveProgress();
  }

  skip(itemId, reason, itemData = {}) {
    this.stats.skipped++;
    this.stats.skippedItems.push({ 
      id: itemId, 
      reason, 
      ...itemData, 
      timestamp: new Date().toISOString() 
    });
    this.saveProgress();
  }

  setBatch(batchNum) {
    this.stats.currentBatch = batchNum;
    this.saveProgress();
  }

  finish() {
    this.stats.endTime = new Date().toISOString();
    this.saveProgress();
  }

  getStats() {
    return this.stats;
  }

  getPercentComplete() {
    if (this.stats.total === 0) return 0;
    return Math.round((this.stats.completed / this.stats.total) * 100);
  }

  getElapsedTime() {
    if (!this.stats.startTime) return 0;
    const start = new Date(this.stats.startTime);
    const end = this.stats.endTime ? new Date(this.stats.endTime) : new Date();
    return Math.round((end - start) / 1000); // seconds
  }

  getEstimatedTimeRemaining() {
    const elapsed = this.getElapsedTime();
    const completed = this.stats.completed;
    const remaining = this.stats.total - completed;
    
    if (completed === 0) return null;
    
    const avgTimePerItem = elapsed / completed;
    return Math.round(avgTimePerItem * remaining);
  }

  printSummary() {
    const elapsed = this.getElapsedTime();
    const etr = this.getEstimatedTimeRemaining();
    
    console.log('\n=== Migration Progress ===');
    console.log(`Total: ${this.stats.total}`);
    console.log(`Completed: ${this.stats.completed} (${this.getPercentComplete()}%)`);
    console.log(`Failed: ${this.stats.failed}`);
    console.log(`Skipped: ${this.stats.skipped}`);
    console.log(`Elapsed time: ${this.formatTime(elapsed)}`);
    if (etr) {
      console.log(`Estimated time remaining: ${this.formatTime(etr)}`);
    }
    console.log('========================\n');
  }

  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    
    return parts.join(' ');
  }
}

module.exports = ProgressTracker;
