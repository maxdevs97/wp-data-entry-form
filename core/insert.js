const fs = require('fs-extra');
const path = require('path');
const Logger = require('../utils/logger');
const WordPressAPIClient = require('../utils/api-client');
const MediaHandler = require('../utils/media-handler');

class ContentInserter {
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger || new Logger();
    this.destAPI = new WordPressAPIClient(config.destination, this.logger);
    this.mediaHandler = new MediaHandler(config, this.logger);
    this.transformedDir = './transformed-content';
    this.resultsDir = './insertion-results';
    
    // Cache for created taxonomy terms
    this.taxonomyCache = {
      categories: {},
      tags: {},
      custom: {}
    };
    
    fs.ensureDirSync(this.resultsDir);
  }

  async insertContent(transformedPath) {
    this.logger.info(`Inserting: ${path.basename(transformedPath)}`);
    
    try {
      const transformed = fs.readJsonSync(transformedPath);
      
      // Step 1: Ensure taxonomies exist (with creation authority)
      const taxonomyIds = await this.ensureTaxonomies(transformed.taxonomies);
      
      // Step 2: Upload featured image if exists
      let featuredMediaId = null;
      if (transformed.featured_image && transformed.featured_image.localPath) {
        try {
          const uploaded = await this.mediaHandler.uploadToWordPress(
            transformed.featured_image.localPath,
            this.destAPI,
            { alt: transformed.featured_image.alt }
          );
          featuredMediaId = uploaded.id;
          this.logger.info(`Uploaded featured image: ${uploaded.id}`);
        } catch (err) {
          this.logger.warn('Failed to upload featured image', { error: err.message });
        }
      }
      
      // Step 3: Upload inline images
      const imageUrlMap = {};
      if (transformed.images && transformed.images.length > 0) {
        this.logger.info(`Uploading ${transformed.images.length} inline images...`);
        
        for (const img of transformed.images) {
          if (img.localPath && fs.existsSync(img.localPath)) {
            try {
              const uploaded = await this.mediaHandler.uploadToWordPress(
                img.localPath,
                this.destAPI,
                { alt: img.alt }
              );
              imageUrlMap[img.src] = uploaded.url;
              this.logger.debug(`Uploaded image: ${img.src} -> ${uploaded.url}`);
            } catch (err) {
              this.logger.warn(`Failed to upload image: ${img.src}`, { error: err.message });
            }
          }
        }
      }
      
      // Step 4: Rewrite image URLs in content
      let finalContent = transformed.content;
      for (const [oldUrl, newUrl] of Object.entries(imageUrlMap)) {
        finalContent = finalContent.replace(new RegExp(oldUrl, 'g'), newUrl);
      }
      
      // Step 5: Create the post/page with taxonomies
      const postData = {
        title: transformed.title,
        content: finalContent,
        excerpt: transformed.excerpt,
        slug: transformed.slug,
        status: transformed.status,
        date: transformed.date,          // NEW: Preserve publication date
        date_gmt: transformed.date_gmt,  // NEW: Preserve GMT date
        categories: taxonomyIds.categories,
        tags: taxonomyIds.tags,
        meta: transformed.meta
      };
      
      // Add custom taxonomies to post data
      for (const [taxonomy, termIds] of Object.entries(taxonomyIds.custom || {})) {
        postData[taxonomy] = termIds;
      }
      
      if (featuredMediaId) {
        postData.featured_media = featuredMediaId;
      }
      
      const endpoint = this.config.destination.rest_endpoint + `/${transformed.content_type}s`;
      const createdPost = await this.destAPI.post(endpoint, postData);
      
      this.logger.success(`Created ${transformed.content_type} #${createdPost.id}: "${transformed.title}"`);
      
      // Step 6: Insert ACF fields if present
      if (transformed.acf && Object.keys(transformed.acf).length > 0) {
        try {
          await this.insertACFFields(createdPost.id, transformed.acf);
        } catch (err) {
          this.logger.warn('Failed to insert ACF fields', { error: err.message });
        }
      }
      
      // Step 7: Insert Yoast SEO meta if present
      if (transformed.yoast_meta) {
        try {
          await this.insertYoastMeta(createdPost.id, transformed.yoast_meta);
        } catch (err) {
          this.logger.warn('Failed to insert Yoast meta', { error: err.message });
        }
      }
      
      // Save insertion result
      const result = {
        source_id: transformed.source_id,
        destination_id: createdPost.id,
        destination_url: createdPost.link,
        title: transformed.title,
        slug: transformed.slug,
        status: createdPost.status,
        date: createdPost.date,              // NEW: Track publication date
        date_gmt: createdPost.date_gmt,      // NEW: Track GMT date
        featured_media_id: featuredMediaId,
        images_uploaded: Object.keys(imageUrlMap).length,
        image_url_map: imageUrlMap,
        taxonomy_ids: taxonomyIds,           // NEW: Track created taxonomy terms
        inserted_at: new Date().toISOString()
      };
      
      const filename = path.basename(transformedPath);
      const resultPath = path.join(this.resultsDir, filename);
      fs.writeJsonSync(resultPath, result, { spaces: 2 });
      
      this.logger.info(`Result saved: ${resultPath}`);
      
      return { result, resultPath };
    } catch (error) {
      this.logger.error(`Failed to insert: ${transformedPath}`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async ensureTaxonomies(taxonomies) {
    const result = {
      categories: [],
      tags: [],
      custom: {}
    };
    
    if (!taxonomies) {
      return result;
    }
    
    // Ensure categories exist
    if (taxonomies.categories && taxonomies.categories.length > 0) {
      this.logger.info(`Ensuring ${taxonomies.categories.length} categories exist...`);
      
      for (const category of taxonomies.categories) {
        const termId = await this.ensureTerm('categories', category);
        if (termId) {
          result.categories.push(termId);
        }
      }
    }
    
    // Ensure tags exist
    if (taxonomies.tags && taxonomies.tags.length > 0) {
      this.logger.info(`Ensuring ${taxonomies.tags.length} tags exist...`);
      
      for (const tag of taxonomies.tags) {
        const termId = await this.ensureTerm('tags', tag);
        if (termId) {
          result.tags.push(termId);
        }
      }
    }
    
    // Ensure custom taxonomies exist
    if (taxonomies.custom) {
      for (const [taxonomy, terms] of Object.entries(taxonomies.custom)) {
        if (terms && terms.length > 0) {
          this.logger.info(`Ensuring ${terms.length} ${taxonomy} terms exist...`);
          result.custom[taxonomy] = [];
          
          for (const term of terms) {
            const termId = await this.ensureTerm(taxonomy, term);
            if (termId) {
              result.custom[taxonomy].push(termId);
            }
          }
        }
      }
    }
    
    return result;
  }

  async ensureTerm(taxonomy, term) {
    const cacheKey = `${taxonomy}:${term.slug || term.name}`;
    
    // Check cache first
    if (this.taxonomyCache[taxonomy] && this.taxonomyCache[taxonomy][cacheKey]) {
      return this.taxonomyCache[taxonomy][cacheKey];
    }
    
    try {
      // Try to find existing term by slug
      const endpoint = this.config.destination.rest_endpoint + `/${taxonomy}`;
      const existingTerms = await this.destAPI.get(endpoint, {
        slug: term.slug || this.slugify(term.name),
        per_page: 1
      });
      
      if (existingTerms && existingTerms.length > 0) {
        const termId = existingTerms[0].id;
        
        // Cache it
        if (!this.taxonomyCache[taxonomy]) {
          this.taxonomyCache[taxonomy] = {};
        }
        this.taxonomyCache[taxonomy][cacheKey] = termId;
        
        this.logger.debug(`Found existing ${taxonomy} term: ${term.name} (ID: ${termId})`);
        return termId;
      }
      
      // Term doesn't exist - create it (CREATION AUTHORITY)
      this.logger.info(`Creating ${taxonomy} term: ${term.name}`);
      
      const newTermData = {
        name: term.name,
        slug: term.slug || this.slugify(term.name),
        description: term.description || ''
      };
      
      // Handle parent relationships
      if (term.parent && term.parent > 0) {
        // Try to find parent in cache or on destination
        const parentTerm = taxonomies[taxonomy]?.find(t => t.id === term.parent);
        if (parentTerm) {
          const parentId = await this.ensureTerm(taxonomy, parentTerm);
          if (parentId) {
            newTermData.parent = parentId;
          }
        }
      }
      
      const createdTerm = await this.destAPI.post(endpoint, newTermData);
      const termId = createdTerm.id;
      
      // Cache it
      if (!this.taxonomyCache[taxonomy]) {
        this.taxonomyCache[taxonomy] = {};
      }
      this.taxonomyCache[taxonomy][cacheKey] = termId;
      
      this.logger.success(`Created ${taxonomy} term: ${term.name} (ID: ${termId})`);
      return termId;
      
    } catch (error) {
      this.logger.error(`Failed to ensure ${taxonomy} term: ${term.name}`, {
        error: error.message
      });
      return null;
    }
  }

  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  async insertACFFields(postId, acfData) {
    // ACF fields can be inserted via REST API if ACF REST plugin is installed
    // Or via direct meta updates
    
    try {
      const endpoint = this.config.destination.rest_endpoint + `/posts/${postId}`;
      await this.destAPI.post(endpoint, {
        acf: acfData
      });
      this.logger.success(`Inserted ACF fields for post #${postId}`);
    } catch (error) {
      // Fallback: insert as regular meta fields
      for (const [key, value] of Object.entries(acfData)) {
        try {
          await this.destAPI.post(endpoint, {
            meta: { [key]: value }
          });
        } catch (err) {
          this.logger.warn(`Failed to insert ACF field: ${key}`, { error: err.message });
        }
      }
    }
  }

  async insertYoastMeta(postId, yoastData) {
    // Yoast SEO meta can be inserted via Yoast REST API endpoints
    // This is a simplified version
    
    const metaFields = {
      '_yoast_wpseo_title': yoastData.title,
      '_yoast_wpseo_metadesc': yoastData.description,
      '_yoast_wpseo_opengraph-title': yoastData.og_title,
      '_yoast_wpseo_opengraph-description': yoastData.og_description
    };
    
    const endpoint = this.config.destination.rest_endpoint + `/posts/${postId}`;
    
    try {
      await this.destAPI.post(endpoint, {
        meta: metaFields
      });
      this.logger.success(`Inserted Yoast meta for post #${postId}`);
    } catch (error) {
      this.logger.warn('Failed to insert Yoast meta', { error: error.message });
    }
  }

  async insertBatch(transformedPaths) {
    this.logger.info(`Inserting batch of ${transformedPaths.length} items...`);
    
    const results = [];
    for (const transformedPath of transformedPaths) {
      try {
        const result = await this.insertContent(transformedPath);
        results.push({ success: true, transformedPath, ...result });
      } catch (error) {
        results.push({ success: false, transformedPath, error: error.message });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    this.logger.info(`Batch complete: ${successCount}/${transformedPaths.length} successful`);
    
    return results;
  }

  async insertAll() {
    this.logger.info('Starting insertion of all transformed content...');
    
    // Find all transformed files
    const transformedFiles = fs.readdirSync(this.transformedDir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(this.transformedDir, f));
    
    if (transformedFiles.length === 0) {
      this.logger.warn('No transformed content found to insert');
      return [];
    }
    
    this.logger.info(`Found ${transformedFiles.length} items to insert`);
    
    // Process in batches
    const batchSize = this.config.migration_settings.batch_size || 10;
    const allResults = [];
    
    for (let i = 0; i < transformedFiles.length; i += batchSize) {
      const batch = transformedFiles.slice(i, i + batchSize);
      const results = await this.insertBatch(batch);
      allResults.push(...results);
      
      this.logger.info(`Progress: ${Math.min(i + batchSize, transformedFiles.length)}/${transformedFiles.length}`);
    }
    
    const successCount = allResults.filter(r => r.success).length;
    this.logger.success(`Insertion complete: ${successCount}/${allResults.length} items inserted`);
    
    return allResults;
  }
}

// CLI support
if (require.main === module) {
  const configPath = process.argv[2] || './config/migration-config.json';
  
  if (!fs.existsSync(configPath)) {
    console.error('Config file not found:', configPath);
    console.error('Usage: node insert.js [config-file.json]');
    process.exit(1);
  }
  
  const config = fs.readJsonSync(configPath);
  const inserter = new ContentInserter(config);
  
  inserter.insertAll()
    .then(() => {
      console.log('✅ Insertion complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Insertion failed:', error.message);
      process.exit(1);
    });
}

module.exports = ContentInserter;
