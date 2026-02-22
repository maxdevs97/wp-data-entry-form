#!/usr/bin/env node

const path = require('path');
const fs = require('fs-extra');
const Logger = require('./utils/logger');
const ContentExtractor = require('./core/extract');
const ContentTransformer = require('./core/transform');
const ContentInserter = require('./core/insert');

async function testFeaturedImageMigration() {
  console.log('=== Testing Featured Image Migration ===\n');
  
  // Create test job ID
  const testJobId = `test-featured-images-${Date.now()}`;
  
  // Create test config
  const config = {
    project_name: `test-${testJobId}`,
    source: {
      url: 'https://mybabyswims.com',
      rest_endpoint: '/wp-json/wp/v2',
      auth: {
        method: 'none' // Public API
      }
    },
    destination: {
      url: 'https://mbstest3.sherstaging.com',
      rest_endpoint: '/wp-json/wp/v2',
      auth: {
        method: 'application_password',
        username: 'clients@sheragency.com',
        password: 'x3KWwkjWMgVz2HcDot1VQSyx'
      }
    },
    migration_settings: {
      content_types: ['post'],
      specific_items: {
        pages: [],
        posts: []
      },
      preserve: {},
      batch_size: 10
    },
    directories: {
      snapshots: `./content-snapshots/${testJobId}`,
      transformed: `./transformed-content/${testJobId}`,
      logs: `./logs/${testJobId}`,
      backups: `./backups/${testJobId}`,
      qa_reports: `./qa-reports/${testJobId}`
    },
    media_handling: {
      local_cache_path: `./migration-assets/${testJobId}`
    }
  };
  
  // Create directories
  Object.values(config.directories).forEach(dir => {
    fs.ensureDirSync(dir);
  });
  fs.ensureDirSync(config.media_handling.local_cache_path);
  
  const logger = new Logger(config.directories.logs);
  logger.info('=== FEATURED IMAGE MIGRATION TEST ===');
  logger.info(`Job ID: ${testJobId}`);
  
  try {
    // Step 1: Extract ONE post (just for testing)
    logger.info('\\n--- STEP 1: EXTRACTION ---');
    const extractor = new ContentExtractor(config, logger);
    const manifest = await extractor.catalogSite();
    
    if (manifest.total_items === 0) {
      throw new Error('No posts found to migrate');
    }
    
    // Extract first post only
    const firstPost = manifest.content_types.post.items[0];
    logger.info(`Extracting post: ${firstPost.title} (ID: ${firstPost.id})`);
    
    const extractResult = await extractor.extractContent(firstPost.id, 'post');
    logger.success('Extraction complete');
    
    // Check if featured image was extracted
    const snapshot = extractResult.snapshot;
    logger.info(`\\nFeatured image in snapshot: ${snapshot.featured_image ? 'YES' : 'NO'}`);
    if (snapshot.featured_image) {
      logger.info(`  URL: ${snapshot.featured_image.url}`);
      logger.info(`  Local path: ${snapshot.featured_image.localPath}`);
      logger.info(`  File exists: ${fs.existsSync(snapshot.featured_image.localPath) ? 'YES' : 'NO'}`);
    }
    
    // Step 2: Transform
    logger.info('\\n--- STEP 2: TRANSFORMATION ---');
    const transformer = new ContentTransformer(config, logger);
    const transformResult = await transformer.transformContent(extractResult.snapshotPath);
    logger.success('Transformation complete');
    
    const transformed = transformResult.transformed;
    logger.info(`\\nFeatured image in transformed: ${transformed.featured_image ? 'YES' : 'NO'}`);
    if (transformed.featured_image) {
      logger.info(`  URL: ${transformed.featured_image.url}`);
      logger.info(`  Local path: ${transformed.featured_image.localPath}`);
      logger.info(`  File exists: ${fs.existsSync(transformed.featured_image.localPath) ? 'YES' : 'NO'}`);
    }
    
    // Step 3: Insert
    logger.info('\\n--- STEP 3: INSERTION ---');
    const inserter = new ContentInserter(config, logger);
    const insertResult = await inserter.insertContent(transformResult.transformedPath);
    logger.success('Insertion complete');
    
    const result = insertResult.result;
    logger.info(`\\nFeatured media ID on destination: ${result.featured_media_id || 'NONE'}`);
    logger.info(`Destination post ID: ${result.destination_id}`);
    logger.info(`Destination URL: ${result.destination_url}`);
    
    // Step 4: Verify via API
    logger.info('\\n--- STEP 4: VERIFICATION ---');
    const axios = require('axios');
    const auth = Buffer.from('clients@sheragency.com:x3KWwkjWMgVz2HcDot1VQSyx').toString('base64');
    
    const verifyResponse = await axios.get(`https://mbstest3.sherstaging.com/wp-json/wp/v2/posts/${result.destination_id}`, {
      headers: { 'Authorization': `Basic ${auth}` },
      params: { _embed: true }
    });
    
    const verifyPost = verifyResponse.data;
    logger.info(`\\nPost title: ${verifyPost.title.rendered}`);
    logger.info(`Featured media ID: ${verifyPost.featured_media}`);
    
    if (verifyPost.featured_media > 0) {
      logger.success(`\\n✅ FEATURED IMAGE MIGRATION SUCCESSFUL!`);
      logger.success(`   Post ID: ${result.destination_id}`);
      logger.success(`   Featured Media ID: ${verifyPost.featured_media}`);
      
      if (verifyPost._embedded && verifyPost._embedded['wp:featuredmedia']) {
        const media = verifyPost._embedded['wp:featuredmedia'][0];
        logger.success(`   Media URL: ${media.source_url}`);
      }
      
      console.log('\\n✅ SUCCESS: Featured image is present and working!');
    } else {
      logger.error(`\\n❌ FEATURED IMAGE MIGRATION FAILED`);
      logger.error(`   Post was created but featured_media is 0`);
      console.log('\\n❌ FAILED: Featured image was not set');
    }
    
  } catch (error) {
    logger.error('Test failed', { error: error.message, stack: error.stack });
    console.error('\\n❌ ERROR:', error.message);
    process.exit(1);
  }
}

testFeaturedImageMigration();
