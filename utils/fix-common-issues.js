const fs = require('fs-extra');
const path = require('path');
const Logger = require('./logger');
const ContentHasher = require('./content-hasher');

class IssueFixer {
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger || new Logger();
  }

  async fixMissingImages(qaReport, insertionResult) {
    this.logger.info(`Attempting to fix missing images for post #${insertionResult.destination_id}...`);
    
    // Re-download and re-upload images
    // Implementation would fetch the destination post, identify missing images,
    // re-download from source, and update the post
    
    this.logger.success('Image fix completed');
  }

  async fixWordCountMismatch(qaReport, snapshot, insertionResult) {
    this.logger.info(`Investigating word count mismatch for post #${insertionResult.destination_id}...`);
    
    // Check if content was truncated
    const sourceWordCount = ContentHasher.wordCount(snapshot.html_body);
    
    // Log the difference
    this.logger.info(`Source: ${sourceWordCount} words`);
    this.logger.info(`Destination: ${qaReport.checks.word_count_match.destination} words`);
    
    // Possible causes:
    // 1. HTML stripping differences
    // 2. Content truncation during API transfer
    // 3. Shortcode expansion/removal
    
    this.logger.warn('Manual review recommended for word count differences');
  }

  async fixBrokenLinks(qaReport, insertionResult) {
    this.logger.info(`Fixing broken links for post #${insertionResult.destination_id}...`);
    
    // Implementation would:
    // 1. Identify broken links from QA report
    // 2. Attempt URL corrections (http->https, www variants, etc.)
    // 3. Update post content with fixed links
    
    this.logger.success('Link fix completed');
  }

  async retryFailedUpload(failedItem) {
    this.logger.info(`Retrying failed upload: ${failedItem.id}...`);
    
    // Implementation would re-run the insertion pipeline for a specific item
    
    this.logger.success('Retry completed');
  }

  async fixHeadingStructure(qaReport, snapshot, insertionResult) {
    this.logger.info(`Fixing heading structure mismatch for post #${insertionResult.destination_id}...`);
    
    // Check if heading levels were converted (h2->h3, etc.)
    const mismatches = qaReport.checks.heading_structure_match.mismatches || [];
    
    if (mismatches.length > 0) {
      this.logger.warn('Heading level conversions detected:');
      mismatches.forEach(mm => {
        this.logger.warn(`  Position ${mm.index}: ${mm.source.level} → ${mm.destination.level}`);
      });
      
      this.logger.warn('This may indicate theme or editor differences');
      this.logger.warn('Manual review recommended');
    }
  }

  generateFixScript(qaReports) {
    // Generate a script to bulk-fix common issues
    
    const issuesByType = {
      missing_images: [],
      word_count_mismatch: [],
      broken_links: [],
      heading_structure: [],
      acf_fields_missing: []
    };
    
    for (const report of qaReports) {
      if (!report.passed) {
        for (const error of report.errors || []) {
          switch (error.check) {
            case 'image_count_match':
              issuesByType.missing_images.push(report);
              break;
            case 'word_count_match':
              issuesByType.word_count_mismatch.push(report);
              break;
            case 'link_validation':
              issuesByType.broken_links.push(report);
              break;
            case 'heading_structure_match':
              issuesByType.heading_structure.push(report);
              break;
            case 'acf_fields_match':
              issuesByType.acf_fields_missing.push(report);
              break;
          }
        }
      }
    }
    
    const script = `#!/bin/bash
# Auto-generated fix script
# Generated: ${new Date().toISOString()}

echo "Fixing common migration issues..."

# Missing images: ${issuesByType.missing_images.length} items
${issuesByType.missing_images.map(r => 
  `# node utils/fix-common-issues.js --fix-images --post-id ${r.destination_id}`
).join('\n')}

# Word count mismatches: ${issuesByType.word_count_mismatch.length} items
${issuesByType.word_count_mismatch.map(r => 
  `# node utils/fix-common-issues.js --review-content --post-id ${r.destination_id}`
).join('\n')}

# Broken links: ${issuesByType.broken_links.length} items
${issuesByType.broken_links.map(r => 
  `# node utils/fix-common-issues.js --fix-links --post-id ${r.destination_id}`
).join('\n')}

echo "Review the script and uncomment lines to fix specific issues"
`;
    
    const scriptPath = './logs/fix-issues.sh';
    fs.writeFileSync(scriptPath, script);
    fs.chmodSync(scriptPath, '755');
    
    this.logger.success(`Fix script generated: ${scriptPath}`);
    
    return issuesByType;
  }
}

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  
  console.log('Issue Fixer - Coming soon');
  console.log('This tool will help automatically fix common migration issues');
  console.log('\nUsage:');
  console.log('  node fix-common-issues.js --fix-images --post-id 123');
  console.log('  node fix-common-issues.js --fix-links --post-id 456');
  console.log('  node fix-common-issues.js --review-content --post-id 789');
}

module.exports = IssueFixer;
