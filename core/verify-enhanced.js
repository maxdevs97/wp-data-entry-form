const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const Logger = require('../utils/logger');
const WordPressAPIClient = require('../utils/api-client');

/**
 * Enhanced Content Verifier with Comprehensive QA Checks
 * Implements automated QA as per Pixel's manual checklist
 */
class EnhancedContentVerifier {
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger || new Logger();
    this.sourceAPI = new WordPressAPIClient(config.source, this.logger);
    this.destAPI = new WordPressAPIClient(config.destination, this.logger);
    this.snapshotDir = config.directories?.snapshots || './content-snapshots';
    this.resultsDir = config.directories?.results || './insertion-results';
    this.qaDir = config.directories?.qa_reports || './qa-reports';
    
    fs.ensureDirSync(this.qaDir);
  }

  /**
   * Main verification method for a single post
   */
  async verifyContent(resultPath) {
    const resultFileName = path.basename(resultPath);
    this.logger.info(`🔍 Verifying: ${resultFileName}`);
    
    try {
      const result = fs.readJsonSync(resultPath);
      
      // Load source snapshot
      const snapshotPath = this.findSnapshotPath(result.source_id);
      if (!snapshotPath) {
        throw new Error(`Source snapshot not found for ID ${result.source_id}`);
      }
      
      const snapshot = fs.readJsonSync(snapshotPath);
      
      // Fetch destination content (with rendered HTML)
      const destPost = await this.fetchDestinationPost(result.destination_id);
      
      // Initialize QA report
      const qaReport = {
        source_id: result.source_id,
        destination_id: result.destination_id,
        source_url: this.buildSourceURL(snapshot),
        destination_url: destPost.link,
        title: snapshot.title || 'Untitled',
        checks: {},
        overall_score: 0,
        passed: true,
        errors: [],
        warnings: [],
        verified_at: new Date().toISOString()
      };
      
      // Run all QA checks in sequence
      this.logger.info(`  Running comprehensive QA checks...`);
      
      // 1. Content Verification (character for character)
      qaReport.checks.content_fidelity = await this.checkContentFidelity(snapshot, destPost);
      
      // 2. Image Verification (count + all images present)
      qaReport.checks.images = await this.checkImages(snapshot, destPost);
      
      // 3. URL Structure (slug preservation)
      qaReport.checks.url_structure = this.checkURLStructure(snapshot, destPost);
      
      // 4. Featured Images (displaying correctly + HTTP 200)
      qaReport.checks.featured_image = await this.checkFeaturedImage(snapshot, destPost);
      
      // 5. SEO Heading Structure (H1-H6 hierarchy + text content)
      qaReport.checks.heading_structure = this.checkHeadingStructure(snapshot, destPost);
      
      // 6. Word Count (accuracy percentage)
      qaReport.checks.word_count = this.checkWordCount(snapshot, destPost);
      
      // 7. Links preservation
      qaReport.checks.links = this.checkLinks(snapshot, destPost);
      
      // 8. Meta data preservation (date, author, status)
      qaReport.checks.meta_data = this.checkMetaData(snapshot, destPost);
      
      // 9. Taxonomies (categories, tags)
      qaReport.checks.taxonomies = await this.checkTaxonomies(snapshot, destPost);
      
      // Calculate overall score and pass/fail
      this.calculateOverallScore(qaReport);
      
      // Save individual QA report
      const qaPath = path.join(this.qaDir, `qa-${result.destination_id}.json`);
      fs.writeJsonSync(qaPath, qaReport, { spaces: 2 });
      
      // Log result
      if (qaReport.passed) {
        this.logger.success(`  ✅ PASSED: "${qaReport.title}" (${qaReport.overall_score}% score)`);
      } else {
        this.logger.warn(`  ⚠️  FAILED: "${qaReport.title}" (${qaReport.overall_score}% score) - ${qaReport.errors.length} errors`);
      }
      
      return { success: true, qaReport, qaPath };
    } catch (error) {
      this.logger.error(`  ❌ Verification failed: ${error.message}`);
      return { 
        success: false, 
        resultPath, 
        error: error.message,
        stack: error.stack 
      };
    }
  }

  /**
   * 1. Content Fidelity Check - Character-for-character comparison
   */
  checkContentFidelity(snapshot, destPost) {
    const sourceContent = this.normalizeContent(snapshot.html_body || snapshot.content || '');
    const destContent = this.normalizeContent(destPost.content?.rendered || '');
    
    const sourceLength = sourceContent.length;
    const destLength = destContent.length;
    
    // Calculate character-level similarity
    const matchPercentage = this.calculateSimilarity(sourceContent, destContent);
    const passed = matchPercentage >= 98; // 98% threshold for character match
    
    return {
      passed,
      score: matchPercentage,
      source_characters: sourceLength,
      dest_characters: destLength,
      difference: Math.abs(sourceLength - destLength),
      match_percentage: matchPercentage.toFixed(2) + '%',
      message: passed 
        ? `Content matches ${matchPercentage.toFixed(2)}% (character-level)`
        : `Content mismatch: only ${matchPercentage.toFixed(2)}% match`
    };
  }

  /**
   * 2. Image Verification - All images present
   */
  async checkImages(snapshot, destPost) {
    const sourceImages = this.extractImages(snapshot.html_body || snapshot.content || '');
    const destImages = this.extractImages(destPost.content?.rendered || '');
    
    const sourceCount = sourceImages.length;
    const destCount = destImages.length;
    
    // Check if all images are present
    const missingImages = [];
    for (const srcImg of sourceImages) {
      const found = destImages.some(destImg => 
        destImg.alt === srcImg.alt || destImg.src.includes(path.basename(srcImg.src))
      );
      if (!found) {
        missingImages.push(srcImg.alt || srcImg.src);
      }
    }
    
    const passed = sourceCount === destCount && missingImages.length === 0;
    
    return {
      passed,
      score: sourceCount > 0 ? ((destCount / sourceCount) * 100) : 100,
      source_count: sourceCount,
      dest_count: destCount,
      missing_images: missingImages,
      message: passed
        ? `All ${sourceCount} images present`
        : `Image mismatch: ${sourceCount} source vs ${destCount} destination (${missingImages.length} missing)`
    };
  }

  /**
   * 3. URL Structure Check - Slug preservation
   */
  checkURLStructure(snapshot, destPost) {
    const sourceSlug = snapshot.slug || '';
    const destSlug = destPost.slug || '';
    
    // Check permalink structure
    const sourcePermalink = snapshot.link || '';
    const destPermalink = destPost.link || '';
    
    const slugMatch = sourceSlug === destSlug;
    const structureMatch = this.comparePermalinkStructure(sourcePermalink, destPermalink);
    
    const passed = slugMatch && structureMatch;
    
    return {
      passed,
      score: passed ? 100 : (slugMatch ? 50 : 0),
      source_slug: sourceSlug,
      dest_slug: destSlug,
      slug_match: slugMatch,
      structure_match: structureMatch,
      message: passed
        ? 'URL structure preserved'
        : `URL mismatch: ${sourceSlug} vs ${destSlug}`
    };
  }

  /**
   * 4. Featured Image Check - Displaying correctly + HTTP 200
   */
  async checkFeaturedImage(snapshot, destPost) {
    const sourceFeaturedMediaId = snapshot.featured_media;
    const destFeaturedMediaId = destPost.featured_media;
    
    if (!sourceFeaturedMediaId || sourceFeaturedMediaId === 0) {
      return {
        passed: true,
        score: 100,
        message: 'No featured image on source (correctly matched)'
      };
    }
    
    if (!destFeaturedMediaId || destFeaturedMediaId === 0) {
      return {
        passed: false,
        score: 0,
        message: 'Featured image missing on destination'
      };
    }
    
    // Fetch destination featured image details
    try {
      const mediaEndpoint = this.config.destination.rest_endpoint + `/media/${destFeaturedMediaId}`;
      const mediaDetails = await this.destAPI.get(mediaEndpoint);
      
      // Check if image URL returns HTTP 200
      const imageUrl = mediaDetails.source_url;
      let httpStatus = null;
      let httpOk = false;
      
      try {
        const response = await axios.head(imageUrl, { 
          timeout: 5000,
          maxRedirects: 5
        });
        httpStatus = response.status;
        httpOk = response.status === 200;
      } catch (httpError) {
        httpStatus = httpError.response?.status || 'error';
        httpOk = false;
      }
      
      // Check if wp-post-image class exists in rendered HTML
      const $ = cheerio.load(destPost.content?.rendered || '');
      const hasWpPostImageClass = $('.wp-post-image').length > 0 || 
                                   $('img[class*="wp-post-image"]').length > 0;
      
      const passed = httpOk && destFeaturedMediaId > 0;
      
      return {
        passed,
        score: passed ? 100 : 0,
        source_featured_media_id: sourceFeaturedMediaId,
        dest_featured_media_id: destFeaturedMediaId,
        image_url: imageUrl,
        http_status: httpStatus,
        http_ok: httpOk,
        wp_post_image_class: hasWpPostImageClass,
        message: passed
          ? `Featured image displaying correctly (HTTP ${httpStatus})`
          : `Featured image issue: HTTP ${httpStatus}`
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: `Failed to verify featured image: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * 5. SEO Heading Structure - H1-H6 hierarchy + text content
   */
  checkHeadingStructure(snapshot, destPost) {
    const sourceHeadings = this.extractHeadings(snapshot.html_body || snapshot.content || '');
    const destHeadings = this.extractHeadings(destPost.content?.rendered || '');
    
    // Compare heading counts by level
    const sourceLevels = sourceHeadings.map(h => h.level);
    const destLevels = destHeadings.map(h => h.level);
    
    const hierarchyMatch = JSON.stringify(sourceLevels) === JSON.stringify(destLevels);
    
    // Compare heading text content
    const textMatches = [];
    const textMismatches = [];
    
    for (let i = 0; i < Math.min(sourceHeadings.length, destHeadings.length); i++) {
      const sourceH = sourceHeadings[i];
      const destH = destHeadings[i];
      
      if (sourceH.level === destH.level) {
        const sourceText = this.normalizeText(sourceH.text);
        const destText = this.normalizeText(destH.text);
        
        if (sourceText === destText) {
          textMatches.push({ level: sourceH.level, text: sourceH.text });
        } else {
          textMismatches.push({
            level: sourceH.level,
            source: sourceH.text,
            dest: destH.text
          });
        }
      }
    }
    
    const passed = hierarchyMatch && textMismatches.length === 0;
    const score = sourceHeadings.length > 0 
      ? ((textMatches.length / sourceHeadings.length) * 100)
      : 100;
    
    return {
      passed,
      score,
      source_headings: sourceHeadings,
      dest_headings: destHeadings,
      hierarchy_match: hierarchyMatch,
      text_matches: textMatches.length,
      text_mismatches: textMismatches,
      message: passed
        ? `All ${sourceHeadings.length} headings match (hierarchy + content)`
        : `Heading mismatch: ${textMismatches.length} differences found`
    };
  }

  /**
   * 6. Word Count Check
   */
  checkWordCount(snapshot, destPost) {
    const sourceWords = this.countWords(snapshot.html_body || snapshot.content || '');
    const destWords = this.countWords(destPost.content?.rendered || '');
    
    const difference = Math.abs(sourceWords - destWords);
    const accuracy = sourceWords > 0 
      ? ((Math.min(sourceWords, destWords) / Math.max(sourceWords, destWords)) * 100)
      : 100;
    
    const passed = accuracy >= 98; // 98% threshold
    
    return {
      passed,
      score: accuracy,
      source_words: sourceWords,
      dest_words: destWords,
      difference,
      accuracy_percentage: accuracy.toFixed(2) + '%',
      message: passed
        ? `Word count matches: ${sourceWords} words (${accuracy.toFixed(2)}% accuracy)`
        : `Word count mismatch: ${sourceWords} source vs ${destWords} destination`
    };
  }

  /**
   * 7. Links Preservation
   */
  checkLinks(snapshot, destPost) {
    const sourceLinks = this.extractLinks(snapshot.html_body || snapshot.content || '');
    const destLinks = this.extractLinks(destPost.content?.rendered || '');
    
    const sourceCount = sourceLinks.length;
    const destCount = destLinks.length;
    
    const passed = sourceCount === destCount;
    const score = sourceCount > 0 ? ((Math.min(sourceCount, destCount) / sourceCount) * 100) : 100;
    
    return {
      passed,
      score,
      source_count: sourceCount,
      dest_count: destCount,
      message: passed
        ? `All ${sourceCount} links preserved`
        : `Link count mismatch: ${sourceCount} vs ${destCount}`
    };
  }

  /**
   * 8. Meta Data Check (date, status, etc.)
   */
  checkMetaData(snapshot, destPost) {
    const checks = {
      date: this.compareDates(snapshot.date, destPost.date),
      status: snapshot.status === destPost.status,
      type: snapshot.type === destPost.type
    };
    
    const passed = Object.values(checks).every(check => check === true || check?.match === true);
    const score = (Object.values(checks).filter(c => c === true || c?.match === true).length / Object.keys(checks).length) * 100;
    
    return {
      passed,
      score,
      checks,
      message: passed
        ? 'All meta data preserved'
        : 'Some meta data mismatches detected'
    };
  }

  /**
   * 9. Taxonomies Check (categories, tags)
   */
  async checkTaxonomies(snapshot, destPost) {
    try {
      const sourceCategories = snapshot.categories || [];
      const destCategories = destPost.categories || [];
      
      const sourceTags = snapshot.tags || [];
      const destTags = destPost.tags || [];
      
      const categoryMatch = sourceCategories.length === destCategories.length;
      const tagMatch = sourceTags.length === destTags.length;
      
      const passed = categoryMatch && tagMatch;
      const score = passed ? 100 : 50;
      
      return {
        passed,
        score,
        source_categories: sourceCategories.length,
        dest_categories: destCategories.length,
        source_tags: sourceTags.length,
        dest_tags: destTags.length,
        category_match: categoryMatch,
        tag_match: tagMatch,
        message: passed
          ? 'All taxonomies preserved'
          : `Taxonomy mismatch: categories ${sourceCategories.length} vs ${destCategories.length}, tags ${sourceTags.length} vs ${destTags.length}`
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: `Taxonomy check failed: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Calculate overall score and determine pass/fail
   */
  calculateOverallScore(qaReport) {
    const checks = qaReport.checks;
    const scores = [];
    const errors = [];
    const warnings = [];
    
    // Weighted scoring (some checks are more critical than others)
    const weights = {
      content_fidelity: 0.25,    // 25% - most important
      word_count: 0.15,          // 15%
      heading_structure: 0.15,   // 15%
      images: 0.15,              // 15%
      featured_image: 0.10,      // 10%
      url_structure: 0.10,       // 10%
      links: 0.05,               // 5%
      meta_data: 0.03,           // 3%
      taxonomies: 0.02           // 2%
    };
    
    let totalScore = 0;
    
    for (const [checkName, checkResult] of Object.entries(checks)) {
      const weight = weights[checkName] || 0;
      const score = checkResult.score || (checkResult.passed ? 100 : 0);
      
      totalScore += score * weight;
      
      if (!checkResult.passed) {
        errors.push({
          check: checkName,
          message: checkResult.message || 'Check failed',
          details: checkResult
        });
      }
      
      if (checkResult.warning) {
        warnings.push({
          check: checkName,
          message: checkResult.warning
        });
      }
    }
    
    qaReport.overall_score = Math.round(totalScore);
    qaReport.passed = qaReport.overall_score >= 90; // 90% threshold for overall pass
    qaReport.errors = errors;
    qaReport.warnings = warnings;
  }

  /**
   * Verify all inserted content
   */
  async verifyAll() {
    this.logger.info('🔍 Starting comprehensive QA verification...');
    this.logger.info('');
    
    // Find all insertion result files
    const resultFiles = fs.readdirSync(this.resultsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(this.resultsDir, f));
    
    if (resultFiles.length === 0) {
      this.logger.warn('No insertion results found to verify');
      return [];
    }
    
    this.logger.info(`Found ${resultFiles.length} items to verify`);
    this.logger.info('');
    
    // Process all items
    const allResults = [];
    let passedCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < resultFiles.length; i++) {
      const resultPath = resultFiles[i];
      this.logger.info(`[${i + 1}/${resultFiles.length}] Verifying...`);
      
      const result = await this.verifyContent(resultPath);
      allResults.push(result);
      
      if (result.success && result.qaReport?.passed) {
        passedCount++;
      } else if (result.success) {
        failedCount++;
      }
      
      this.logger.info('');
    }
    
    // Generate summary report
    const summary = this.generateSummaryReport(allResults);
    
    this.logger.success('');
    this.logger.success('═══════════════════════════════════════');
    this.logger.success('  QA VERIFICATION COMPLETE');
    this.logger.success('═══════════════════════════════════════');
    this.logger.success(`  Total Items: ${resultFiles.length}`);
    this.logger.success(`  ✅ Passed: ${passedCount} (${((passedCount/resultFiles.length)*100).toFixed(1)}%)`);
    this.logger.success(`  ⚠️  Failed: ${failedCount} (${((failedCount/resultFiles.length)*100).toFixed(1)}%)`);
    this.logger.success(`  Average Score: ${summary.average_score.toFixed(1)}%`);
    this.logger.success('═══════════════════════════════════════');
    this.logger.success('');
    
    return allResults;
  }

  /**
   * Generate summary report with HTML output
   */
  generateSummaryReport(results) {
    const summary = {
      total: results.length,
      verified: results.filter(r => r.success).length,
      passed: results.filter(r => r.success && r.qaReport?.passed).length,
      failed: results.filter(r => r.success && !r.qaReport?.passed).length,
      average_score: 0,
      items: [],
      generated_at: new Date().toISOString()
    };
    
    let totalScore = 0;
    
    for (const result of results) {
      if (result.success && result.qaReport) {
        const item = {
          title: result.qaReport.title,
          source_id: result.qaReport.source_id,
          destination_id: result.qaReport.destination_id,
          destination_url: result.qaReport.destination_url,
          overall_score: result.qaReport.overall_score,
          passed: result.qaReport.passed,
          errors: result.qaReport.errors,
          checks: result.qaReport.checks
        };
        
        summary.items.push(item);
        totalScore += result.qaReport.overall_score;
      }
    }
    
    summary.average_score = summary.verified > 0 ? totalScore / summary.verified : 0;
    
    // Save JSON summary
    const summaryPath = path.join(this.qaDir, 'qa-summary.json');
    fs.writeJsonSync(summaryPath, summary, { spaces: 2 });
    
    // Generate HTML report
    this.generateHTMLReport(summary);
    
    this.logger.info(`✅ Summary report saved: ${summaryPath}`);
    
    return summary;
  }

  /**
   * Generate beautiful HTML report for display on status page
   */
  generateHTMLReport(summary) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QA Report - Migration Verification</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      padding: 24px;
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      background: white;
      padding: 32px;
      border-radius: 12px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header h1 { color: #2c3e50; margin-bottom: 8px; }
    .header .subtitle { color: #7f8c8d; font-size: 14px; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin: 24px 0;
    }
    .summary-card {
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
    }
    .summary-card .number {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .summary-card .label {
      color: #7f8c8d;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .summary-card.success .number { color: #27ae60; }
    .summary-card.warning .number { color: #f39c12; }
    .summary-card.info .number { color: #3498db; }
    .items-table {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: #34495e;
      color: white;
      padding: 16px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 16px;
      border-bottom: 1px solid #ecf0f1;
    }
    tr:hover { background: #f8f9fa; }
    .score {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 14px;
    }
    .score.high { background: #d5f4e6; color: #27ae60; }
    .score.medium { background: #fef5e7; color: #f39c12; }
    .score.low { background: #fadbd8; color: #e74c3c; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge.pass { background: #d5f4e6; color: #27ae60; }
    .badge.fail { background: #fadbd8; color: #e74c3c; }
    .checks-summary {
      font-size: 13px;
      color: #7f8c8d;
      margin-top: 4px;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      color: #7f8c8d;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ QA Verification Report</h1>
      <p class="subtitle">Generated ${new Date(summary.generated_at).toLocaleString()}</p>
    </div>

    <div class="summary-grid">
      <div class="summary-card info">
        <div class="number">${summary.total}</div>
        <div class="label">Total Items</div>
      </div>
      <div class="summary-card success">
        <div class="number">${summary.passed}</div>
        <div class="label">Passed QA</div>
      </div>
      <div class="summary-card warning">
        <div class="number">${summary.failed}</div>
        <div class="label">Failed QA</div>
      </div>
      <div class="summary-card info">
        <div class="number">${summary.average_score.toFixed(1)}%</div>
        <div class="label">Avg Score</div>
      </div>
    </div>

    <div class="items-table">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Score</th>
            <th>Status</th>
            <th>Key Checks</th>
            <th>Destination</th>
          </tr>
        </thead>
        <tbody>
          ${summary.items.map(item => {
            const scoreClass = item.overall_score >= 90 ? 'high' : item.overall_score >= 70 ? 'medium' : 'low';
            const badgeClass = item.passed ? 'pass' : 'fail';
            const badgeText = item.passed ? '✓ Passed' : '✗ Failed';
            
            // Summarize key check results
            const checks = item.checks || {};
            const checkSummary = Object.entries(checks)
              .filter(([_, v]) => !v.passed)
              .map(([k, _]) => k.replace(/_/g, ' '))
              .slice(0, 2)
              .join(', ') || 'All checks passed';
            
            return `
              <tr>
                <td><strong>${item.title}</strong></td>
                <td><span class="score ${scoreClass}">${item.overall_score}%</span></td>
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td><div class="checks-summary">${checkSummary}</div></td>
                <td><a href="${item.destination_url}" target="_blank">View Post</a></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <p>Automated QA Report • WordPress Data Entry Form</p>
    </div>
  </div>
</body>
</html>
    `;
    
    const htmlPath = path.join(this.qaDir, 'qa-report.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    
    this.logger.info(`✅ HTML report generated: ${htmlPath}`);
  }

  // ========================
  // HELPER METHODS
  // ========================

  findSnapshotPath(sourceId) {
    const files = fs.readdirSync(this.snapshotDir);
    
    // Try exact match first
    let match = files.find(f => f === `${sourceId}.json`);
    if (match) return path.join(this.snapshotDir, match);
    
    // Try with content type prefix
    match = files.find(f => f.includes(`-${sourceId}.json`));
    if (match) return path.join(this.snapshotDir, match);
    
    return null;
  }

  async fetchDestinationPost(destId) {
    const endpoint = this.config.destination.rest_endpoint + `/posts/${destId}`;
    return await this.destAPI.get(endpoint, { context: 'edit' });
  }

  buildSourceURL(snapshot) {
    return snapshot.link || this.config.source.url + '/' + (snapshot.slug || '');
  }

  normalizeContent(html) {
    // Strip HTML tags, normalize whitespace
    const $ = cheerio.load(html);
    return $('body').text()
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  normalizeText(text) {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  calculateSimilarity(str1, str2) {
    if (str1 === str2) return 100;
    if (str1.length === 0 && str2.length === 0) return 100;
    if (str1.length === 0 || str2.length === 0) return 0;
    
    // Simple character-level comparison
    const maxLength = Math.max(str1.length, str2.length);
    let matches = 0;
    
    for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
      if (str1[i] === str2[i]) matches++;
    }
    
    return (matches / maxLength) * 100;
  }

  extractImages(html) {
    const $ = cheerio.load(html);
    const images = [];
    
    $('img').each((i, elem) => {
      images.push({
        src: $(elem).attr('src') || '',
        alt: $(elem).attr('alt') || '',
        class: $(elem).attr('class') || ''
      });
    });
    
    return images;
  }

  extractHeadings(html) {
    const $ = cheerio.load(html);
    const headings = [];
    
    $('h1, h2, h3, h4, h5, h6').each((i, elem) => {
      headings.push({
        level: elem.name,
        text: $(elem).text().trim()
      });
    });
    
    return headings;
  }

  extractLinks(html) {
    const $ = cheerio.load(html);
    const links = [];
    
    $('a').each((i, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        links.push({
          href,
          text: $(elem).text().trim()
        });
      }
    });
    
    return links;
  }

  countWords(html) {
    const text = this.normalizeContent(html);
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  comparePermalinkStructure(url1, url2) {
    // Extract path structure (ignore domain)
    const getPath = (url) => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    };
    
    const path1 = getPath(url1);
    const path2 = getPath(url2);
    
    // Compare depth and structure
    const depth1 = path1.split('/').filter(p => p).length;
    const depth2 = path2.split('/').filter(p => p).length;
    
    return depth1 === depth2;
  }

  compareDates(date1, date2) {
    try {
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      return { match: Math.abs(d1 - d2) < 1000 }; // Within 1 second
    } catch {
      return { match: false };
    }
  }
}

module.exports = EnhancedContentVerifier;
