#!/usr/bin/env node
/**
 * Test post type parser functionality
 */

const { parsePostType, parsePostTypes } = require('./utils/post-type-parser');

console.log('🧪 Testing Post Type Parser\n');

const testCases = [
  // Natural language inputs
  ['blog posts', 'post'],
  ['blog posts only', 'post'],
  ['all blog posts', 'post'],
  ['pages', 'page'],
  ['team member profiles', 'team'],
  ['portfolio items', 'portfolio'],
  ['testimonials', 'testimonial'],
  
  // Technical slugs
  ['post', 'post'],
  ['page', 'page'],
  ['portfolio', 'portfolio'],
  ['custom_type', 'custom_type'],
  
  // Edge cases
  ['', null],
  [' ', null],
  ['the blog', 'post'],
  ['just pages', 'page']
];

let passed = 0;
let failed = 0;

console.log('Individual tests:');
testCases.forEach(([input, expected]) => {
  const result = parsePostType(input);
  const status = result === expected ? '✅' : '❌';
  
  if (result === expected) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`${status} "${input}" → "${result}" (expected: "${expected}")`);
});

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

// Test batch parsing
console.log('\n🧪 Testing Batch Parsing\n');

const batchInputs = [
  'blog posts only',
  'team member profiles',
  'pages',
  'portfolio'
];

const batchResult = parsePostTypes(batchInputs);
console.log('Input array:', batchInputs);
console.log('Parsed result:', batchResult);

// Expected: ['post', 'team', 'page', 'portfolio']
const expectedBatch = ['post', 'team', 'page', 'portfolio'];
const batchMatch = JSON.stringify(batchResult.sort()) === JSON.stringify(expectedBatch.sort());

console.log(`\n${batchMatch ? '✅' : '❌'} Batch parsing ${batchMatch ? 'PASSED' : 'FAILED'}`);

if (failed === 0 && batchMatch) {
  console.log('\n✅ All tests passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed');
  process.exit(1);
}
