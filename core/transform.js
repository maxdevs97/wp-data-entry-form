const fs = require('fs-extra');
const path = require('path');
const Logger = require('../utils/logger');

class ContentTransformer {
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger || new Logger();
    this.snapshotDir = './content-snapshots';
    this.transformedDir = './transformed-content';
    
    fs.ensureDirSync(this.transformedDir);
  }

  async transformContent(snapshotPath) {
    this.logger.info(`Transforming: ${path.basename(snapshotPath)}`);
    
    try {
      const snapshot = fs.readJsonSync(snapshotPath);
      
      // Apply transformations
      const transformed = {
        source_id: snapshot.source_id,
        content_type: snapshot.content_type,
        title: snapshot.title,
        slug: this.transformSlug(snapshot.slug),
        status: this.config.migration_settings.insert_as_draft ? 'draft' : snapshot.status,
        date: this.parseDate(snapshot.date),                    // NEW: Preserve publication date with validation
        date_gmt: this.parseDate(snapshot.date_gmt || snapshot.date),  // NEW: Preserve GMT date with validation
        modified: this.parseDate(snapshot.modified),            // NEW: Preserve modified date with validation
        modified_gmt: this.parseDate(snapshot.modified_gmt || snapshot.modified),  // NEW: Preserve GMT modified with validation
        content: this.transformHTML(snapshot.html_body),
        excerpt: snapshot.excerpt,
        taxonomies: snapshot.taxonomies || {},  // NEW: Pass through full taxonomy data
        categories: await this.transformTaxonomies(snapshot.categories, 'category'),
        tags: await this.transformTaxonomies(snapshot.tags, 'post_tag'),
        meta: this.transformMeta(snapshot.meta),
        acf: this.transformACF(snapshot.acf),
        featured_image: snapshot.featured_image,
        images: snapshot.images,
        yoast_meta: snapshot.yoast_meta,
        original_url: snapshot.slug,
        transformed_at: new Date().toISOString()
      };
      
      // Save transformed content
      const filename = path.basename(snapshotPath);
      const transformedPath = path.join(this.transformedDir, filename);
      fs.writeJsonSync(transformedPath, transformed, { spaces: 2 });
      
      this.logger.success(`Transformed: ${transformed.title}`);
      
      return { transformed, transformedPath };
    } catch (error) {
      this.logger.error(`Failed to transform: ${snapshotPath}`, {
        error: error.message
      });
      throw error;
    }
  }

  transformSlug(slug) {
    // Apply any slug transformations
    // Could add prefix/suffix, sanitization, etc.
    return slug;
  }

  parseDate(dateInput) {
    // Handle missing or invalid dates
    if (!dateInput) {
      return new Date().toISOString();
    }
    
    // Try to parse the date
    const parsed = new Date(dateInput);
    
    // Check if valid
    if (isNaN(parsed.getTime())) {
      this.logger.warn(`Invalid date encountered: ${dateInput}, using current date`);
      return new Date().toISOString();
    }
    
    // Return ISO string
    return parsed.toISOString();
  }

  transformHTML(html) {
    if (!html) return '';
    
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    
    // Apply URL rewriting
    const urlRewriting = this.config.url_rewriting || {};
    
    if (urlRewriting.find && urlRewriting.replace) {
      // Rewrite internal links
      $('a').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href && href.includes(urlRewriting.find)) {
          $(elem).attr('href', href.replace(urlRewriting.find, urlRewriting.replace));
        }
      });
      
      // Rewrite image URLs (will be replaced with uploaded URLs later)
      $('img').each((i, elem) => {
        const src = $(elem).attr('src');
        if (src && src.includes(urlRewriting.find)) {
          // Mark for replacement after media upload
          $(elem).attr('data-original-src', src);
        }
      });
    }
    
    // Handle shortcodes if needed
    // Could convert [old_shortcode] to [new_shortcode]
    
    return $.html();
  }

  async transformTaxonomies(termIds, taxonomy) {
    // In a real implementation, you would:
    // 1. Fetch term details from source
    // 2. Map to destination taxonomy
    // 3. Create terms if they don't exist on destination
    // For now, just pass through
    return termIds;
  }

  transformMeta(meta) {
    if (!meta) return {};
    
    const transformed = { ...meta };
    
    // Apply any meta field transformations
    // e.g., rename fields, convert data types, etc.
    
    return transformed;
  }

  transformACF(acf) {
    if (!acf) return {};
    
    const mapping = this.config.field_mapping?.acf || {};
    const transformed = {};
    
    // Apply field name mapping
    for (const [sourceField, value] of Object.entries(acf)) {
      const destField = mapping[sourceField] || sourceField;
      transformed[destField] = value;
    }
    
    return transformed;
  }

  async transformBatch(snapshotPaths) {
    this.logger.info(`Transforming batch of ${snapshotPaths.length} items...`);
    
    const results = [];
    for (const snapshotPath of snapshotPaths) {
      try {
        const result = await this.transformContent(snapshotPath);
        results.push({ success: true, snapshotPath, ...result });
      } catch (error) {
        results.push({ success: false, snapshotPath, error: error.message });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    this.logger.info(`Batch complete: ${successCount}/${snapshotPaths.length} successful`);
    
    return results;
  }

  async transformAll() {
    this.logger.info('Starting transformation of all extracted content...');
    
    // Find all snapshot files
    const snapshotFiles = fs.readdirSync(this.snapshotDir)
      .filter(f => f.endsWith('.json') && !f.includes('manifest'))
      .map(f => path.join(this.snapshotDir, f));
    
    if (snapshotFiles.length === 0) {
      this.logger.warn('No snapshots found to transform');
      return [];
    }
    
    this.logger.info(`Found ${snapshotFiles.length} snapshots to transform`);
    
    // Process in batches
    const batchSize = this.config.migration_settings.batch_size || 10;
    const allResults = [];
    
    for (let i = 0; i < snapshotFiles.length; i += batchSize) {
      const batch = snapshotFiles.slice(i, i + batchSize);
      const results = await this.transformBatch(batch);
      allResults.push(...results);
      
      this.logger.info(`Progress: ${Math.min(i + batchSize, snapshotFiles.length)}/${snapshotFiles.length}`);
    }
    
    const successCount = allResults.filter(r => r.success).length;
    this.logger.success(`Transformation complete: ${successCount}/${allResults.length} items transformed`);
    
    return allResults;
  }
}

// CLI support
if (require.main === module) {
  const configPath = process.argv[2] || './config/migration-config.json';
  
  if (!fs.existsSync(configPath)) {
    console.error('Config file not found:', configPath);
    console.error('Usage: node transform.js [config-file.json]');
    process.exit(1);
  }
  
  const config = fs.readJsonSync(configPath);
  const transformer = new ContentTransformer(config);
  
  transformer.transformAll()
    .then(() => {
      console.log('✅ Transformation complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Transformation failed:', error.message);
      process.exit(1);
    });
}

module.exports = ContentTransformer;
