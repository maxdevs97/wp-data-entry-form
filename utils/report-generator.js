const fs = require('fs-extra');
const path = require('path');

class ReportGenerator {
  static generateHTML(qaReports, outputPath) {
    const passedCount = qaReports.filter(r => r.passed).length;
    const failedCount = qaReports.filter(r => !r.passed).length;
    const successRate = ((passedCount / qaReports.length) * 100).toFixed(2);
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Migration QA Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      font-size: 32px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .stat-value {
      font-size: 36px;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      color: #666;
      margin-top: 5px;
    }
    .report-item {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 15px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .report-item.passed {
      border-left: 4px solid #10b981;
    }
    .report-item.failed {
      border-left: 4px solid #ef4444;
    }
    .report-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .check-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 10px;
      margin-top: 15px;
    }
    .check-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .check-item.passed {
      color: #10b981;
    }
    .check-item.failed {
      color: #ef4444;
    }
    .error-list {
      margin-top: 15px;
      padding: 15px;
      background: #fef2f2;
      border-radius: 6px;
    }
    .error-item {
      color: #991b1b;
      margin-bottom: 5px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Migration QA Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>
  
  <div class="stats">
    <div class="stat-card">
      <div class="stat-value">${qaReports.length}</div>
      <div class="stat-label">Total Items</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${passedCount}</div>
      <div class="stat-label">Passed QA</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${failedCount}</div>
      <div class="stat-label">Failed QA</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${successRate}%</div>
      <div class="stat-label">Success Rate</div>
    </div>
  </div>
  
  <h2>Detailed Results</h2>
  
  ${qaReports.map(report => this.generateReportCard(report)).join('\n')}
  
</body>
</html>`;
    
    fs.writeFileSync(outputPath, html);
    return outputPath;
  }

  static generateReportCard(report) {
    const status = report.passed ? 'passed' : 'failed';
    const checkmarks = {
      passed: '✅',
      failed: '❌'
    };
    
    return `
    <div class="report-item ${status}">
      <div class="report-title">
        ${checkmarks[status]} Source ID: ${report.source_id} → Destination ID: ${report.destination_id}
      </div>
      <div>
        <strong>Source:</strong> ${report.source_url || 'N/A'}<br>
        <strong>Destination:</strong> ${report.destination_url || 'N/A'}
      </div>
      
      <div class="check-list">
        ${Object.entries(report.checks || {}).map(([name, check]) => {
          const checkStatus = check.passed ? 'passed' : 'failed';
          return `<div class="check-item ${checkStatus}">
            <span>${check.passed ? '✓' : '✗'}</span>
            <span>${this.formatCheckName(name)}</span>
          </div>`;
        }).join('\n')}
      </div>
      
      ${report.errors && report.errors.length > 0 ? `
        <div class="error-list">
          <strong>Errors:</strong>
          ${report.errors.map(err => `
            <div class="error-item">• ${err.check}: ${err.message}</div>
          `).join('\n')}
        </div>
      ` : ''}
    </div>`;
  }

  static formatCheckName(name) {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  static async generateComparisonHTML(sourceSnapshot, destPost, outputPath) {
    // Generate side-by-side comparison HTML
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Content Comparison</title>
  <style>
    body { font-family: sans-serif; margin: 20px; }
    .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .column { border: 1px solid #ddd; padding: 20px; }
    .source { background: #f0f9ff; }
    .destination { background: #f0fdf4; }
    h2 { margin-top: 0; }
    .content { max-height: 600px; overflow-y: auto; }
  </style>
</head>
<body>
  <h1>Content Comparison</h1>
  <div class="comparison">
    <div class="column source">
      <h2>Source</h2>
      <h3>${sourceSnapshot.title}</h3>
      <div class="content">${sourceSnapshot.html_body}</div>
    </div>
    <div class="column destination">
      <h2>Destination</h2>
      <h3>${destPost.title?.rendered || 'Untitled'}</h3>
      <div class="content">${destPost.content?.rendered || ''}</div>
    </div>
  </div>
</body>
</html>`;
    
    fs.writeFileSync(outputPath, html);
    return outputPath;
  }
}

module.exports = ReportGenerator;
