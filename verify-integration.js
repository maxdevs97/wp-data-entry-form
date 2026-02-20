#!/usr/bin/env node

/**
 * Integration Verification Script
 * Verifies all components of the real WordPress migration framework integration
 */

const fs = require('fs-extra');
const path = require('path');

console.log('🔍 WordPress Migration Framework Integration Verification\n');
console.log('='.repeat(60));

let allPassed = true;

// Test 1: Check dependencies
console.log('\n📦 Test 1: Dependencies');
try {
  require('axios');
  require('cheerio');
  require('fs-extra');
  console.log('✅ All dependencies installed');
} catch (error) {
  console.error('❌ Missing dependency:', error.message);
  allPassed = false;
}

// Test 2: Check core modules exist
console.log('\n🔧 Test 2: Core Migration Modules');
const coreModules = [
  './core/extract.js',
  './core/transform.js',
  './core/insert.js',
  './core/verify.js'
];

coreModules.forEach(modulePath => {
  if (fs.existsSync(modulePath)) {
    try {
      require(modulePath);
      console.log(`✅ ${modulePath} loaded successfully`);
    } catch (error) {
      console.error(`❌ ${modulePath} has errors:`, error.message);
      allPassed = false;
    }
  } else {
    console.error(`❌ ${modulePath} not found`);
    allPassed = false;
  }
});

// Test 3: Check utils modules
console.log('\n🛠️  Test 3: Utility Modules');
const utilModules = [
  './utils/logger.js',
  './utils/api-client.js',
  './utils/media-handler.js',
  './utils/progress.js'
];

utilModules.forEach(modulePath => {
  if (fs.existsSync(modulePath)) {
    try {
      require(modulePath);
      console.log(`✅ ${modulePath} loaded successfully`);
    } catch (error) {
      console.error(`❌ ${modulePath} has errors:`, error.message);
      allPassed = false;
    }
  } else {
    console.error(`❌ ${modulePath} not found`);
    allPassed = false;
  }
});

// Test 4: Check lib modules
console.log('\n📚 Test 4: Library Modules');
const libModules = [
  './lib/backup.js'
];

libModules.forEach(modulePath => {
  if (fs.existsSync(modulePath)) {
    try {
      require(modulePath);
      console.log(`✅ ${modulePath} loaded successfully`);
    } catch (error) {
      console.error(`❌ ${modulePath} has errors:`, error.message);
      allPassed = false;
    }
  } else {
    console.error(`❌ ${modulePath} not found`);
    allPassed = false;
  }
});

// Test 5: Check processor.js
console.log('\n⚙️  Test 5: Processor Integration');
try {
  const processor = require('./src/processor.js');
  if (typeof processor.processJob === 'function') {
    console.log('✅ processor.js loaded successfully');
    console.log('✅ processJob function exists');
  } else {
    console.error('❌ processJob function not found in processor.js');
    allPassed = false;
  }
} catch (error) {
  console.error('❌ processor.js has errors:', error.message);
  allPassed = false;
}

// Test 6: Check working directories
console.log('\n📁 Test 6: Working Directories');
const directories = [
  './content-snapshots',
  './transformed-content',
  './backups',
  './logs',
  './qa-reports'
];

directories.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`✅ ${dir} exists`);
  } else {
    console.log(`⚠️  ${dir} does not exist (will be created on first run)`);
  }
});

// Test 7: Check server endpoints
console.log('\n🌐 Test 7: Server Configuration');
try {
  const serverPath = './src/server.js';
  if (fs.existsSync(serverPath)) {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    
    // Check for required endpoints
    const endpoints = [
      '/api/job-status/:jobId',
      '/api/submit',
      '/status'
    ];
    
    endpoints.forEach(endpoint => {
      if (serverCode.includes(endpoint)) {
        console.log(`✅ Endpoint ${endpoint} exists`);
      } else {
        console.error(`❌ Endpoint ${endpoint} not found`);
        allPassed = false;
      }
    });
  }
} catch (error) {
  console.error('❌ Server verification failed:', error.message);
  allPassed = false;
}

// Test 8: Check frontend files
console.log('\n🎨 Test 8: Frontend Files');
const frontendFiles = [
  './public/script.js',
  './public/status.js',
  './public/status.html',
  './public/index.html'
];

frontendFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} exists`);
    
    // Special check for job ID in URL functionality
    if (file === './public/script.js') {
      const scriptCode = fs.readFileSync(file, 'utf8');
      if (scriptCode.includes('window.history.pushState')) {
        console.log('   ✅ Job ID URL parameter functionality found');
      } else {
        console.error('   ❌ Job ID URL parameter functionality not found');
        allPassed = false;
      }
    }
  } else {
    console.error(`❌ ${file} not found`);
    allPassed = false;
  }
});

// Test 9: Verify package.json
console.log('\n📋 Test 9: Package Configuration');
try {
  const packageJson = require('./package.json');
  const requiredDeps = ['axios', 'cheerio', 'fs-extra', 'express'];
  
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) {
      console.log(`✅ ${dep} in package.json`);
    } else {
      console.error(`❌ ${dep} missing from package.json`);
      allPassed = false;
    }
  });
} catch (error) {
  console.error('❌ Package.json verification failed:', error.message);
  allPassed = false;
}

// Final Summary
console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('✅ ALL CHECKS PASSED - Integration Successful!\n');
  console.log('🚀 Ready for deployment and testing');
  console.log('📖 See TESTING_GUIDE.md for testing instructions');
  console.log('📄 See MIGRATION_FRAMEWORK_INTEGRATION.md for full details\n');
  process.exit(0);
} else {
  console.error('❌ SOME CHECKS FAILED - Review errors above\n');
  process.exit(1);
}
