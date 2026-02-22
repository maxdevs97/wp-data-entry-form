const fs = require('fs-extra');
const path = require('path');
const Logger = require('../utils/logger');
const WordPressAPIClient = require('../utils/api-client');
const MediaHandler = require('../utils/media-handler');

/**
 * Timeout wrapper - prevents operations from hanging indefinitely
 */
function withTimeout(promise, timeoutMs, operationName) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms: ${operationName}`)), timeoutMs)
    )
  ]);
}

class ContentInserter {
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger || new Logger();
    this.destAPI = new WordPressAPIClient(config.destination, this.logger);
    this.mediaHandler = new MediaHandler(config, this.logger);
    this.transformedDir = config.directories?.transformed || './transformed-content';
    this.resultsDir = config.directories?.results || './insertion-results';
    
    // Cache for created taxonomy terms
    this.taxonomyCache = {
      categories: {},
      tags: {},
      custom: {}
    };
    
    fs.ensureDirSync(this.resultsDir);
  }

  async insertContent(transformedPath) {
    const startTime = Date.now();
    this.logger.info(`\n========================================`);
    this.logger.info(`[START] Inserting: ${path.basename(transformedPath)}`);
    this.logger.info(`========================================`);
    
    try {
      // STEP 0: Load transformed content
      this.logger.info(`[STEP 0] Loading transformed content...`);
      const transformed = fs.readJsonSync(transformedPath);
      this.logger.info(`[STEP 0] ✅ Loaded: ${transformed.title}`);
      this.logger.debug(`[STEP 0] Content type: ${transformed.content_type}`);
      this.logger.debug(`[STEP 0] Has featured image: ${!!transformed.featured_image}`);
      this.logger.debug(`[STEP 0] Inline images: ${transformed.images?.length || 0}`);
      
      // Step 1: Ensure taxonomies exist (with creation authority)
      this.logger.info(`\n[STEP 1] Processing taxonomies...`);
      const taxStart = Date.now();
      const taxonomyIds = await withTimeout(
        this.ensureTaxonomies(transformed.taxonomies),
        60000, // 60 second timeout for taxonomy operations
        'Taxonomy creation'
      );
      this.logger.info(`[STEP 1] ✅ Taxonomies processed in ${Date.now() - taxStart}ms`);
      this.logger.debug(`[STEP 1] Categories: ${taxonomyIds.categories.length}, Tags: ${taxonomyIds.tags.length}`);
      
      // Step 2: Upload featured image if exists
      this.logger.info(`\n[STEP 2] Processing featured image...`);
      let featuredMediaId = null;
      if (transformed.featured_image) {
        this.logger.info(`[STEP 2] Featured image detected for: ${transformed.title}`);
        this.logger.debug(`[STEP 2] Featured image data:`, {
          hasLocalPath: !!transformed.featured_image.localPath,
          localPath: transformed.featured_image.localPath,
          url: transformed.featured_image.url,
          alt: transformed.featured_image.alt
        });
        
        if (transformed.featured_image.localPath) {
          // Verify the file exists before attempting upload
          this.logger.info(`[STEP 2] Verifying file exists: ${transformed.featured_image.localPath}`);
          if (!fs.existsSync(transformed.featured_image.localPath)) {
            this.logger.error(`[STEP 2] ❌ Featured image file not found: ${transformed.featured_image.localPath}`);
            this.logger.warn(`[STEP 2] Featured image will NOT be set for this post`);
          } else {
            const fileSize = fs.statSync(transformed.featured_image.localPath).size;
            this.logger.info(`[STEP 2] File exists (${this.formatBytes(fileSize)}), starting upload...`);
            
            try {
              const uploadStart = Date.now();
              this.logger.info(`[STEP 2] ⏳ Uploading featured image...`);
              
              // CRITICAL FIX: Wrap upload in timeout with detailed logging
              const uploaded = await withTimeout(
                this.uploadFeaturedImageWithLogging(transformed.featured_image.localPath),
                90000, // 90 second timeout for image upload
                'Featured image upload'
              );
              
              featuredMediaId = uploaded.id;
              const uploadDuration = Date.now() - uploadStart;
              this.logger.success(`[STEP 2] ✅ Featured image uploaded in ${uploadDuration}ms: Media ID ${uploaded.id}`);
              this.logger.info(`[STEP 2] Upload URL: ${uploaded.url}`);
            } catch (err) {
              this.logger.error(`[STEP 2] ❌ Failed to upload featured image: ${err.message}`);
              this.logger.error(`[STEP 2] Error stack:`, err.stack);
              this.logger.warn(`[STEP 2] Continuing without featured image...`);
              // Continue without featured image rather than failing entire post
            }
          }
        } else {
          this.logger.warn(`[STEP 2] Featured image has no localPath - skipping upload`);
          this.logger.warn(`[STEP 2] This may indicate the image failed to download during extraction`);
        }
      } else {
        this.logger.info(`[STEP 2] No featured image found in transformed content`);
      }
      
      // Step 3: Upload inline images
      this.logger.info(`\n[STEP 3] Processing inline images...`);
      const imageUrlMap = {};
      if (transformed.images && transformed.images.length > 0) {
        this.logger.info(`[STEP 3] Found ${transformed.images.length} inline images to upload...`);
        
        for (let i = 0; i < transformed.images.length; i++) {
          const img = transformed.images[i];
          this.logger.info(`[STEP 3] Processing image ${i + 1}/${transformed.images.length}: ${img.src}`);
          
          if (img.localPath && fs.existsSync(img.localPath)) {
            try {
              this.logger.info(`[STEP 3] ⏳ Uploading inline image ${i + 1}...`);
              const uploaded = await withTimeout(
                this.mediaHandler.uploadToWordPress(img.localPath, this.destAPI, { alt: img.alt }),
                60000, // 60 second timeout per image
                `Inline image ${i + 1} upload`
              );
              imageUrlMap[img.src] = uploaded.url;
              this.logger.info(`[STEP 3] ✅ Uploaded: ${img.src} -> ${uploaded.url}`);
            } catch (err) {
              this.logger.warn(`[STEP 3] ⚠️ Failed to upload image: ${img.src}`, { error: err.message });
            }
          } else {
            this.logger.warn(`[STEP 3] ⚠️ Image file not found: ${img.localPath}`);
          }
        }
        
        this.logger.info(`[STEP 3] ✅ Inline images processed: ${Object.keys(imageUrlMap).length}/${transformed.images.length} successful`);
      } else {
        this.logger.info(`[STEP 3] No inline images to process`);
      }
      
      // Step 4: Rewrite image URLs in content
      this.logger.info(`\n[STEP 4] Rewriting image URLs in content...`);
      let finalContent = transformed.content;
      let rewriteCount = 0;
      for (const [oldUrl, newUrl] of Object.entries(imageUrlMap)) {
        const regex = new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const matches = (finalContent.match(regex) || []).length;
        if (matches > 0) {
          finalContent = finalContent.replace(regex, newUrl);
          rewriteCount += matches;
          this.logger.debug(`[STEP 4] Rewrote ${matches} occurrences: ${oldUrl.substring(0, 50)}...`);
        }
      }
      this.logger.info(`[STEP 4] ✅ Rewrote ${rewriteCount} image URLs`);
      
      // Step 5: Create the post/page with taxonomies
      this.logger.info(`\n[STEP 5] Creating post on destination site...`);
      const postData = {
        title: transformed.title,
        content: finalContent,
        excerpt: transformed.excerpt,
        slug: transformed.slug,
        status: transformed.status,
        date: transformed.date,
        date_gmt: transformed.date_gmt,
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
        this.logger.info(`[STEP 5] Including featured_media: ${featuredMediaId}`);
      }
      
      this.logger.debug(`[STEP 5] Post data prepared:`, {
        title: postData.title,
        slug: postData.slug,
        status: postData.status,
        contentLength: postData.content.length,
        hasFeaturedMedia: !!featuredMediaId
      });
      
      const endpoint = this.config.destination.rest_endpoint + `/${transformed.content_type}s`;
      this.logger.info(`[STEP 5] ⏳ Posting to endpoint: ${endpoint}`);
      const postStart = Date.now();
      
      const createdPost = await withTimeout(
        this.destAPI.post(endpoint, postData),
        60000, // 60 second timeout for post creation
        'Post creation'
      );
      
      const postDuration = Date.now() - postStart;
      this.logger.success(`[STEP 5] ✅ Created ${transformed.content_type} in ${postDuration}ms`);
      this.logger.success(`[STEP 5] Post ID: ${createdPost.id}`);
      this.logger.success(`[STEP 5] Post URL: ${createdPost.link}`);
      this.logger.success(`[STEP 5] Title: "${transformed.title}"`);
      
      // Verify featured image was set
      if (featuredMediaId) {
        if (createdPost.featured_media === featuredMediaId) {
          this.logger.success(`[STEP 5] ✅ Featured image confirmed on post: Media ID ${createdPost.featured_media}`);
        } else {
          this.logger.error(`[STEP 5] ❌ Featured image NOT set on post (expected ${featuredMediaId}, got ${createdPost.featured_media})`);
        }
      }
      
      // Step 6: Insert ACF fields if present
      if (transformed.acf && Object.keys(transformed.acf).length > 0) {
        this.logger.info(`\n[STEP 6] Processing ACF fields...`);
        try {
          await withTimeout(
            this.insertACFFields(createdPost.id, transformed.acf),
            30000,
            'ACF field insertion'
          );
          this.logger.success(`[STEP 6] ✅ ACF fields inserted`);
        } catch (err) {
          this.logger.warn(`[STEP 6] ⚠️ Failed to insert ACF fields: ${err.message}`);
        }
      }
      
      // Step 7: Insert Yoast SEO meta if present
      if (transformed.yoast_meta) {
        this.logger.info(`\n[STEP 7] Processing Yoast SEO meta...`);
        try {
          await withTimeout(
            this.insertYoastMeta(createdPost.id, transformed.yoast_meta),
            30000,
            'Yoast meta insertion'
          );
          this.logger.success(`[STEP 7] ✅ Yoast meta inserted`);
        } catch (err) {
          this.logger.warn(`[STEP 7] ⚠️ Failed to insert Yoast meta: ${err.message}`);
        }
      }
      
      // Save insertion result
      this.logger.info(`\n[FINAL] Saving insertion result...`);
      const result = {
        source_id: transformed.source_id,
        destination_id: createdPost.id,
        destination_url: createdPost.link,
        title: transformed.title,
        slug: transformed.slug,
        status: createdPost.status,
        date: createdPost.date,
        date_gmt: createdPost.date_gmt,
        featured_media_id: featuredMediaId,
        images_uploaded: Object.keys(imageUrlMap).length,
        image_url_map: imageUrlMap,
        taxonomy_ids: taxonomyIds,
        inserted_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      };
      
      const filename = path.basename(transformedPath);
      const resultPath = path.join(this.resultsDir, filename);
      fs.writeJsonSync(resultPath, result, { spaces: 2 });
      
      const totalDuration = Date.now() - startTime;
      this.logger.success(`\n========================================`);
      this.logger.success(`[COMPLETE] Successfully inserted in ${totalDuration}ms`);
      this.logger.success(`[COMPLETE] Result saved: ${resultPath}`);
      this.logger.success(`========================================\n`);
      
      return { success: true, result, resultPath };
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      this.logger.error(`\n========================================`);
      this.logger.error(`[FAILED] Insertion failed after ${totalDuration}ms`);
      this.logger.error(`[FAILED] File: ${transformedPath}`);
      this.logger.error(`[FAILED] Error: ${error.message}`);
      this.logger.error(`[FAILED] Stack: ${error.stack}`);
      this.logger.error(`========================================\n`);
      throw error;
    }
  }

  /**
   * Upload featured image with detailed logging at each step
   */
  async uploadFeaturedImageWithLogging(localPath) {
    this.logger.info(`  [UPLOAD] Starting featured image upload: ${path.basename(localPath)}`);
    
    // Check if already uploaded (cache)
    if (this.mediaHandler.uploadedMedia.has(localPath)) {
      const cached = this.mediaHandler.uploadedMedia.get(localPath);
      this.logger.info(`  [UPLOAD] ✅ Using cached upload: ID ${cached.id}`);
      return cached;
    }
    
    this.logger.info(`  [UPLOAD] Reading file from disk...`);
    const fileBuffer = fs.readFileSync(localPath);
    this.logger.info(`  [UPLOAD] ✅ File read: ${this.formatBytes(fileBuffer.length)}`);
    
    const filename = path.basename(localPath);
    const mimeType = this.mediaHandler.getMimeType(filename);
    this.logger.info(`  [UPLOAD] MIME type: ${mimeType}`);
    
    this.logger.info(`  [UPLOAD] ⏳ Sending to WordPress API...`);
    const apiStart = Date.now();
    
    try {
      const result = await this.destAPI.uploadMedia(fileBuffer, filename, mimeType);
      const apiDuration = Date.now() - apiStart;
      
      this.logger.info(`  [UPLOAD] ✅ API response received in ${apiDuration}ms`);
      this.logger.info(`  [UPLOAD] Media ID: ${result.id}`);
      this.logger.info(`  [UPLOAD] Media URL: ${result.source_url}`);
      
      const uploadData = {
        id: result.id,
        url: result.source_url,
        localPath: localPath
      };
      
      // Cache the upload
      this.logger.info(`  [UPLOAD] Caching upload result...`);
      this.mediaHandler.uploadedMedia.set(localPath, uploadData);
      this.mediaHandler.saveCache();
      this.logger.info(`  [UPLOAD] ✅ Upload cached`);
      
      return uploadData;
    } catch (error) {
      const apiDuration = Date.now() - apiStart;
      this.logger.error(`  [UPLOAD] ❌ API call failed after ${apiDuration}ms`);
      this.logger.error(`  [UPLOAD] Error type: ${error.name}`);
      this.logger.error(`  [UPLOAD] Error message: ${error.message}`);
      this.logger.error(`  [UPLOAD] HTTP status: ${error.response?.status}`);
      this.logger.error(`  [UPLOAD] Response data:`, error.response?.data);
      throw error;
    }
  }

  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  async ensureTaxonomies(taxonomies) {
    const result = {
      categories: [],
      tags: [],
      custom: {}
    };
    
    if (!taxonomies) {
      this.logger.debug(`[TAXONOMIES] No taxonomies to process`);
      return result;
    }
    
    // Ensure categories exist
    if (taxonomies.categories && taxonomies.categories.length > 0) {
      this.logger.info(`[TAXONOMIES] Ensuring ${taxonomies.categories.length} categories exist...`);
      
      for (const category of taxonomies.categories) {
        const termId = await this.ensureTerm('categories', category);
        if (termId) {
          result.categories.push(termId);
        }
      }
    }
    
    // Ensure tags exist
    if (taxonomies.tags && taxonomies.tags.length > 0) {
      this.logger.info(`[TAXONOMIES] Ensuring ${taxonomies.tags.length} tags exist...`);
      
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
          this.logger.info(`[TAXONOMIES] Ensuring ${terms.length} ${taxonomy} terms exist...`);
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
        
        this.logger.debug(`[TAXONOMIES] Found existing ${taxonomy} term: ${term.name} (ID: ${termId})`);
        return termId;
      }
      
      // Term doesn't exist - create it (CREATION AUTHORITY)
      this.logger.info(`[TAXONOMIES] Creating ${taxonomy} term: ${term.name}`);
      
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
      
      this.logger.success(`[TAXONOMIES] Created ${taxonomy} term: ${term.name} (ID: ${termId})`);
      return termId;
      
    } catch (error) {
      this.logger.error(`[TAXONOMIES] Failed to ensure ${taxonomy} term: ${term.name}`, {
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
