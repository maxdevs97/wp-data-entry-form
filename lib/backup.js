const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs-extra');
const path = require('path');

const execAsync = promisify(exec);

class BackupManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.backupBaseDir = config.backup_settings?.backup_directory || './backups';
  }

  /**
   * Create a full backup of the destination WordPress site
   * before any migration writes happen
   * 
   * @returns {Object} Backup metadata with paths and timestamps
   */
  async createBackup() {
    const timestamp = this.getTimestamp();
    const backupDir = path.join(this.backupBaseDir, `backup-${timestamp}`);
    
    this.logger.info(`Creating backup in: ${backupDir}`);
    
    try {
      // Ensure backup directory exists
      await fs.ensureDir(backupDir);
      
      const backupResult = {
        timestamp,
        directory: backupDir,
        database: null,
        files: null,
        success: false,
        startTime: new Date().toISOString(),
        endTime: null,
        duration: null,
        errors: []
      };
      
      const startTime = Date.now();
      
      // Step 1: Backup database
      this.logger.info('Exporting database...');
      try {
        backupResult.database = await this.backupDatabase(backupDir, timestamp);
        this.logger.success(`✓ Database backup complete: ${backupResult.database.path}`);
      } catch (error) {
        this.logger.error('Database backup failed:', error.message);
        backupResult.errors.push({
          component: 'database',
          error: error.message
        });
      }
      
      // Step 2: Backup files (wp-content)
      this.logger.info('Backing up files (wp-content)...');
      try {
        backupResult.files = await this.backupFiles(backupDir, timestamp);
        this.logger.success(`✓ Files backup complete: ${backupResult.files.path}`);
      } catch (error) {
        this.logger.error('Files backup failed:', error.message);
        backupResult.errors.push({
          component: 'files',
          error: error.message
        });
      }
      
      const endTime = Date.now();
      backupResult.endTime = new Date().toISOString();
      backupResult.duration = ((endTime - startTime) / 1000).toFixed(2);
      
      // Backup is successful if at least database OR files succeeded
      backupResult.success = (backupResult.database?.success || backupResult.files?.success);
      
      // Save backup metadata
      const metadataPath = path.join(backupDir, 'backup-metadata.json');
      await fs.writeJson(metadataPath, backupResult, { spaces: 2 });
      
      if (backupResult.success) {
        this.logger.success(`\n✅ Backup complete in ${backupResult.duration}s`);
        this.logger.info(`Backup location: ${backupDir}\n`);
      } else {
        this.logger.warn(`\n⚠️  Backup completed with errors in ${backupResult.duration}s`);
        this.logger.warn(`Some components may not have been backed up. Check: ${metadataPath}\n`);
      }
      
      return backupResult;
      
    } catch (error) {
      this.logger.error('Backup creation failed:', error.message);
      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  /**
   * Backup database using WP-CLI
   */
  async backupDatabase(backupDir, timestamp) {
    const sqlFile = `backup-${timestamp}.sql`;
    const sqlPath = path.join(backupDir, sqlFile);
    
    const result = {
      path: sqlPath,
      filename: sqlFile,
      size: null,
      success: false,
      method: 'wp-cli'
    };
    
    try {
      // Construct WP-CLI command
      const wpPath = this.getWordPressPath();
      const command = `wp db export ${sqlPath} --path="${wpPath}" --allow-root`;
      
      this.logger.info(`Running: ${command}`);
      
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large DBs
      });
      
      if (stderr && !stderr.includes('Success')) {
        this.logger.warn('WP-CLI stderr:', stderr);
      }
      
      // Verify file was created
      if (await fs.pathExists(sqlPath)) {
        const stats = await fs.stat(sqlPath);
        result.size = stats.size;
        result.success = true;
        
        this.logger.info(`Database exported: ${this.formatBytes(result.size)}`);
      } else {
        throw new Error('SQL file was not created');
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('Database backup error:', error.message);
      
      // Try alternative method: mysqldump
      if (this.config.destination.database) {
        this.logger.info('Attempting mysqldump fallback...');
        return await this.backupDatabaseMysqldump(backupDir, timestamp);
      }
      
      throw error;
    }
  }

  /**
   * Fallback: Backup database using mysqldump directly
   */
  async backupDatabaseMysqldump(backupDir, timestamp) {
    const sqlFile = `backup-${timestamp}.sql`;
    const sqlPath = path.join(backupDir, sqlFile);
    
    const result = {
      path: sqlPath,
      filename: sqlFile,
      size: null,
      success: false,
      method: 'mysqldump'
    };
    
    const db = this.config.destination.database;
    
    if (!db || !db.name || !db.user) {
      throw new Error('Database credentials not configured for mysqldump fallback');
    }
    
    const command = [
      'mysqldump',
      `-u${db.user}`,
      db.password ? `-p${db.password}` : '',
      db.host ? `-h${db.host}` : '',
      db.port ? `-P${db.port}` : '',
      db.name,
      `> ${sqlPath}`
    ].filter(Boolean).join(' ');
    
    this.logger.info('Running: mysqldump [credentials hidden]');
    
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 50 * 1024 * 1024
    });
    
    if (await fs.pathExists(sqlPath)) {
      const stats = await fs.stat(sqlPath);
      result.size = stats.size;
      result.success = true;
      
      this.logger.info(`Database exported via mysqldump: ${this.formatBytes(result.size)}`);
    } else {
      throw new Error('mysqldump failed to create SQL file');
    }
    
    return result;
  }

  /**
   * Backup wp-content directory using tar
   */
  async backupFiles(backupDir, timestamp) {
    const tarFile = `backup-${timestamp}-files.tar.gz`;
    const tarPath = path.join(backupDir, tarFile);
    
    const result = {
      path: tarPath,
      filename: tarFile,
      size: null,
      success: false
    };
    
    try {
      const wpPath = this.getWordPressPath();
      const wpContentPath = path.join(wpPath, 'wp-content');
      
      // Check if wp-content exists
      if (!await fs.pathExists(wpContentPath)) {
        throw new Error(`wp-content directory not found: ${wpContentPath}`);
      }
      
      // Create tar archive
      const command = `tar -czf "${tarPath}" -C "${wpPath}" wp-content 2>&1`;
      
      this.logger.info(`Compressing wp-content directory...`);
      
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 100 * 1024 * 1024 // 100MB buffer
      });
      
      if (stderr) {
        // tar writes warnings to stderr even on success
        this.logger.warn('tar stderr:', stderr.substring(0, 500));
      }
      
      // Verify archive was created
      if (await fs.pathExists(tarPath)) {
        const stats = await fs.stat(tarPath);
        result.size = stats.size;
        result.success = true;
        
        this.logger.info(`Files archived: ${this.formatBytes(result.size)}`);
      } else {
        throw new Error('Tar archive was not created');
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('Files backup error:', error.message);
      throw error;
    }
  }

  /**
   * List all available backups
   */
  async listBackups() {
    try {
      if (!await fs.pathExists(this.backupBaseDir)) {
        return [];
      }
      
      const entries = await fs.readdir(this.backupBaseDir);
      const backups = [];
      
      for (const entry of entries) {
        const backupPath = path.join(this.backupBaseDir, entry);
        const metadataPath = path.join(backupPath, 'backup-metadata.json');
        
        if (await fs.pathExists(metadataPath)) {
          const metadata = await fs.readJson(metadataPath);
          backups.push({
            directory: entry,
            timestamp: metadata.timestamp,
            success: metadata.success,
            duration: metadata.duration,
            databaseSize: metadata.database?.size,
            filesSize: metadata.files?.size
          });
        }
      }
      
      // Sort by timestamp (newest first)
      backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      
      return backups;
      
    } catch (error) {
      this.logger.error('Failed to list backups:', error.message);
      return [];
    }
  }

  /**
   * Get WordPress installation path from config
   */
  getWordPressPath() {
    // Check config for explicit path
    if (this.config.destination.wordpress_path) {
      return this.config.destination.wordpress_path;
    }
    
    // Try to parse from URL (common patterns)
    const url = this.config.destination.url;
    
    // For local development
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      // Common local paths
      const commonPaths = [
        '/var/www/html',
        '/usr/share/nginx/html',
        '/Applications/MAMP/htdocs',
        '/Users/Shared/Local Sites'
      ];
      
      // Return first existing path
      for (const p of commonPaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
    }
    
    // Default: assume current directory or require manual config
    this.logger.warn('WordPress path not configured. Set destination.wordpress_path in config.');
    return process.cwd();
  }

  /**
   * Generate timestamp for backup naming
   */
  getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      '-',
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join('');
  }

  /**
   * Format bytes for human-readable display
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = BackupManager;
