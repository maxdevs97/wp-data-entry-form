const fs = require('fs-extra');
const path = require('path');
const jobManager = require('./jobs');
const Logger = require('../utils/logger');
const ContentExtractor = require('../core/extract');
const ContentTransformer = require('../core/transform');
const ContentInserter = require('../core/insert');
const ContentVerifier = require('../core/verify-enhanced');
const BackupManager = require('../lib/backup');
const { parsePostTypes } = require('../utils/post-type-parser');

/**
 * Real WordPress Migration Processor
 * Integrates the full migration framework with the job management system
 */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Safe progress update wrapper - doesn't fail if Sheets API is rate limited
 */
async function safeUpdateProgress(jobId, updates, logger) {
  try {
    await jobManager.updateProgress(jobId, updates);
  } catch (error) {
    logger?.warn('⚠️ Failed to update job progress (continuing anyway)', { 
      error: error.message,
      stage: updates.stage 
    });
    console.warn(`⚠️ Progress update failed for job ${jobId}: ${error.message}`);
  }
}

/**
 * Convert form submission data to migration framework config
 */
function createMigrationConfig(submissionData, jobId) {
  const config = {
    project_name: `migration-${jobId}`,
    
    // Always use frontend crawl for source — we never have source site credentials
    extraction_mode: 'frontend',
    
    // Source WordPress site
    source: {
      url: submissionData.sourceUrl.replace(/\/$/, ''), // Remove trailing slash
      rest_endpoint: '/wp-json/wp/v2',
      // Only use auth for source if separate source credentials provided
      // OR if source and destination are the same site
      auth: submissionData.sourceWpUsername ? {
        method: 'application_password',
        username: submissionData.sourceWpUsername,
        password: submissionData.sourceWpPassword
      } : (submissionData.sourceUrl === submissionData.destinationUrl ? {
        method: 'application_password',
        username: submissionData.wpUsername,
        password: submissionData.wpPassword
      } : {
        method: 'none' // Public REST API access
      })
    },
    
    // Destination WordPress site
    destination: {
      url: submissionData.destinationUrl.replace(/\/$/, ''),
      rest_endpoint: '/wp-json/wp/v2',
      auth: {
        method: 'application_password',
        username: submissionData.wpUsername,
        password: submissionData.wpPassword
      }
    },
    
    // Migration settings
    migration_settings: {
      // Content types to migrate
      content_types: [],
      
      // Specific pages/posts if provided
      specific_items: {
        pages: [],
        posts: []
      },
      
      // Preservation settings from form
      preserve: submissionData.preserve || {},
      
      // Resume capability
      resume_from_checkpoint: true,
      
      // Create backups by default
      create_backup: true
    },
    
    // Backup settings
    backup_settings: {
      create_backup: true,
      backup_directory: `./backups/${jobId}`,
      include_database: true,
      include_media: true
    },
    
    // Working directories
    directories: {
      snapshots: `./content-snapshots/${jobId}`,
      transformed: `./transformed-content/${jobId}`,
      logs: `./logs/${jobId}`,
      backups: `./backups/${jobId}`,
      qa_reports: `./qa-reports/${jobId}`
    }
  };
  
  // Determine content types based on form data
  if (submissionData.contentTypeCertainPages) {
    // Parse page paths/IDs from the certainPages array
    if (submissionData.certainPages && submissionData.certainPages.length > 0) {
      // ONLY add 'page' to content_types if pages are actually specified
      config.migration_settings.content_types.push('page');
      
      submissionData.certainPages.forEach(pagePath => {
        // Check if it's a numeric ID or a slug/path
        const trimmedPath = pagePath.trim();
        if (/^\d+$/.test(trimmedPath)) {
          // It's an ID
          config.migration_settings.specific_items.pages.push({
            id: parseInt(trimmedPath)
          });
        } else {
          // It's a path or slug
          const cleanPath = trimmedPath.replace(/^\/+|\/+$/g, '');
          config.migration_settings.specific_items.pages.push({
            slug: cleanPath
          });
        }
      });
    }
  }
  
  if (submissionData.contentTypePostTypes) {
    // Add specified post types - parse natural language inputs
    if (submissionData.postTypes && submissionData.postTypes.length > 0) {
      const parsedTypes = parsePostTypes(submissionData.postTypes);
      
      parsedTypes.forEach(postType => {
        if (postType && !config.migration_settings.content_types.includes(postType)) {
          config.migration_settings.content_types.push(postType);
        }
      });
      
      // Log what was parsed for debugging
      console.log('📝 Post type parsing:');
      submissionData.postTypes.forEach((input, i) => {
        console.log(`  "${input}" → "${parsedTypes[i] || 'unknown'}"`);
      });
    }
  }
  
  // [DEBUG] Log content types before defaulting
  console.log('[PROCESSOR-DEBUG] Content types before default:', config.migration_settings.content_types);
  console.log('[PROCESSOR-DEBUG] contentTypeCertainPages:', submissionData.contentTypeCertainPages);
  console.log('[PROCESSOR-DEBUG] certainPages:', submissionData.certainPages);
  console.log('[PROCESSOR-DEBUG] contentTypePostTypes:', submissionData.contentTypePostTypes);
  console.log('[PROCESSOR-DEBUG] postTypes:', submissionData.postTypes);
  
  // Default to 'post' and 'page' if nothing specified
  if (config.migration_settings.content_types.length === 0) {
    console.log('[PROCESSOR-DEBUG] Content types array is empty, applying default: [post, page]');
    config.migration_settings.content_types = ['post', 'page'];
  } else {
    console.log('[PROCESSOR-DEBUG] Content types array has items:', config.migration_settings.content_types);
  }
  
  // Create working directories with validation
  Object.entries(config.directories).forEach(([name, dir]) => {
    try {
      fs.ensureDirSync(dir);
      
      // Validate directory was actually created
      if (!fs.existsSync(dir)) {
        throw new Error(`Failed to create directory: ${dir}`);
      }
      
      console.log(`✅ Created directory: ${name} → ${dir}`);
    } catch (error) {
      throw new Error(`Failed to create ${name} directory at ${dir}: ${error.message}`);
    }
  });
  
  return config;
}

/**
 * Process a migration job through all stages using real migration framework
 */
async function processJob(jobId) {
  let logger = null;
  let config = null;
  
  try {
    console.log(`🚀 Starting real WordPress migration for job ${jobId}`);
    
    // Get job details
    const job = await jobManager.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    // Create migration config from submission data
    config = createMigrationConfig(job.submissionData, jobId);
    
    // Initialize logger
    logger = new Logger(config.directories.logs);
    logger.info('=================================');
    logger.info('WordPress Migration Started');
    logger.info('=================================');
    logger.info(`Job ID: ${jobId}`);
    logger.info(`Source: ${config.source.url}`);
    logger.info(`Destination: ${config.destination.url}`);
    logger.info(`Content Types: ${config.migration_settings.content_types.join(', ')}`);
    logger.info('=================================');
    
    // Initialize migration framework components
    const extractor = new ContentExtractor(config, logger);
    const transformer = new ContentTransformer(config, logger);
    const inserter = new ContentInserter(config, logger);
    const verifier = new ContentVerifier(config, logger);
    const backupManager = new BackupManager(config, logger);
    
    // Update job to running (with error handling)
    try {
      await jobManager.updateJob(jobId, { status: 'running' });
      logger.info('Job status set to running');
    } catch (updateError) {
      logger.warn('⚠️ Failed to update job status to running (continuing anyway)', { error: updateError.message });
    }
    
    // Stage 0: Backup (before any writes)
    let backupMetadata = null;
    try {
      await safeUpdateProgress(jobId, {
        stage: 'backup',
        message: 'Creating backup before migration...',
        percentComplete: 5
      });
      
      logger.info('\n💾 STAGE 0: PRE-MIGRATION BACKUP');
      backupMetadata = await backupManager.createBackup();
      
      if (backupMetadata && backupMetadata.success) {
        logger.success('✅ Backup created successfully');
        await jobManager.setBackupInfo(jobId, {
          timestamp: backupMetadata.timestamp,
          directory: backupMetadata.directory,
          database: backupMetadata.database,
          files: backupMetadata.files
        });
      } else {
        logger.warn('⚠️ Backup completed with warnings');
      }
    } catch (backupError) {
      logger.warn('⚠️ Backup failed, continuing with migration', { error: backupError.message });
      // Don't fail the job - backup is optional
    }
    
    // Stage 1: Extract data from source
    await safeUpdateProgress(jobId, {
      stage: 'extracting',
      message: 'Cataloging source site...',
      percentComplete: 10
    });
    
    logger.info('\n📥 STAGE 1: EXTRACTION');
    const manifest = await extractor.catalogSite();
    const itemsTotal = manifest.total_items || 0;
    
    logger.info(`Found ${itemsTotal} items to migrate`);
    logger.success(`✅ Cataloged ${itemsTotal} items`);
    await safeUpdateProgress(jobId, {
      stage: 'extracting',
      message: `Cataloged ${itemsTotal} items, now extracting...`,
      percentComplete: 15,
      itemsTotal,
      itemsCataloged: itemsTotal
    });
    
    const extractResults = await extractor.extractAll();
    const extractedCount = extractResults.filter(r => r.success).length;
    
    logger.success(`✅ Extracted ${extractedCount}/${itemsTotal} items`);
    await safeUpdateProgress(jobId, {
      stage: 'extracting',
      message: `Extracted ${extractedCount} items successfully`,
      percentComplete: 30,
      itemsProcessed: extractedCount
    });
    
    if (extractedCount === 0) {
      const error = new Error('No content was extracted from source site. Please check your credentials and content filters.');
      error.timestamp = new Date().toISOString();
      error.stage = 'extraction';
      error.suggestion = 'Verify that the source site has content, WP credentials are correct, and content types exist.';
      throw error;
    }
    
    // Stage 2: Transform content
    await safeUpdateProgress(jobId, {
      stage: 'transforming',
      message: 'Transforming content structure...',
      percentComplete: 35
    });
    
    logger.info('\n🔄 STAGE 2: TRANSFORMATION');
    const transformResults = await transformer.transformAll();
    const transformedCount = transformResults.filter(r => r.success).length;
    
    logger.success(`✅ Transformed ${transformedCount}/${extractedCount} items`);
    await safeUpdateProgress(jobId, {
      stage: 'transforming',
      message: `Transformed ${transformedCount} items`,
      percentComplete: 45
    });
    
    // Stage 3: Insert into destination (with progress updates)
    logger.info('\n📤 STAGE 3: INSERTION');
    
    // Get list of transformed files
    const transformedFiles = fs.readdirSync(config.directories.transformed)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(config.directories.transformed, f));
    
    const insertTotal = transformedFiles.length;
    let insertedCount = 0;
    const migratedPosts = [];
    const insertionErrors = [];
    
    for (let i = 0; i < transformedFiles.length; i++) {
      const filePath = transformedFiles[i];
      const fileName = path.basename(filePath);
      const progressPercent = 45 + Math.floor((i / insertTotal) * 35); // 45% -> 80%
      
      await safeUpdateProgress(jobId, {
        stage: 'inserting',
        message: `Inserting item ${i + 1} of ${insertTotal}...`,
        percentComplete: progressPercent,
        itemsProcessed: i
      });
      
      try {
        const result = await inserter.insertContent(filePath);
        
        if (result && result.success) {
          insertedCount++;
          
          // Read the transformed content to get original details
          const transformed = fs.readJsonSync(filePath);
          
          migratedPosts.push({
            title: transformed.title || 'Untitled',
            sourceUrl: transformed.source_url || config.source.url,
            destinationUrl: result.url || config.destination.url,
            status: 'success'
          });
          
          logger.info(`✅ Inserted: ${transformed.title || fileName}`);
        } else {
          // Insertion returned but was not successful
          insertionErrors.push({
            file: fileName,
            error: result?.error || 'Insert returned unsuccessful result',
            timestamp: new Date().toISOString()
          });
          logger.error(`❌ Failed to insert ${fileName}: ${result?.error || 'Unknown error'}`);
        }
      } catch (insertError) {
        // Insertion threw an exception
        insertionErrors.push({
          file: fileName,
          error: insertError.message,
          stack: insertError.stack,
          timestamp: new Date().toISOString()
        });
        logger.error(`❌ Exception inserting ${fileName}: ${insertError.message}`);
      }
    }
    
    logger.info(`\n📊 INSERTION RESULTS:`);
    logger.info(`  Total: ${insertTotal}`);
    logger.info(`  Succeeded: ${insertedCount}`);
    logger.info(`  Failed: ${insertTotal - insertedCount}`);
    
    if (insertionErrors.length > 0) {
      logger.warn(`\n⚠️ Insertion Errors (${insertionErrors.length}):`);
      insertionErrors.slice(0, 10).forEach((err, idx) => {
        logger.warn(`  ${idx + 1}. ${err.file}: ${err.error}`);
      });
      if (insertionErrors.length > 10) {
        logger.warn(`  ... and ${insertionErrors.length - 10} more errors`);
      }
    }
    
    await safeUpdateProgress(jobId, {
      stage: 'inserting',
      message: `Inserted ${insertedCount}/${insertTotal} items`,
      percentComplete: 80,
      itemsProcessed: insertedCount
    });
    
    // Stage 4: Verify migration (QA checks)
    await safeUpdateProgress(jobId, {
      stage: 'verifying',
      message: 'Running quality assurance checks...',
      percentComplete: 85
    });
    
    logger.info('\n✅ STAGE 4: VERIFICATION');
    
    try {
      const verifyResults = await verifier.verifyAll();
      const verifiedCount = verifyResults.filter(r => r.success).length;
      
      logger.success(`✅ Verified ${verifiedCount}/${insertedCount} items`);
      await safeUpdateProgress(jobId, {
        stage: 'verifying',
        message: `Verified ${verifiedCount} items`,
        percentComplete: 95
      });
    } catch (verifyError) {
      logger.warn('⚠️ Verification completed with errors', { error: verifyError.message });
      // Don't fail the job - verification is supplementary
    }
    
    // Stage 5: Complete with results
    logger.info('\n🎉 STAGE 5: COMPLETION');
    
    // CRITICAL: Validate migration success before marking as complete
    if (insertedCount === 0 && itemsTotal > 0) {
      const error = new Error(`Migration completed but 0 items migrated successfully (0/${itemsTotal}). All items failed to insert.`);
      error.timestamp = new Date().toISOString();
      error.stage = 'insertion';
      error.details = {
        extractedCount,
        transformedCount,
        insertedCount: 0,
        failedCount: itemsTotal
      };
      error.suggestion = 'Check destination site credentials, permissions, and WordPress REST API availability. Review log file for specific insertion errors.';
      
      logger.error('❌ MIGRATION FAILED: Zero successful insertions');
      logger.error(`Attempted: ${itemsTotal} items`);
      logger.error(`Succeeded: 0 items`);
      logger.error(`Failed: ${itemsTotal} items`);
      
      throw error;
    }
    
    const startTime = new Date(job.createdAt);
    const endTime = new Date();
    const durationMs = endTime - startTime;
    const durationSeconds = Math.floor(durationMs / 1000);
    const durationMinutes = Math.floor(durationSeconds / 60);
    const remainingSeconds = durationSeconds % 60;
    const duration = durationMinutes > 0 
      ? `${durationMinutes}m ${remainingSeconds}s`
      : `${durationSeconds}s`;
    
    const results = {
      totalMigrated: insertedCount,
      totalFailed: itemsTotal - insertedCount,
      duration,
      migratedPosts: migratedPosts,
      completedAt: endTime.toISOString(),
      logs: {
        logFile: logger.logFile,
        backupDirectory: config.directories.backups
      }
    };
    
    await jobManager.completeJob(jobId, results);
    
    logger.success('=================================');
    logger.success('✅ MIGRATION COMPLETED SUCCESSFULLY');
    logger.success('=================================');
    logger.success(`Total Items Migrated: ${insertedCount}/${itemsTotal}`);
    logger.success(`Duration: ${duration}`);
    logger.success(`Log File: ${logger.logFile}`);
    logger.success('=================================');
    
    console.log(`✅ Job ${jobId} completed successfully`);
    
  } catch (error) {
    console.error(`❌ Job ${jobId} failed:`, error);
    
    // Enhance error with additional context
    const enhancedError = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      timestamp: error.timestamp || new Date().toISOString(),
      stage: error.stage || 'unknown',
      suggestion: error.suggestion || 'Check log file for details',
      details: error.details || {}
    };
    
    if (logger) {
      logger.error('=================================');
      logger.error('❌ MIGRATION FAILED');
      logger.error('=================================');
      logger.error(`Error: ${enhancedError.message}`);
      logger.error(`Stage: ${enhancedError.stage}`);
      logger.error(`Time: ${enhancedError.timestamp}`);
      
      if (enhancedError.details && Object.keys(enhancedError.details).length > 0) {
        logger.error('Details:');
        Object.entries(enhancedError.details).forEach(([key, value]) => {
          logger.error(`  ${key}: ${value}`);
        });
      }
      
      if (enhancedError.suggestion) {
        logger.error(`\n💡 Suggestion: ${enhancedError.suggestion}`);
      }
      
      logger.error(`\nStack: ${enhancedError.stack}`);
      logger.error('=================================');
    }
    
    // Ensure job is marked as failed (not complete)
    try {
      await jobManager.failJob(jobId, enhancedError);
      console.log(`✅ Job ${jobId} marked as FAILED in database`);
    } catch (failError) {
      console.error(`❌ Failed to mark job ${jobId} as failed:`, failError);
      // Even if we can't update the database, log the failure
    }
    
    // Re-throw to ensure calling code knows this failed
    throw error;
  }
}

module.exports = {
  processJob
};
