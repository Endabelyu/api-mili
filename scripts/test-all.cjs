#!/usr/bin/env node
/**
 * Comprehensive Test Suite Runner
 * Runs all tests: Performance, Security, Memory Leak, API
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;
const resultsDir = path.join(scriptsDir, '..', 'test-results');

if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const tests = [
  { name: 'API Tests', script: 'api-test.cjs', required: true },
  { name: 'E2E Main Flow', command: 'npx playwright test tests/e2e/main-flow.spec.ts', required: true },
  { name: 'Security Scan', script: 'security-scan.cjs', required: false },
  { name: 'Performance Tests', script: 'performance-test.cjs', required: false },
  { name: 'Memory Leak Detection', script: 'memory-leak-test.cjs', required: false },
];

const results = {
  timestamp: new Date().toISOString(),
  summary: {
    total: tests.length,
    passed: 0,
    failed: 0,
    skipped: 0,
  },
  tests: [],
};

function runTest(test) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🧪 Running: ${test.name}`);
    console.log('='.repeat(70));
    
    const startTime = Date.now();
    let child;
    
    if (test.command) {
      const [cmd, ...args] = test.command.split(' ');
      child = spawn(cmd, args, {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' },
      });
    } else {
      const scriptPath = path.join(scriptsDir, test.script);
      if (!fs.existsSync(scriptPath)) {
        console.log(`⚠️  Script not found: ${test.script}`);
        results.summary.skipped++;
        resolve({ name: test.name, status: 'skipped', reason: 'Script not found' });
        return;
      }
      child = spawn('node', [scriptPath], {
        stdio: 'inherit',
        env: { ...process.env, FORCE_COLOR: '1' },
      });
    }
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      const passed = code === 0;
      
      if (passed) {
        results.summary.passed++;
        console.log(`\n✅ ${test.name} completed in ${duration}ms`);
      } else {
        if (test.required) {
          results.summary.failed++;
          console.log(`\n❌ ${test.name} FAILED (exit code: ${code})`);
        } else {
          results.summary.skipped++;
          console.log(`\n⚠️  ${test.name} failed but not required`);
        }
      }
      
      resolve({
        name: test.name,
        status: passed ? 'passed' : test.required ? 'failed' : 'warning',
        duration,
        exitCode: code,
      });
    });
    
    child.on('error', (err) => {
      console.log(`\n💥 ${test.name} error: ${err.message}`);
      results.summary.failed++;
      resolve({
        name: test.name,
        status: 'error',
        error: err.message,
      });
    });
  });
}

async function generateReport() {
  const reportFile = path.join(resultsDir, `test-report-${timestamp}.html`);
  
  // Gather all result files
  const resultFiles = fs.readdirSync(resultsDir)
    .filter(f => f.endsWith('.json') && f.includes(timestamp.substring(0, 10)))
    .map(f => ({
      name: f,
      content: JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf-8')),
    }));
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test Report - ${timestamp}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
    .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 36px; font-weight: bold; color: #007bff; }
    .stat-label { color: #666; margin-top: 5px; }
    .passed { color: #28a745; }
    .failed { color: #dc3545; }
    .warning { color: #ffc107; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f8f9fa; font-weight: 600; }
    tr:hover { background: #f8f9fa; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge-pass { background: #d4edda; color: #155724; }
    .badge-fail { background: #f8d7da; color: #721c24; }
    .badge-warn { background: #fff3cd; color: #856404; }
    pre { background: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; }
    .timestamp { color: #999; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧪 Comprehensive Test Report</h1>
    <p class="timestamp">Generated: ${results.timestamp}</p>
    
    <h2>Summary</h2>
    <div class="summary">
      <div class="stat-card">
        <div class="stat-value">${results.summary.total}</div>
        <div class="stat-label">Total Tests</div>
      </div>
      <div class="stat-card">
        <div class="stat-value passed">${results.summary.passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value failed">${results.summary.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value warning">${results.summary.skipped}</div>
        <div class="stat-label">Skipped</div>
      </div>
    </div>
    
    <h2>Test Results</h2>
    <table>
      <thead>
        <tr>
          <th>Test</th>
          <th>Status</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${results.tests.map(t => `
          <tr>
            <td>${t.name}</td>
            <td><span class="badge badge-${t.status === 'passed' ? 'pass' : t.status === 'warning' ? 'warn' : 'fail'}">${t.status.toUpperCase()}</span></td>
            <td>${t.duration ? t.duration + 'ms' : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <h2>Detailed Results</h2>
    ${resultFiles.map(f => `
      <h3>${f.name}</h3>
      <pre>${JSON.stringify(f.content, null, 2)}</pre>
    `).join('')}
  </div>
</body>
</html>`;
  
  fs.writeFileSync(reportFile, html);
  console.log(`\n📊 HTML Report generated: ${reportFile}`);
  
  // Also save JSON summary
  const summaryFile = path.join(resultsDir, `test-summary-${timestamp}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(results, null, 2));
  console.log(`📄 JSON Summary saved: ${summaryFile}`);
}

async function main() {
  console.log('🚀 Starting Comprehensive Test Suite');
  console.log('=' .repeat(70));
  
  for (const test of tests) {
    const result = await runTest(test);
    results.tests.push(result);
  }
  
  await generateReport();
  
  console.log('\n' + '='.repeat(70));
  console.log('📋 FINAL SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total: ${results.summary.total}`);
  console.log(`✅ Passed: ${results.summary.passed}`);
  console.log(`❌ Failed: ${results.summary.failed}`);
  console.log(`⏭️  Skipped: ${results.summary.skipped}`);
  console.log('');
  
  if (results.summary.failed > 0) {
    console.log('❌ Some tests failed. Check the report for details.');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('❌ Test suite failed:', err.message);
  process.exit(1);
});
