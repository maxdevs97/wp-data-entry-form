#!/usr/bin/env node

/**
 * Test with the exact params ContentExtractor uses
 */

const axios = require('axios');

console.log('🧪 Testing with status param (like ContentExtractor does)...\n');

// Test 1: Without status param (should work)
console.log('Test 1: WITHOUT status param');
axios.get('https://mybabyswims.com/wp-json/wp/v2/posts', {
  params: {
    page: 1,
    per_page: 100
  }
})
  .then(response => {
    console.log('✅ Success!');
    console.log('Posts found:', response.data.length);
    console.log('');
  })
  .catch(error => {
    console.error('❌ Failed!');
    console.error('Error:', error.message);
    console.error('Status:', error.response?.status);
    console.error('');
  })
  .finally(() => {
    // Test 2: With status param (might fail without auth)
    console.log('Test 2: WITH status param (publish,draft,pending)');
    axios.get('https://mybabyswims.com/wp-json/wp/v2/posts', {
      params: {
        page: 1,
        per_page: 100,
        status: 'publish,draft,pending'
      }
    })
      .then(response => {
        console.log('✅ Success!');
        console.log('Posts found:', response.data.length);
      })
      .catch(error => {
        console.error('❌ Failed!');
        console.error('Error:', error.message);
        console.error('Status:', error.response?.status);
        console.error('Response:', error.response?.data);
        console.error('');
        console.error('🔥 FOUND THE BUG!');
        console.error('The ContentExtractor tries to fetch draft/pending posts without auth!');
        console.error('This is why extraction fails.');
      });
  });
