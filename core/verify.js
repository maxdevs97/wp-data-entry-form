const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const Logger = require('../utils/logger');
const WordPressAPIClient = require('../utils/api-client');
const ContentHasher = require('../utils/content-hasher');

class ContentVerifier {
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger || new Logger();
    this.sourceAPI = new WordPressAPIClient(config.source, this.logger);
    this.destAPI = new WordPressAPIClient(config.destination, this.logger);
    this.snapshotDir = './content-snapshots';
    this.resultsDir = './insertion-results';
    this.qaDir = './qa-reports';
    
    fs.ensureDirSync(this.qaDir);
  }

  async verifyContent(resultPath) {
    this.logger.info(`Verifying: ${path.basename(resultPath)}`);
    
    try {
      const result = fs.readJsonSync(resultPath);
      
      // Load source snapshot
      const snapshotPath = path.join(
        this.snapshotDir,
        `${result.source_id}.json`
      );
      
      let snapshot;
      if (fs.existsSync(snapshotPath)) {
        snapshot = fs.readJsonSync(snapshotPath);
      } else {
        // Try to find by content type prefix
        const files = fs.readdirSync(this.snapshotDir);
        const matchingFile = files.find(f => 
          f.includes(`-${result.source_id}.json`)
        );
        if (matchingFile) {
          snapshot = fs.readJsonSync(path.join(this.snapshotDir, matchingFile));
        } else {
          throw new Error(`Source snapshot not found for ID ${result.source_id}`);
        }
      }
      
      // Fetch destination content
      const destEndpoint = this.config.destination.rest_endpoint + 
        `/posts/${result.destination_id}`;
      const destPost = await this.destAPI.get(destEndpoint, { context: 'edit' });
      
      // Run all QA checks
      const qaReport = {
        source_id: result.source_id,
        destination_id: result.destination_id,
        source_url: snapshot.slug,
        destination_url: destPost.link,
        checks: {},
        passed: true,
        errors: [],
        warnings: [],
        verified_at: new Date().toISOString()
      };
      
      // Check 1: URL slug match
      qaReport.checks.url_slug_match = this.checkURLSlug(snapshot, destPost);
      
      // Check 2: Word count match
      qaReport.checks.word_count_match = this.checkWordCount(snapshot, destPost);
      
      // Check 3: Heading structure match
      qaReport.checks.heading_structure_match = this.checkHeadingStructure(snapshot, destPost);
      
      // Check 4: Image count match
      qaReport.checks.image_count_match = this.checkImageCount(snapshot, destPost);
      
      // Check 5: Link count match
      qaReport.checks.link_count_match = this.checkLinkCount(snapshot, destPost);
      
      // Check 6: Table structure match
      qaReport.checks.table_structure_match = this.checkTableStructure(snapshot, destPost);
      
      // Check 7: ACF fields match
      if (snapshot.acf && Object.keys(snapshot.acf).length > 0) {
        qaReport.checks.acf_fields_match = this.checkACFFields(snapshot, destPost);
      }
      
      // Check 8: Content hash match
      qaReport.checks.content_hash_match = this.checkContentHash(snapshot, destPost);
      
      // Check 9: Link validation (sample)
      qaReport.checks.link_validation = await this.validateLinks(destPost);
      
      // Check 10: Taxonomy match (NEW)
      qaReport.checks.taxonomy_match = await this.checkTaxonomies(snapshot, destPost);
      
      // Check 11: Publication date match (NEW)
      qaReport.checks.publication_date_match = this.checkPublicationDates(snapshot, destPost);
      
      // Aggregate results
      for (const [checkName, checkResult] of Object.entries(qaReport.checks)) {
        if (!checkResult.passed) {
          qaReport.passed = false;
          qaReport.errors.push({
            check: checkName,
            message: checkResult.message || 'Check failed',
            details: checkResult
          });
        }
        
        if (checkResult.warning) {
          qaReport.warnings.push({
            check: checkName,
            message: checkResult.warning
          });
        }
      }
      
      // Save QA report
      const qaPath = path.join(this.qaDir, `qa-${result.destination_id}.json`);
      fs.writeJsonSync(qaPath, qaReport, { spaces: 2 });
      
      if (qaReport.passed) {
        this.logger.success(`✅ Verification passed: "${snapshot.title}"`);
      } else {
        this.logger.warn(`⚠️  Verification failed: "${snapshot.title}"`);
        this.logger.warn(`  Errors: ${qaReport.errors.length}`);
      }
      
      return { qaReport, qaPath };
    } catch (error) {
      this.logger.error(`Failed to verify: ${resultPath}`, {
        error: error.message
      });
      throw error;
    }
  }

  checkURLSlug(snapshot, destPost) {
    const sourceSlug = snapshot.slug;
    const destSlug = destPost.slug;
    
    const passed = sourceSlug === destSlug;
    
    return {
      passed,
      source: sourceSlug,
      destination: destSlug,
      message: passed ? 'Slugs match' : `Slug mismatch: ${sourceSlug} vs ${destSlug}`
    };
  }

  checkWordCount(snapshot, destPost) {
    const tolerance = this.config.qa_thresholds?.word_count_tolerance || 0.05;
    
    const comparison = ContentHasher.compareWordCount(
      snapshot.html_body,
      destPost.content.rendered,
      tolerance
    );
    
    return {
      passed: comparison.match,
      source: comparison.sourceCount,
      destination: comparison.destinationCount,
      difference: comparison.difference,
      percentDifference: (comparison.percentDifference * 100).toFixed(2) + '%',
      message: comparison.match 
        ? 'Word counts match within tolerance'
        : `Word count mismatch: ${comparison.sourceCount} vs ${comparison.destinationCount}`
    };
  }

  checkHeadingStructure(snapshot, destPost) {
    const comparison = ContentHasher.compareHeadingStructure(
      snapshot.html_body,
      destPost.content.rendered
    );
    
    return {
      passed: comparison.match,
      source: comparison.sourceHeadings.map(h => h.level),
      destination: comparison.destinationHeadings.map(h => h.level),
      mismatches: comparison.mismatches,
      message: comparison.match
        ? 'Heading structures match'
        : comparison.message
    };
  }

  checkImageCount(snapshot, destPost) {
    const sourceCount = snapshot.images?.length || 0;
    const destImages = ContentHasher.extractImagesFromHTML 
      ? ContentHasher.extractImagesFromHTML(destPost.content.rendered)
      : [];
    const destCount = destImages.length;
    
    const passed = sourceCount === destCount;
    
    return {
      passed,
      source: sourceCount,
      destination: destCount,
      message: passed
        ? 'Image counts match'
        : `Image count mismatch: ${sourceCount} vs ${destCount}`
    };
  }

  checkLinkCount(snapshot, destPost) {
    const comparison = ContentHasher.compareLinks(
      snapshot.html_body,
      destPost.content.rendered
    );
    
    return {
      passed: comparison.match,
      source: comparison.sourceCount,
      destination: comparison.destinationCount,
      message: comparison.match
        ? 'Link counts match'
        : `Link count mismatch: ${comparison.sourceCount} vs ${comparison.destinationCount}`
    };
  }

  checkTableStructure(snapshot, destPost) {
    const comparison = ContentHasher.compareTables(
      snapshot.html_body,
      destPost.content.rendered
    );
    
    return {
      passed: comparison.match,
      source: comparison.sourceTables?.length || 0,
      destination: comparison.destinationTables?.length || 0,
      mismatches: comparison.mismatches,
      message: comparison.match
        ? 'Table structures match'
        : comparison.message
    };
  }

  checkACFFields(snapshot, destPost) {
    const sourceACF = snapshot.acf || {};
    const destACF = destPost.acf || {};
    
    const sourceKeys = Object.keys(sourceACF);
    const destKeys = Object.keys(destACF);
    
    // Apply field mapping
    const mapping = this.config.field_mapping?.acf || {};
    const mappedSourceKeys = sourceKeys.map(k => mapping[k] || k);
    
    const missingFields = mappedSourceKeys.filter(k => !destKeys.includes(k));
    const passed = missingFields.length === 0;
    
    return {
      passed,
      sourceFields: sourceKeys.length,
      destinationFields: destKeys.length,
      missingFields,
      message: passed
        ? 'All ACF fields present'
        : `Missing ACF fields: ${missingFields.join(', ')}`
    };
  }

  checkContentHash(snapshot, destPost) {
    const comparison = ContentHasher.compareContent(
      snapshot.html_body,
      destPost.content.rendered
    );
    
    return {
      passed: comparison.match,
      sourceHash: comparison.sourceHash.substring(0, 16) + '...',
      destinationHash: comparison.destinationHash.substring(0, 16) + '...',
      message: comparison.match
        ? 'Content hashes match'
        : 'Content hashes differ (text content may have changed)',
      warning: !comparison.match 
        ? 'Hash mismatch may indicate content differences'
        : null
    };
  }

  async validateLinks(destPost) {
    const links = ContentHasher.extractLinks(destPost.content.rendered);
    
    // Validate a sample of links (first 10)
    const samplesToTest = Math.min(10, links.length);
    const testLinks = links.slice(0, samplesToTest);
    
    const results = {
      total: links.length,
      tested: samplesToTest,
      valid: 0,
      broken: 0,
      details: []
    };
    
    for (const link of testLinks) {
      try {
        const timeout = this.config.qa_thresholds?.link_validation_timeout || 5000;
        const response = await axios.head(link.href, { 
          timeout,
          maxRedirects: 5
        });
        
        if (response.status >= 200 && response.status < 400) {
          results.valid++;
        } else {
          results.broken++;
          results.details.push({
            url: link.href,
            status: response.status,
            error: 'Non-success status'
          });
        }
      } catch (error) {
        // Skip relative URLs and internal links
        if (link.isInternal) {
          results.valid++;
        } else {
          results.broken++;
          results.details.push({
            url: link.href,
            error: error.message
          });
        }
      }
    }
    
    const passed = results.broken === 0;
    
    return {
      passed,
      ...results,
      message: passed
        ? `All tested links valid (${results.tested}/${results.total})`
        : `${results.broken} broken links found`
    };
  }

  async checkTaxonomies(snapshot, destPost) {
    try {
      const sourceTaxonomies = snapshot.taxonomies || {
        categories: [],
        tags: [],
        custom: {}
      };
      
      const destTaxonomies = {
        categories: [],
        tags: [],
        custom: {}
      };
      
      // Fetch destination categories
      if (destPost.categories && destPost.categories.length > 0) {
        for (const catId of destPost.categories) {
          try {
            const endpoint = this.config.destination.rest_endpoint + `/categories/${catId}`;
            const category = await this.destAPI.get(endpoint);
            destTaxonomies.categories.push({
              id: category.id,
              name: category.name,
              slug: category.slug
            });
          } catch (err) {
            this.logger.warn(`Failed to fetch destination category ${catId}`);
          }
        }
      }
      
      // Fetch destination tags
      if (destPost.tags && destPost.tags.length > 0) {
        for (const tagId of destPost.tags) {
          try {
            const endpoint = this.config.destination.rest_endpoint + `/tags/${tagId}`;
            const tag = await this.destAPI.get(endpoint);
            destTaxonomies.tags.push({
              id: tag.id,
              name: tag.name,
              slug: tag.slug
            });
          } catch (err) {
            this.logger.warn(`Failed to fetch destination tag ${tagId}`);
          }
        }
      }
      
      // Check if all source taxonomies exist on destination
      const missingCategories = [];
      const missingTags = [];
      const missingCustom = {};
      
      // Check categories
      for (const sourceCat of sourceTaxonomies.categories) {
        const found = destTaxonomies.categories.find(
          c => c.slug === sourceCat.slug || c.name === sourceCat.name
        );
        if (!found) {
          missingCategories.push(sourceCat.name);
        }
      }
      
      // Check tags
      for (const sourceTag of sourceTaxonomies.tags) {
        const found = destTaxonomies.tags.find(
          t => t.slug === sourceTag.slug || t.name === sourceTag.name
        );
        if (!found) {
          missingTags.push(sourceTag.name);
        }
      }
      
      // Check custom taxonomies
      for (const [taxonomy, terms] of Object.entries(sourceTaxonomies.custom || {})) {
        const destTerms = destPost[taxonomy] || [];
        if (terms.length !== destTerms.length) {
          missingCustom[taxonomy] = terms.length - destTerms.length;
        }
      }
      
      const passed = missingCategories.length === 0 && 
                    missingTags.length === 0 && 
                    Object.keys(missingCustom).length === 0;
      
      return {
        passed,
        sourceCategoriesCount: sourceTaxonomies.categories.length,
        destCategoriesCount: destTaxonomies.categories.length,
        sourceTagsCount: sourceTaxonomies.tags.length,
        destTagsCount: destTaxonomies.tags.length,
        missingCategories,
        missingTags,
        missingCustom,
        message: passed
          ? 'All taxonomies match'
          : `Missing taxonomies - Categories: ${missingCategories.length}, Tags: ${missingTags.length}`
      };
    } catch (error) {
      this.logger.error('Failed to check taxonomies', { error: error.message });
      return {
        passed: false,
        message: 'Failed to verify taxonomies: ' + error.message,
        error: error.message
      };
    }
  }

  checkPublicationDates(snapshot, destPost) {
    try {
      const sourceDate = snapshot.date;
      const sourceDateGMT = snapshot.date_gmt;
      const destDate = destPost.date;
      const destDateGMT = destPost.date_gmt;
      
      // Parse dates to compare
      const sourceDateObj = new Date(sourceDate);
      const destDateObj = new Date(destDate);
      const sourceDateGMTObj = new Date(sourceDateGMT || sourceDate);
      const destDateGMTObj = new Date(destDateGMT || destDate);
      
      // Check if dates match (down to the second)
      const dateMatches = Math.abs(sourceDateObj - destDateObj) < 1000;
      const dateGMTMatches = Math.abs(sourceDateGMTObj - destDateGMTObj) < 1000;
      
      const passed = dateMatches && dateGMTMatches;
      
      return {
        passed,
        sourceDate,
        destDate,
        sourceDateGMT: sourceDateGMT || sourceDate,
        destDateGMT: destDateGMT || destDate,
        dateMatch: dateMatches,
        dateGMTMatch: dateGMTMatches,
        message: passed
          ? 'Publication dates match exactly'
          : `Publication date mismatch - Date: ${sourceDate} vs ${destDate}`
      };
    } catch (error) {
      this.logger.error('Failed to check publication dates', { error: error.message });
      return {
        passed: false,
        message: 'Failed to verify publication dates: ' + error.message,
        error: error.message
      };
    }
  }

  async verifyBatch(resultPaths) {
    this.logger.info(`Verifying batch of ${resultPaths.length} items...`);
    
    const results = [];
    for (const resultPath of resultPaths) {
      try {
        const result = await this.verifyContent(resultPath);
        results.push({ success: true, resultPath, ...result });
      } catch (error) {
        results.push({ success: false, resultPath, error: error.message });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const passedCount = results.filter(r => r.success && r.qaReport?.passed).length;
    
    this.logger.info(`Batch complete: ${successCount}/${resultPaths.length} verified`);
    this.logger.info(`QA passed: ${passedCount}/${successCount}`);
    
    return results;
  }

  async verifyAll() {
    this.logger.info('Starting verification of all inserted content...');
    
    // Find all insertion result files
    const resultFiles = fs.readdirSync(this.resultsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(this.resultsDir, f));
    
    if (resultFiles.length === 0) {
      this.logger.warn('No insertion results found to verify');
      return [];
    }
    
    this.logger.info(`Found ${resultFiles.length} items to verify`);
    
    // Process in batches
    const batchSize = this.config.migration_settings.batch_size || 10;
    const allResults = [];
    
    for (let i = 0; i < resultFiles.length; i += batchSize) {
      const batch = resultFiles.slice(i, i + batchSize);
      const results = await this.verifyBatch(batch);
      allResults.push(...results);
      
      this.logger.info(`Progress: ${Math.min(i + batchSize, resultFiles.length)}/${resultFiles.length}`);
    }
    
    const successCount = allResults.filter(r => r.success).length;
    const passedCount = allResults.filter(r => r.success && r.qaReport?.passed).length;
    
    this.logger.success(`Verification complete: ${successCount}/${allResults.length} verified`);
    this.logger.success(`QA passed: ${passedCount}/${successCount}`);
    
    // Generate summary report
    this.generateSummaryReport(allResults);
    
    return allResults;
  }

  generateSummaryReport(results) {
    const summary = {
      total: results.length,
      verified: results.filter(r => r.success).length,
      passed: results.filter(r => r.success && r.qaReport?.passed).length,
      failed: results.filter(r => r.success && !r.qaReport?.passed).length,
      errors: [],
      warnings: [],
      generated_at: new Date().toISOString()
    };
    
    for (const result of results) {
      if (result.success && result.qaReport) {
        summary.errors.push(...(result.qaReport.errors || []));
        summary.warnings.push(...(result.qaReport.warnings || []));
      }
    }
    
    const summaryPath = path.join(this.qaDir, 'verification-summary.json');
    fs.writeJsonSync(summaryPath, summary, { spaces: 2 });
    
    this.logger.info(`Summary report saved: ${summaryPath}`);
  }
}

// CLI support
if (require.main === module) {
  const configPath = process.argv[2] || './config/migration-config.json';
  
  if (!fs.existsSync(configPath)) {
    console.error('Config file not found:', configPath);
    console.error('Usage: node verify.js [config-file.json]');
    process.exit(1);
  }
  
  const config = fs.readJsonSync(configPath);
  const verifier = new ContentVerifier(config);
  
  verifier.verifyAll()
    .then(() => {
      console.log('✅ Verification complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Verification failed:', error.message);
      process.exit(1);
    });
}

module.exports = ContentVerifier;
