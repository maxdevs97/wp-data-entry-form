#!/usr/bin/env node

/**
 * Test AI Interpreter Module Directly
 * Tests the interpretation logic without making HTTP requests
 */

const { interpretWithAI } = require('./src/kit-ai-interpreter');

const testCases = [
  {
    name: 'Test 1: Blog posts only',
    input: {
      contentTypeCertainPages: false,
      contentTypePostTypes: true,
      certainPagesRaw: '',
      postTypesRaw: 'Transfer only the blog posts',
      specialInstructions: 'Please preserve all images'
    },
    expected: {
      certainPages: [],
      postTypes: ['post']
    }
  },
  {
    name: 'Test 2: Certain pages (About, Contact)',
    input: {
      contentTypeCertainPages: true,
      contentTypePostTypes: false,
      certainPagesRaw: 'About\nContact',
      postTypesRaw: '',
      specialInstructions: ''
    },
    expected: {
      certainPages: ['about', 'contact'],
      postTypes: []
    }
  },
  {
    name: 'Test 3: Natural language - about page',
    input: {
      contentTypeCertainPages: true,
      contentTypePostTypes: false,
      certainPagesRaw: 'about page',
      postTypesRaw: '',
      specialInstructions: ''
    },
    expected: {
      certainPages: ['about'],
      postTypes: []
    }
  },
  {
    name: 'Test 4: Portfolio items',
    input: {
      contentTypeCertainPages: false,
      contentTypePostTypes: true,
      certainPagesRaw: '',
      postTypesRaw: 'Portfolio items',
      specialInstructions: ''
    },
    expected: {
      certainPages: [],
      postTypes: ['portfolio']
    }
  },
  {
    name: 'Test 5: Team member profiles',
    input: {
      contentTypeCertainPages: false,
      contentTypePostTypes: true,
      certainPagesRaw: '',
      postTypesRaw: 'team member profiles',
      specialInstructions: ''
    },
    expected: {
      certainPages: [],
      postTypes: ['team']
    }
  },
  {
    name: 'Test 6: Mixed - blog posts and about page',
    input: {
      contentTypeCertainPages: true,
      contentTypePostTypes: true,
      certainPagesRaw: 'about page\ncontact page',
      postTypesRaw: 'blog posts',
      specialInstructions: 'Keep everything as-is'
    },
    expected: {
      certainPages: ['about', 'contact'],
      postTypes: ['post']
    }
  },
  {
    name: 'Test 7: Direct slugs',
    input: {
      contentTypeCertainPages: false,
      contentTypePostTypes: true,
      certainPagesRaw: '',
      postTypesRaw: 'portfolio\ntestimonials\nteam',
      specialInstructions: ''
    },
    expected: {
      certainPages: [],
      postTypes: ['portfolio', 'testimonials', 'team']
    }
  },
  {
    name: 'Test 8: URL format',
    input: {
      contentTypeCertainPages: true,
      contentTypePostTypes: false,
      certainPagesRaw: 'https://example.com/about-us\nhttps://example.com/contact',
      postTypesRaw: '',
      specialInstructions: ''
    },
    expected: {
      certainPages: ['about-us', 'contact'],
      postTypes: []
    }
  }
];

async function runTests() {
  console.log('🧪 AI Interpreter Unit Tests\n');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`\n📋 ${testCase.name}`);
    console.log('  Input:');
    if (testCase.input.certainPagesRaw) {
      console.log(`    Certain Pages: "${testCase.input.certainPagesRaw}"`);
    }
    if (testCase.input.postTypesRaw) {
      console.log(`    Post Types: "${testCase.input.postTypesRaw}"`);
    }
    
    try {
      const result = await interpretWithAI(testCase.input);
      
      console.log('  Result:');
      console.log('    Certain Pages:', JSON.stringify(result.interpretation.certainPages));
      console.log('    Post Types:', JSON.stringify(result.interpretation.postTypes));
      
      // Check if matches expected
      const pagesMatch = JSON.stringify(result.interpretation.certainPages.sort()) === 
                        JSON.stringify(testCase.expected.certainPages.sort());
      const typesMatch = JSON.stringify(result.interpretation.postTypes.sort()) === 
                        JSON.stringify(testCase.expected.postTypes.sort());
      
      if (pagesMatch && typesMatch) {
        console.log('  ✅ PASS');
        passed++;
      } else {
        console.log('  ❌ FAIL');
        console.log('  Expected:');
        console.log('    Certain Pages:', JSON.stringify(testCase.expected.certainPages));
        console.log('    Post Types:', JSON.stringify(testCase.expected.postTypes));
        failed++;
      }
      
    } catch (error) {
      console.log('  ❌ ERROR:', error.message);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed (${testCases.length} total)`);
  
  if (failed === 0) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
