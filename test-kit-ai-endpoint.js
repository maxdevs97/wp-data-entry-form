#!/usr/bin/env node

/**
 * Test Kit AI Interpretation Endpoint
 * 
 * Test examples:
 * 1. "Transfer only the blog posts"
 * 2. "Certain pages: About, Contact"
 * 3. Natural language: "all blog posts and the about page"
 */

const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

const testCases = [
  {
    name: 'Test 1: Blog posts only',
    data: {
      sourceUrl: 'https://example.com',
      destinationUrl: 'https://test.com',
      wpUsername: 'admin',
      wpPassword: 'test1234test',
      contentTypeCertainPages: false,
      contentTypePostTypes: true,
      certainPagesTextarea: '',
      postTypesTextarea: 'Transfer only the blog posts',
      specialInstructions: 'Please preserve all images',
      preserve: {
        slug: true,
        title: true,
        bodyContent: true
      }
    }
  },
  {
    name: 'Test 2: Certain pages (About, Contact)',
    data: {
      sourceUrl: 'https://example.com',
      destinationUrl: 'https://test.com',
      wpUsername: 'admin',
      wpPassword: 'test1234test',
      contentTypeCertainPages: true,
      contentTypePostTypes: false,
      certainPagesTextarea: 'About\nContact',
      postTypesTextarea: '',
      specialInstructions: '',
      preserve: {
        slug: true,
        title: true,
        bodyContent: true
      }
    }
  },
  {
    name: 'Test 3: Natural language - All blog posts and about page',
    data: {
      sourceUrl: 'https://example.com',
      destinationUrl: 'https://test.com',
      wpUsername: 'admin',
      wpPassword: 'test1234test',
      contentTypeCertainPages: true,
      contentTypePostTypes: true,
      certainPagesTextarea: 'about page',
      postTypesTextarea: 'all blog posts',
      specialInstructions: 'Keep everything as-is',
      preserve: {
        slug: true,
        title: true,
        bodyContent: true
      }
    }
  }
];

async function runTest(testCase) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 ${testCase.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log('\n📤 Request data:');
  console.log('  Certain Pages:', testCase.data.certainPagesTextarea || '(none)');
  console.log('  Post Types:', testCase.data.postTypesTextarea || '(none)');
  console.log('  Special Instructions:', testCase.data.specialInstructions || '(none)');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/submit-to-kit`, testCase.data, {
      timeout: 10000
    });
    
    if (response.data.success) {
      console.log('\n✅ Success!');
      console.log('  Job ID:', response.data.jobId);
      console.log('  Message:', response.data.message);
      
      // Poll status once to see interpretation
      console.log('\n⏳ Waiting 2 seconds for interpretation...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await axios.get(`${BASE_URL}/api/job-status/${response.data.jobId}`);
      const job = statusResponse.data;
      
      console.log('\n📊 Job Status:');
      console.log('  Status:', job.status);
      console.log('  Stage:', job.progress?.stage);
      console.log('  Message:', job.progress?.message);
      
      if (job.submissionData?.aiInterpretation) {
        console.log('\n🤖 AI Interpretation Result:');
        console.log('  Certain Pages:', JSON.stringify(job.submissionData.aiInterpretation.interpretation.certainPages));
        console.log('  Post Types:', JSON.stringify(job.submissionData.aiInterpretation.interpretation.postTypes));
        console.log('  Fallback Used:', job.submissionData.aiInterpretation.fallback ? 'Yes' : 'No');
      }
      
      return { success: true, jobId: response.data.jobId };
    } else {
      console.log('\n❌ Failed:', response.data.error);
      return { success: false, error: response.data.error };
    }
  } catch (error) {
    console.log('\n❌ Error:', error.response?.data?.error || error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Kit AI Endpoint Test Suite');
  console.log('Testing against:', BASE_URL);
  console.log(`\nNote: This will create real jobs. Make sure you're testing against a dev server.`);
  
  const results = [];
  
  for (const testCase of testCases) {
    const result = await runTest(testCase);
    results.push({ name: testCase.name, ...result });
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (result.jobId) {
      console.log(`   Job ID: ${result.jobId}`);
    }
  });
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  console.log(`\n${passed}/${total} tests passed`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
