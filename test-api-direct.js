#!/usr/bin/env node

/**
 * Test direct API access to mybabyswims.com
 */

const axios = require('axios');

const testUrl = 'https://mybabyswims.com/wp-json/wp/v2/posts';

console.log('🧪 Testing direct API access...');
console.log('URL:', testUrl);
console.log('');

// Test 1: Simple axios get
console.log('Test 1: Direct axios.get()...');
axios.get(testUrl, { params: { per_page: 10 } })
  .then(response => {
    console.log('✅ Success!');
    console.log('Status:', response.status);
    console.log('Posts found:', response.data.length);
    console.log('First post:', response.data[0]?.title?.rendered);
  })
  .catch(error => {
    console.error('❌ Failed!');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Response status:', error.response?.status);
    console.error('Response data:', error.response?.data);
  })
  .finally(() => {
    console.log('');
    
    // Test 2: Using WordPressAPIClient
    console.log('Test 2: Using WordPressAPIClient...');
    const Logger = require('./utils/logger');
    const WordPressAPIClient = require('./utils/api-client');
    
    const config = {
      url: 'https://mybabyswims.com',
      rest_endpoint: '/wp-json/wp/v2',
      auth: {
        method: 'none'
      }
    };
    
    const logger = new Logger('./logs/test');
    const client = new WordPressAPIClient(config, logger);
    
    client.get('/wp-json/wp/v2/posts', { per_page: 10 })
      .then(data => {
        console.log('✅ Success!');
        console.log('Posts found:', data.length);
        console.log('First post:', data[0]?.title?.rendered);
      })
      .catch(error => {
        console.error('❌ Failed!');
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Response status:', error.response?.status);
        console.error('Response data:', error.response?.data);
      });
  });
