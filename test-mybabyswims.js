#!/usr/bin/env node

/**
 * Test the exact flow for mybabyswims.com submission
 */

const { parsePostTypes } = require('./utils/post-type-parser');
const ContentExtractor = require('./core/extract');
const Logger = require('./utils/logger');

// Simulate the exact form submission for mybabyswims.com
const formSubmission = {
  sourceUrl: 'https://mybabyswims.com',
  destinationUrl: 'https://mybabyswims.com', // They're doing a backup/test
  wpUsername: 'test',
  wpPassword: 'test',
  contentTypePostTypes: true,
  postTypes: ['blog posts'], // This is what the form sends
  preserve: {}
};

console.log('=== TESTING MYBABYSWIMS.COM EXTRACTION ===\n');

// Step 1: Parse post types
console.log('📝 Step 1: Parse post types');
console.log('Input:', formSubmission.postTypes);
const parsedTypes = parsePostTypes(formSubmission.postTypes);
console.log('Output:', parsedTypes);
console.log('');

// Step 2: Create config (simulating processor.js logic)
console.log('📝 Step 2: Create migration config');
const config = {
  project_name: 'test-migration',
  source: {
    url: formSubmission.sourceUrl,
    rest_endpoint: '/wp-json/wp/v2',
    auth: {
      method: 'none' // No auth for public testing
    }
  },
  destination: {
    url: formSubmission.destinationUrl,
    rest_endpoint: '/wp-json/wp/v2',
    auth: {
      method: 'application_password',
      username: formSubmission.wpUsername,
      password: formSubmission.wpPassword
    }
  },
  migration_settings: {
    content_types: parsedTypes,
    specific_items: {
      pages: [],
      posts: []
    },
    preserve: formSubmission.preserve,
    resume_from_checkpoint: true,
    create_backup: true
  },
  directories: {
    snapshots: './content-snapshots/test',
    transformed: './transformed-content/test',
    logs: './logs/test',
    backups: './backups/test',
    qa_reports: './qa-reports/test'
  }
};

console.log('Config content_types:', config.migration_settings.content_types);
console.log('');

// Step 3: Test extraction
console.log('📝 Step 3: Test content extraction');
console.log('Creating extractor...');
const logger = new Logger('./logs/test');
const extractor = new ContentExtractor(config, logger);

console.log('');
console.log('🔍 Attempting to catalog site...');
console.log('Source URL:', config.source.url);
console.log('Content types to extract:', config.migration_settings.content_types);
console.log('');

// Attempt catalog
extractor.catalogSite()
  .then(manifest => {
    console.log('\n✅ CATALOG SUCCESSFUL!');
    console.log('Total items found:', manifest.total_items);
    console.log('Content types:', Object.keys(manifest.content_types));
    
    // Show details for each content type
    for (const [type, data] of Object.entries(manifest.content_types)) {
      console.log(`\n${type}:`);
      console.log(`  - Count: ${data.count}`);
      if (data.items.length > 0) {
        console.log(`  - First item: "${data.items[0].title}"`);
      }
    }
    
    if (manifest.total_items === 0) {
      console.error('\n❌ ISSUE FOUND: Total items is 0!');
      console.error('This is why extraction fails.');
    }
  })
  .catch(error => {
    console.error('\n❌ CATALOG FAILED!');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  });
