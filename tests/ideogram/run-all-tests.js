#!/usr/bin/env node

/**
 * Ideogram Test Suite Runner
 * 
 * Runs all Ideogram integration tests in the proper order
 */

const { spawn } = require('child_process');
const path = require('path');

const tests = [
  {
    file: 'diagnostic-ideogram.js',
    name: 'System Diagnostics',
    description: 'Validate system configuration and database state'
  },
  {
    file: 'test-ideogram-capabilities.js',
    name: 'Model Capabilities',
    description: 'Test available models and features'
  },
  {
    file: 'test-ideogram-pricing.js',
    name: 'Pricing Calculation',
    description: 'Validate cost calculation logic'
  },
  {
    file: 'test-model-resolution.js',
    name: 'Model Resolution',
    description: 'Test model lookup fixes'
  },
  {
    file: 'test-token-conversion.js',
    name: 'Token Conversion',
    description: 'Validate EUR to token conversion'
  },
  {
    file: 'test-messagecost-fix.js',
    name: 'MessageCost Fix',
    description: 'Test database validation fixes'
  },
  {
    file: 'test-postprocessing-fix.js',
    name: 'Post-processing Fix',
    description: 'Validate post-processing improvements'
  },
  {
    file: 'test-image-display-integration.js',
    name: 'Image Display Integration',
    description: 'Test complete image display workflow'
  },
  {
    file: 'test-ideogram-sendrequest.js',
    name: 'Service Method Testing',
    description: 'Test ideogramService.sendRequest method'
  }
];

async function runTest(test) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 Running: ${test.name}`);
    console.log(`📝 Description: ${test.description}`);
    console.log(`📁 File: ${test.file}`);
    console.log(`${'='.repeat(60)}\n`);

    const child = spawn('node', [test.file], {
      cwd: path.dirname(__filename),
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ ${test.name} - PASSED`);
        resolve();
      } else {
        console.log(`\n❌ ${test.name} - FAILED (exit code: ${code})`);
        reject(new Error(`Test failed: ${test.name}`));
      }
    });

    child.on('error', (error) => {
      console.log(`\n💥 ${test.name} - ERROR: ${error.message}`);
      reject(error);
    });
  });
}

async function runAllTests() {
  console.log('🚀 Starting Ideogram Integration Test Suite');
  console.log(`📊 Total tests: ${tests.length}`);
  console.log(`📅 Started: ${new Date().toISOString()}\n`);

  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  for (const test of tests) {
    try {
      await runTest(test);
      results.passed++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        test: test.name,
        error: error.message
      });
      
      // Continue with other tests even if one fails
      console.log(`⚠️  Continuing with remaining tests...\n`);
    }
  }

  // Final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 TEST SUITE SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📊 Total: ${tests.length}`);
  console.log(`📅 Completed: ${new Date().toISOString()}`);

  if (results.failed > 0) {
    console.log('\n💥 FAILED TESTS:');
    results.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.test}: ${error.error}`);
    });
  }

  if (results.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Ideogram integration is working correctly.');
  } else {
    console.log(`\n⚠️  ${results.failed} test(s) failed. Please review and fix issues.`);
  }

  console.log(`${'='.repeat(60)}\n`);
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Test suite runner failed:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };