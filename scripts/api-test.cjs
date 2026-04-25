#!/usr/bin/env node
/**
 * API Endpoint Testing
 * Tests: Response codes, data validation, error handling, performance
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:4015';
const RESULTS_DIR = path.join(__dirname, '..', 'test-results');

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultsFile = path.join(RESULTS_DIR, `api-test-${timestamp}.json`);

console.log('🧪 Starting API Endpoint Tests...');
console.log(`Target: ${BASE_URL}\n`);

const endpoints = [
  // Health & Info
  { method: 'GET', path: '/health', expectedStatus: 200, name: 'Health Check' },
  
  // API Routes
  { method: 'GET', path: '/api/health', expectedStatus: 200, name: 'API Health' },
  
  // Transactions
  { method: 'GET', path: '/api/transactions', expectedStatus: [200, 401], name: 'Get Transactions (Auth Required)' },
  { method: 'POST', path: '/api/transactions', body: { type: 'expense', amount: 100, category: 'food', date: new Date().toISOString() }, expectedStatus: [201, 401, 400], name: 'Create Transaction' },
  
  // Categories
  { method: 'GET', path: '/api/categories', expectedStatus: [200, 401], name: 'Get Categories' },
  
  // Budgets
  { method: 'GET', path: '/api/budgets', expectedStatus: [200, 401], name: 'Get Budgets' },
  
  // Reports
  { method: 'GET', path: '/api/reports/summary', expectedStatus: [200, 401], name: 'Get Summary Report' },
  { method: 'GET', path: '/api/reports/by-category', expectedStatus: [200, 401], name: 'Get Category Report' },
  { method: 'GET', path: '/api/reports/monthly', expectedStatus: [200, 401], name: 'Get Monthly Report' },
  
  // Auth
  { method: 'POST', path: '/api/auth/sign-in/email', body: { email: 'test@test.com', password: 'wrong' }, expectedStatus: [400, 401, 404], name: 'Auth Sign In (Invalid)' },
  { method: 'GET', path: '/api/auth/session', expectedStatus: [200, 401], name: 'Get Session' },
  
  // Static assets
  { method: 'GET', path: '/sw.js', expectedStatus: [200, 404], name: 'Service Worker' },
  { method: 'GET', path: '/manifest.json', expectedStatus: [200, 404], name: 'Manifest' },
  
  // Error handling
  { method: 'GET', path: '/api/nonexistent', expectedStatus: 404, name: '404 Error' },
  { method: 'GET', path: '/api/trigger-error', expectedStatus: [500, 404], name: '500 Error Handling' },
];

const results = {
  timestamp: new Date().toISOString(),
  target: BASE_URL,
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    errors: 0,
  },
};

async function testEndpoint(endpoint) {
  const startTime = Date.now();
  
  try {
    const options = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    
    if (endpoint.body) {
      options.body = JSON.stringify(endpoint.body);
    }
    
    const response = await fetch(`${BASE_URL}${endpoint.path}`, options);
    const duration = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || '';
    
    let body = null;
    try {
      if (contentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }
    } catch (e) {
      body = null;
    }
    
    // Check expected status
    const expectedStatuses = Array.isArray(endpoint.expectedStatus) 
      ? endpoint.expectedStatus 
      : [endpoint.expectedStatus];
    
    const statusMatch = expectedStatuses.includes(response.status);
    
    // Check HTML expectation
    let htmlMatch = true;
    if (endpoint.expectHtml) {
      htmlMatch = contentType.includes('text/html') || 
                  (typeof body === 'string' && body.includes('<!DOCTYPE'));
    }
    
    const passed = statusMatch && htmlMatch;
    
    const testResult = {
      name: endpoint.name,
      method: endpoint.method,
      path: endpoint.path,
      status: passed ? 'passed' : 'failed',
      responseStatus: response.status,
      expectedStatus: endpoint.expectedStatus,
      duration,
      contentType: contentType.split(';')[0],
      bodyPreview: typeof body === 'string' 
        ? body.substring(0, 100) 
        : JSON.stringify(body).substring(0, 100),
    };
    
    results.tests.push(testResult);
    results.summary.total++;
    
    if (passed) {
      results.summary.passed++;
      console.log(`✅ ${endpoint.name} (${duration}ms)`);
    } else {
      results.summary.failed++;
      console.log(`❌ ${endpoint.name} - Expected: ${endpoint.expectedStatus}, Got: ${response.status} (${duration}ms)`);
    }
    
    return testResult;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    results.summary.total++;
    results.summary.errors++;
    
    const testResult = {
      name: endpoint.name,
      method: endpoint.method,
      path: endpoint.path,
      status: 'error',
      error: error.message,
      duration,
    };
    
    results.tests.push(testResult);
    console.log(`💥 ${endpoint.name} - Error: ${error.message}`);
    return testResult;
  }
}

async function runConcurrentTests(endpoints, concurrency = 5) {
  const batches = [];
  for (let i = 0; i < endpoints.length; i += concurrency) {
    batches.push(endpoints.slice(i, i + concurrency));
  }
  
  for (const batch of batches) {
    await Promise.all(batch.map(testEndpoint));
  }
}

async function testResponseTimeRequirements() {
  console.log('\n⏱️  Response Time Requirements:');
  
  const p95Threshold = 500; // 500ms
  const p99Threshold = 1000; // 1000ms
  
  const durations = results.tests
    .filter(t => t.duration)
    .map(t => t.duration)
    .sort((a, b) => a - b);
  
  if (durations.length === 0) return;
  
  const p95Index = Math.floor(durations.length * 0.95);
  const p99Index = Math.floor(durations.length * 0.99);
  
  const p95 = durations[p95Index];
  const p99 = durations[p99Index];
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const min = durations[0];
  const max = durations[durations.length - 1];
  
  console.log(`  Average: ${avg.toFixed(0)}ms`);
  console.log(`  Min: ${min}ms, Max: ${max}ms`);
  console.log(`  P95: ${p95}ms ${p95 <= p95Threshold ? '✅' : '❌'}`);
  console.log(`  P99: ${p99}ms ${p99 <= p99Threshold ? '✅' : '❌'}`);
  
  results.performance = {
    average: avg,
    min,
    max,
    p95,
    p99,
    p95Passed: p95 <= p95Threshold,
    p99Passed: p99 <= p99Threshold,
  };
}

async function main() {
  console.log(`Testing ${endpoints.length} endpoints...\n`);
  
  await runConcurrentTests(endpoints, 3);
  
  await testResponseTimeRequirements();
  
  // Save results
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 API TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total: ${results.summary.total}`);
  console.log(`✅ Passed: ${results.summary.passed}`);
  console.log(`❌ Failed: ${results.summary.failed}`);
  console.log(`💥 Errors: ${results.summary.errors}`);
  console.log(`\nSuccess Rate: ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%`);
  console.log(`\n📁 Results saved to: ${resultsFile}`);
  console.log('');
  
  if (results.summary.failed + results.summary.errors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ API test failed:', err.message);
  process.exit(1);
});
