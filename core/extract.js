const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const Logger = require('../utils/logger');
const WordPressAPIClient = require('../utils/api-client');
const MediaHandler = require('../utils/media-handler');

class ContentExtractor {
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger || new Logger();
    this.sourceAPI = new WordPressAPIClient(config.source, this.logger);
    this.mediaHandler = new MediaHandler(config, this.logger);
    this.snapshotDir = config.directories?.snapshots || './content-snapshots';
    
    // Extraction mode: 'authenticated' or 'frontend'
    this.extractionMode = config.extraction_mode || 'authenticated';
    
    fs.ensureDirSync(this.snapshotDir);
  }

  async catalogSite() {
    this.logger.info(`Starting site cataloging (mode: ${this.extractionMode})...`);
    
    // [EXTRACT-DEBUG] Log the source URL being queried
    console.log('[EXTRACT-DEBUG] ========== CATALOG START ==========');
    console.log('[EXTRACT-DEBUG] Source URL:', this.config.source.url);
    console.log('[EXTRACT-DEBUG] Extraction Mode:', this.extractionMode);
    console.log('[EXTRACT-DEBUG] REST Endpoint Base:', this.config.source.rest_endpoint);
    console.log('[EXTRACT-DEBUG] Content Types to Query:', this.config.migration_settings.content_types);
    console.log('[EXTRACT-DEBUG] ====================================');
    
    const manifest = {
      source_url: this.config.source.url,
      extraction_mode: this.extractionMode,
      catalog_date: new Date().toISOString(),
      content_types: {},
      total_items: 0
    };

    if (this.extractionMode === 'frontend') {
      // Front-end crawling catalog
      return await this.catalogSiteFrontend(manifest);
    }

    // If authenticated mode is requested, try it first, but fall back to unauthenticated on auth failure
    const originalExtractionMode = this.extractionMode;

    // Authenticated catalog (original logic)
    for (const contentType of this.config.migration_settings.content_types) {
      try {
        this.logger.info(`Cataloging ${contentType}s...`);
        
        let items = [];
        let page = 1;
        let hasMore = true;
        
        // Paginate through all items
        while (hasMore) {
          const endpoint = this.config.source.rest_endpoint + `/${contentType}s`;
          const params = {
            page,
            per_page: 100
          };
          
          // Only request published posts by default (unless specifically configured otherwise)
          // This prevents pulling drafts, pending, or trashed posts that inflate the count
          const allowedStatuses = this.config.migration_settings?.post_status || ['publish'];
          if (this.extractionMode === 'authenticated' && 
              this.config.source.auth && 
              this.config.source.auth.method &&
              this.config.source.auth.method !== 'none' &&
              allowedStatuses.length > 1) {
            params.status = allowedStatuses.join(',');
          } else {
            params.status = 'publish'; // Default to published posts only
          }
          
          // [EXTRACT-DEBUG] Log what we're requesting
          console.log(`[EXTRACT-DEBUG] ===== ${contentType.toUpperCase()} - PAGE ${page} =====`);
          console.log('[EXTRACT-DEBUG] Full URL:', `${endpoint}?${new URLSearchParams(params).toString()}`);
          console.log('[EXTRACT-DEBUG] Endpoint:', endpoint);
          console.log('[EXTRACT-DEBUG] Params:', JSON.stringify(params, null, 2));
          console.log('[EXTRACT-DEBUG] Extraction mode:', this.extractionMode);
          console.log('[EXTRACT-DEBUG] Auth method:', this.config.source.auth?.method || 'none');
          console.log('[EXTRACT-DEBUG] Allowed statuses:', allowedStatuses);
          
          try {
            const batch = await this.sourceAPI.get(endpoint, params);
            
            // [EXTRACT-DEBUG] Log what we got back
            console.log('[EXTRACT-DEBUG] ===== RESPONSE =====');
            console.log(`[EXTRACT-DEBUG] Received ${batch.length} items on page ${page}`);
            console.log(`[EXTRACT-DEBUG] Response type: ${Array.isArray(batch) ? 'array' : typeof batch}`);
            
            if (batch.length > 0) {
              console.log(`[EXTRACT-DEBUG] First item: id=${batch[0].id}, status=${batch[0].status}, title="${batch[0].title?.rendered}"`);
              console.log(`[EXTRACT-DEBUG] Last item: id=${batch[batch.length - 1].id}, status=${batch[batch.length - 1].status}, title="${batch[batch.length - 1].title?.rendered}"`);
              
              // Log all post statuses in this batch
              const statusCounts = {};
              batch.forEach(item => {
                statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
              });
              console.log('[EXTRACT-DEBUG] Status breakdown in batch:', JSON.stringify(statusCounts, null, 2));
            } else {
              console.log('[EXTRACT-DEBUG] Empty batch - pagination complete');
            }
            
            if (batch.length === 0) {
              hasMore = false;
            } else {
              items = items.concat(batch);
              page++;
            }
          } catch (error) {
            console.log('[EXTRACT-DEBUG] ===== ERROR OCCURRED =====');
            console.log('[EXTRACT-DEBUG] Error status:', error.response?.status);
            console.log('[EXTRACT-DEBUG] Error code:', error.response?.data?.code);
            console.log('[EXTRACT-DEBUG] Error message:', error.message);
            console.log('[EXTRACT-DEBUG] ==========================');
            
            // Handle "invalid page number" error - this means we've reached the end
            if (error.response?.status === 400 && error.response?.data?.code === 'rest_post_invalid_page_number') {
              console.log('[EXTRACT-DEBUG] End of pagination reached (invalid page number)');
              hasMore = false;
            } else if (error.response?.status === 400 && error.response?.data?.code === 'rest_invalid_param' && 
                       originalExtractionMode === 'authenticated' && params.status) {
              // Auth failed when trying to get non-public posts - retry without auth params
              console.log('[EXTRACT-DEBUG] Auth failure detected - retrying without authentication');
              this.logger.warn('Authenticated extraction failed, retrying without authentication');
              this.extractionMode = 'unauthenticated';
              delete params.status;
              return await this.catalogSite(); // Retry with unauthenticated mode
            } else {
              // Re-throw other errors
              console.log('[EXTRACT-DEBUG] Unhandled error - rethrowing');
              throw error;
            }
          }
        }
        
        // [EXTRACT-DEBUG] Log pre-filter count and details
        console.log('[EXTRACT-DEBUG] ===== PRE-FILTER ANALYSIS =====');
        console.log(`[EXTRACT-DEBUG] Total ${contentType}s collected from API: ${items.length}`);
        
        // Count by status
        const preFilterStatusCounts = {};
        items.forEach(item => {
          preFilterStatusCounts[item.status] = (preFilterStatusCounts[item.status] || 0) + 1;
        });
        console.log('[EXTRACT-DEBUG] Status breakdown (pre-filter):', JSON.stringify(preFilterStatusCounts, null, 2));
        
        // Log first 5 items
        console.log('[EXTRACT-DEBUG] Sample items (first 5):');
        items.slice(0, 5).forEach((item, idx) => {
          console.log(`[EXTRACT-DEBUG]   ${idx + 1}. id=${item.id}, status="${item.status}", title="${item.title?.rendered}"`);
        });
        
        // Log exclusion config
        console.log('[EXTRACT-DEBUG] Exclusion config:', JSON.stringify(this.config.exclusions || {}, null, 2));
        
        // Filter out excluded items
        const itemsBeforeFilter = items.length;
        items = this.filterExcludedItems(items, contentType);
        
        // [EXTRACT-DEBUG] Log post-filter count
        console.log('[EXTRACT-DEBUG] ===== POST-FILTER ANALYSIS =====');
        console.log(`[EXTRACT-DEBUG] Items after filtering: ${items.length} (removed ${itemsBeforeFilter - items.length})`);
        
        if (items.length !== itemsBeforeFilter) {
          // Log which items were filtered out
          const preFilterIds = new Set(items.map(item => item.id));
          const removedItems = items.filter(item => !preFilterIds.has(item.id));
          console.log('[EXTRACT-DEBUG] Filtered out items:', removedItems.map(item => ({
            id: item.id,
            title: item.title?.rendered,
            status: item.status
          })));
        }
        
        // Count by status after filtering
        const postFilterStatusCounts = {};
        items.forEach(item => {
          postFilterStatusCounts[item.status] = (postFilterStatusCounts[item.status] || 0) + 1;
        });
        console.log('[EXTRACT-DEBUG] Status breakdown (post-filter):', JSON.stringify(postFilterStatusCounts, null, 2));
        
        manifest.content_types[contentType] = {
          count: items.length,
          items: items.map(item => ({
            id: item.id,
            title: item.title?.rendered || 'Untitled',
            slug: item.slug,
            url: item.link,
            status: item.status,
            date: item.date
          }))
        };
        
        manifest.total_items += items.length;
        
        console.log(`[EXTRACT-DEBUG] ===== CONTENT TYPE COMPLETE: ${contentType.toUpperCase()} =====`);
        console.log(`[EXTRACT-DEBUG] Final count for ${contentType}: ${items.length}`);
        console.log('[EXTRACT-DEBUG] ================================================\n');
        
        this.logger.success(`Found ${items.length} ${contentType}s`);
      } catch (error) {
        this.logger.error(`Failed to catalog ${contentType}s`, { error: error.message });
      }
    }

    // Save manifest
    const manifestPath = path.join(this.snapshotDir, 'source-site-manifest.json');
    fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
    
    // [EXTRACT-DEBUG] Final summary
    console.log('[EXTRACT-DEBUG] ========== CATALOG COMPLETE ==========');
    console.log('[EXTRACT-DEBUG] Total items found:', manifest.total_items);
    console.log('[EXTRACT-DEBUG] Content types breakdown:');
    Object.entries(manifest.content_types).forEach(([type, data]) => {
      console.log(`[EXTRACT-DEBUG]   ${type}: ${data.count} items`);
    });
    console.log('[EXTRACT-DEBUG] Manifest saved to:', manifestPath);
    console.log('[EXTRACT-DEBUG] ======================================\n');
    
    this.logger.success(`Catalog complete: ${manifest.total_items} items found`);
    this.logger.info(`Manifest saved to: ${manifestPath}`);
    
    return manifest;
  }

  async catalogSiteFrontend(manifest) {
    this.logger.info('Using front-end crawling mode (limited to published content)...');
    
    // Try to discover posts from various common URLs
    const discoveryUrls = [
      '/wp-sitemap-posts-post-1.xml',  // WordPress sitemap
      '/sitemap.xml',                   // Yoast/generic sitemap
      '/sitemap_index.xml',             // Yoast sitemap index
      '/feed/',                         // RSS feed
      '/wp-json/wp/v2/posts'           // REST API (public endpoint)
    ];
    
    const items = [];
    
    for (const url of discoveryUrls) {
      try {
        const fullUrl = this.config.source.url + url;
        this.logger.info(`Trying discovery URL: ${fullUrl}`);
        
        const response = await axios.get(fullUrl, { timeout: 10000 });
        
        if (url.includes('sitemap')) {
          // Parse XML sitemap
          const $ = cheerio.load(response.data, { xmlMode: true });
          $('url > loc').each((i, elem) => {
            const loc = $(elem).text();
            items.push({ url: loc });
          });
        } else if (url.includes('feed')) {
          // Parse RSS feed
          const $ = cheerio.load(response.data, { xmlMode: true });
          $('item').each((i, elem) => {
            const link = $(elem).find('link').text();
            const title = $(elem).find('title').text();
            items.push({ url: link, title });
          });
        } else if (url.includes('wp-json')) {
          // Parse JSON API
          if (Array.isArray(response.data)) {
            response.data.forEach(post => {
              items.push({
                id: post.id,
                url: post.link,
                title: post.title?.rendered,
                slug: post.slug
              });
            });
          }
        }
        
        if (items.length > 0) {
          this.logger.success(`Found ${items.length} items via ${url}`);
          break; // Stop after first successful discovery
        }
      } catch (error) {
        this.logger.debug(`Discovery failed for ${url}: ${error.message}`);
      }
    }
    
    if (items.length === 0) {
      this.logger.warn('No items discovered via automatic methods');
      this.logger.info('Consider providing a manual list of URLs to crawl');
    }
    
    manifest.content_types.post = {
      count: items.length,
      items: items.map((item, i) => ({
        id: item.id || `frontend-${i}`,
        title: item.title || 'Unknown',
        url: item.url,
        slug: item.slug || this.extractSlugFromUrl(item.url)
      }))
    };
    
    manifest.total_items = items.length;
    
    // Save manifest
    const manifestPath = path.join(this.snapshotDir, 'source-site-manifest.json');
    fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
    
    this.logger.success(`Frontend catalog complete: ${manifest.total_items} items found`);
    this.logger.info(`Manifest saved to: ${manifestPath}`);
    
    return manifest;
  }

  extractSlugFromUrl(url) {
    const parts = url.split('/').filter(p => p.length > 0);
    return parts[parts.length - 1] || 'unknown';
  }

  filterExcludedItems(items, contentType) {
    const exclusions = this.config.exclusions || {};
    
    console.log('[EXTRACT-DEBUG] ===== FILTERING ITEMS =====');
    console.log('[EXTRACT-DEBUG] Items to filter:', items.length);
    console.log('[EXTRACT-DEBUG] Exclusions config:', JSON.stringify(exclusions, null, 2));
    
    let excludedByIdCount = 0;
    let excludedByStatusCount = 0;
    
    const filtered = items.filter(item => {
      // Exclude by ID
      if (exclusions.post_ids && exclusions.post_ids.includes(item.id)) {
        excludedByIdCount++;
        console.log(`[EXTRACT-DEBUG] Excluded by ID: ${item.id} - "${item.title?.rendered}"`);
        return false;
      }
      
      // Exclude by status
      if (exclusions.post_status && exclusions.post_status.includes(item.status)) {
        excludedByStatusCount++;
        console.log(`[EXTRACT-DEBUG] Excluded by status "${item.status}": ${item.id} - "${item.title?.rendered}"`);
        return false;
      }
      
      // Exclude by category/tag (would need to fetch terms)
      
      return true;
    });
    
    console.log('[EXTRACT-DEBUG] Filtering summary:');
    console.log(`[EXTRACT-DEBUG]   Excluded by ID: ${excludedByIdCount}`);
    console.log(`[EXTRACT-DEBUG]   Excluded by status: ${excludedByStatusCount}`);
    console.log(`[EXTRACT-DEBUG]   Total excluded: ${items.length - filtered.length}`);
    console.log(`[EXTRACT-DEBUG]   Remaining items: ${filtered.length}`);
    console.log('[EXTRACT-DEBUG] ==========================\n');
    
    return filtered;
  }

  async extractContent(itemId, contentType = 'post') {
    if (this.extractionMode === 'frontend') {
      // Use front-end crawling
      return await this.extractContentFrontend(itemId, contentType);
    }
    
    // Use authenticated extraction (original logic)
    return await this.extractContentAuthenticated(itemId, contentType);
  }

  async extractContentAuthenticated(itemId, contentType = 'post') {
    const mode = this.extractionMode === 'unauthenticated' ? 'unauthenticated' : 'authenticated';
    this.logger.info(`Extracting ${contentType} #${itemId} (${mode})...`);
    
    try {
      // Fetch full content with edit context (includes all meta) if authenticated
      const endpoint = this.config.source.rest_endpoint + `/${contentType}s/${itemId}`;
      const params = {};
      
      // Only request edit context if we have valid authentication
      if (this.extractionMode === 'authenticated' && 
          this.config.source.auth && 
          this.config.source.auth.method &&
          this.config.source.auth.method !== 'none') {
        params.context = 'edit';
      }
      
      const item = await this.sourceAPI.get(endpoint, params);
      
      // Parse HTML for images, links, tables
      const $ = cheerio.load(item.content.rendered || '');
      
      // Extract images
      const images = [];
      $('img').each((i, elem) => {
        images.push({
          src: $(elem).attr('src'),
          alt: $(elem).attr('alt') || '',
          width: $(elem).attr('width') || null,
          height: $(elem).attr('height') || null
        });
      });
      
      // Download images
      const downloadedImages = [];
      for (const img of images) {
        try {
          const localPath = await this.mediaHandler.downloadImage(img.src, itemId);
          downloadedImages.push({
            ...img,
            localPath
          });
        } catch (err) {
          this.logger.warn(`Failed to download image: ${img.src}`);
        }
      }
      
      // Extract links
      const links = [];
      $('a').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href) {
          links.push({
            href,
            text: $(elem).text().trim(),
            type: href.startsWith('http') ? 'external' : 'internal'
          });
        }
      });
      
      // Extract tables
      const tables = [];
      $('table').each((i, elem) => {
        const rows = $(elem).find('tr').length;
        const cols = $(elem).find('tr').first().find('th, td').length;
        tables.push({
          html: $.html(elem),
          row_count: rows,
          col_count: cols
        });
      });
      
      // Calculate word count
      const text = $('body').text();
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      
      // Fetch featured image
      let featuredImage = null;
      if (item.featured_media && item.featured_media > 0) {
        this.logger.info(`Found featured_media ID ${item.featured_media} - fetching details...`);
        try {
          const mediaEndpoint = this.config.source.rest_endpoint + `/media/${item.featured_media}`;
          const media = await this.sourceAPI.get(mediaEndpoint);
          featuredImage = {
            id: media.id,
            url: media.source_url,
            alt: media.alt_text || ''
          };
          
          this.logger.info(`Fetched featured media: ${media.source_url}`);
          this.logger.info(`Downloading featured image to local cache...`);
          
          // Download featured image
          const localPath = await this.mediaHandler.downloadImage(featuredImage.url, itemId);
          featuredImage.localPath = localPath;
          
          this.logger.success(`✅ Featured image ready: ${localPath}`);
        } catch (err) {
          this.logger.error(`❌ Failed to fetch/download featured image (ID: ${item.featured_media}): ${err.message}`);
          this.logger.warn('Post will be migrated WITHOUT featured image');
          // Set featuredImage to null so it's clear in the snapshot
          featuredImage = null;
        }
      } else {
        this.logger.debug('No featured_media field or ID is 0 - post has no featured image');
      }
      
      // Fetch taxonomies (categories, tags, custom taxonomies)
      const taxonomies = await this.fetchTaxonomies(item);
      
      // Create content snapshot
      const snapshot = {
        source_id: item.id,
        content_type: contentType,
        title: item.title?.rendered || 'Untitled',
        slug: item.slug,
        status: item.status,
        date: item.date,
        date_gmt: item.date_gmt,
        modified: item.modified,
        modified_gmt: item.modified_gmt,
        author: item.author,
        excerpt: item.excerpt?.rendered || '',
        html_body: item.content?.rendered || '',
        word_count: wordCount,
        images: downloadedImages,
        links,
        tables,
        featured_image: featuredImage,
        taxonomies,  // NEW: structured taxonomy data
        categories: item.categories || [],
        tags: item.tags || [],
        meta: item.meta || {},
        acf: item.acf || {},
        yoast_meta: {
          title: item.yoast_head_json?.title || '',
          description: item.yoast_head_json?.description || '',
          og_title: item.yoast_head_json?.og_title || '',
          og_description: item.yoast_head_json?.og_description || ''
        },
        extraction_mode: 'authenticated',
        extracted_at: new Date().toISOString()
      };
      
      // Save snapshot
      const snapshotPath = path.join(this.snapshotDir, `${contentType}-${itemId}.json`);
      fs.writeJsonSync(snapshotPath, snapshot, { spaces: 2 });
      
      this.logger.success(`Extracted ${contentType} #${itemId}: "${snapshot.title}"`);
      this.logger.info(`  Word count: ${wordCount}`);
      this.logger.info(`  Images: ${images.length}`);
      this.logger.info(`  Links: ${links.length}`);
      this.logger.info(`  Tables: ${tables.length}`);
      this.logger.info(`  Taxonomies: ${Object.keys(taxonomies).length} types`);
      
      return { snapshot, snapshotPath };
    } catch (error) {
      this.logger.error(`Failed to extract ${contentType} #${itemId}`, {
        error: error.message
      });
      throw error;
    }
  }

  async extractContentFrontend(itemIdOrUrl, contentType = 'post') {
    this.logger.info(`Extracting ${contentType} via front-end crawling...`);
    
    try {
      // Determine the URL to crawl
      let url;
      if (typeof itemIdOrUrl === 'string' && itemIdOrUrl.startsWith('http')) {
        url = itemIdOrUrl;
      } else {
        // Try to construct URL from manifest
        const manifestPath = path.join(this.snapshotDir, 'source-site-manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = fs.readJsonSync(manifestPath);
          const item = manifest.content_types[contentType]?.items.find(
            i => i.id === itemIdOrUrl || i.slug === itemIdOrUrl
          );
          url = item?.url;
        }
      }
      
      if (!url) {
        throw new Error(`Could not determine URL for ${itemIdOrUrl}`);
      }
      
      this.logger.info(`Crawling: ${url}`);
      
      // Fetch the page
      const response = await axios.get(url, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'WordPress Migration Bot/1.0'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract title (try various selectors)
      let title = $('h1.entry-title').first().text().trim() ||
                  $('h1').first().text().trim() ||
                  $('title').text().replace(/\s*\|.*$/, '').trim();
      
      // Extract main content (try various selectors)
      let contentHTML = '';
      const contentSelectors = [
        'article .entry-content',
        'article .post-content',
        '.article-content',
        'main article',
        '[itemprop="articleBody"]',
        'article'
      ];
      
      for (const selector of contentSelectors) {
        const content = $(selector).html();
        if (content && content.length > 100) {
          contentHTML = content;
          break;
        }
      }
      
      if (!contentHTML) {
        throw new Error('Could not extract content from page');
      }
      
      // Parse extracted content
      const $content = cheerio.load(contentHTML);
      
      // Extract images
      const images = [];
      $content('img').each((i, elem) => {
        const src = $(elem).attr('src');
        if (src) {
          images.push({
            src,
            alt: $(elem).attr('alt') || '',
            width: $(elem).attr('width') || null,
            height: $(elem).attr('height') || null
          });
        }
      });
      
      // Download images
      const downloadedImages = [];
      for (const img of images) {
        try {
          const localPath = await this.mediaHandler.downloadImage(
            img.src, 
            this.extractSlugFromUrl(url)
          );
          downloadedImages.push({
            ...img,
            localPath
          });
        } catch (err) {
          this.logger.warn(`Failed to download image: ${img.src}`);
        }
      }
      
      // Extract links
      const links = [];
      $content('a').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href) {
          links.push({
            href,
            text: $(elem).text().trim(),
            type: href.startsWith('http') ? 'external' : 'internal'
          });
        }
      });
      
      // Extract tables
      const tables = [];
      $content('table').each((i, elem) => {
        const rows = $(elem).find('tr').length;
        const cols = $(elem).find('tr').first().find('th, td').length;
        tables.push({
          html: $content.html(elem),
          row_count: rows,
          col_count: cols
        });
      });
      
      // Calculate word count
      const text = $content('body').text();
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      
      // Extract publication date (try various meta tags)
      let date = $('meta[property="article:published_time"]').attr('content') ||
                 $('meta[name="date"]').attr('content') ||
                 $('time[datetime]').attr('datetime') ||
                 $('.entry-date').attr('datetime') ||
                 new Date().toISOString();
      
      // Extract featured image
      let featuredImage = null;
      const featuredSrc = $('meta[property="og:image"]').attr('content') ||
                          $('.featured-image img').first().attr('src') ||
                          $('article img').first().attr('src');
      
      if (featuredSrc) {
        try {
          const localPath = await this.mediaHandler.downloadImage(
            featuredSrc,
            this.extractSlugFromUrl(url)
          );
          featuredImage = {
            url: featuredSrc,
            alt: '',
            localPath
          };
        } catch (err) {
          this.logger.warn(`Failed to download featured image: ${featuredSrc}`);
        }
      }
      
      // Extract categories/tags from page (limited data)
      const taxonomies = this.extractTaxonomiesFromHTML($);
      
      // Extract slug from URL
      const slug = this.extractSlugFromUrl(url);
      
      // Create content snapshot
      const snapshot = {
        source_id: itemIdOrUrl,
        content_type: contentType,
        title,
        slug,
        status: 'publish',  // Front-end crawling only sees published content
        date,
        date_gmt: date,
        modified: date,
        modified_gmt: date,
        author: null,  // Unknown from front-end
        excerpt: $('meta[name="description"]').attr('content') || '',
        html_body: contentHTML,
        word_count: wordCount,
        images: downloadedImages,
        links,
        tables,
        featured_image: featuredImage,
        taxonomies,
        categories: [],  // Limited from front-end
        tags: [],        // Limited from front-end
        meta: {},
        acf: {},         // Cannot extract ACF from front-end
        yoast_meta: {
          title: $('meta[property="og:title"]').attr('content') || title,
          description: $('meta[property="og:description"]').attr('content') || '',
          og_title: $('meta[property="og:title"]').attr('content') || '',
          og_description: $('meta[property="og:description"]').attr('content') || ''
        },
        extraction_mode: 'frontend',
        source_url: url,
        limitations: [
          'Publication dates may not be exact',
          'ACF fields not available',
          'Taxonomy data limited',
          'Draft/private content not accessible'
        ],
        extracted_at: new Date().toISOString()
      };
      
      // Save snapshot
      const snapshotPath = path.join(this.snapshotDir, `${contentType}-${slug}.json`);
      fs.writeJsonSync(snapshotPath, snapshot, { spaces: 2 });
      
      this.logger.success(`Extracted ${contentType} "${snapshot.title}" (frontend)`);
      this.logger.info(`  Word count: ${wordCount}`);
      this.logger.info(`  Images: ${images.length}`);
      this.logger.info(`  Links: ${links.length}`);
      this.logger.info(`  Tables: ${tables.length}`);
      this.logger.warn(`  ⚠️  Frontend extraction has limitations (see snapshot)`);
      
      return { snapshot, snapshotPath };
    } catch (error) {
      this.logger.error(`Failed to extract via frontend: ${itemIdOrUrl}`, {
        error: error.message
      });
      throw error;
    }
  }

  async fetchTaxonomies(item) {
    const taxonomies = {
      categories: [],
      tags: [],
      custom: {}
    };
    
    try {
      // Fetch categories
      if (item.categories && item.categories.length > 0) {
        for (const catId of item.categories) {
          try {
            const endpoint = this.config.source.rest_endpoint + `/categories/${catId}`;
            const category = await this.sourceAPI.get(endpoint);
            taxonomies.categories.push({
              id: category.id,
              name: category.name,
              slug: category.slug,
              parent: category.parent || 0,
              description: category.description || ''
            });
          } catch (err) {
            this.logger.warn(`Failed to fetch category ${catId}`);
          }
        }
      }
      
      // Fetch tags
      if (item.tags && item.tags.length > 0) {
        for (const tagId of item.tags) {
          try {
            const endpoint = this.config.source.rest_endpoint + `/tags/${tagId}`;
            const tag = await this.sourceAPI.get(endpoint);
            taxonomies.tags.push({
              id: tag.id,
              name: tag.name,
              slug: tag.slug,
              description: tag.description || ''
            });
          } catch (err) {
            this.logger.warn(`Failed to fetch tag ${tagId}`);
          }
        }
      }
      
      // Fetch custom taxonomies (if defined in config)
      const customTaxonomies = this.config.custom_taxonomies || [];
      for (const taxonomy of customTaxonomies) {
        try {
          const termIds = item[taxonomy] || [];
          if (termIds.length > 0) {
            taxonomies.custom[taxonomy] = [];
            
            for (const termId of termIds) {
              try {
                const endpoint = this.config.source.rest_endpoint + `/${taxonomy}/${termId}`;
                const term = await this.sourceAPI.get(endpoint);
                taxonomies.custom[taxonomy].push({
                  id: term.id,
                  name: term.name,
                  slug: term.slug,
                  parent: term.parent || 0,
                  description: term.description || ''
                });
              } catch (err) {
                this.logger.warn(`Failed to fetch ${taxonomy} term ${termId}`);
              }
            }
          }
        } catch (err) {
          this.logger.warn(`Failed to fetch custom taxonomy: ${taxonomy}`);
        }
      }
    } catch (error) {
      this.logger.warn('Error fetching taxonomies', { error: error.message });
    }
    
    return taxonomies;
  }

  extractTaxonomiesFromHTML($) {
    const taxonomies = {
      categories: [],
      tags: [],
      custom: {}
    };
    
    // Try to extract categories from common markup patterns
    $('.categories a, .category a, [rel="category tag"]').each((i, elem) => {
      const name = $(elem).text().trim();
      if (name) {
        taxonomies.categories.push({
          name,
          slug: this.slugify(name)
        });
      }
    });
    
    // Try to extract tags
    $('.tags a, .tag a, [rel="tag"]').each((i, elem) => {
      const name = $(elem).text().trim();
      if (name && !taxonomies.categories.some(c => c.name === name)) {
        taxonomies.tags.push({
          name,
          slug: this.slugify(name)
        });
      }
    });
    
    return taxonomies;
  }

  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  async extractBatch(itemIds, contentType = 'post') {
    this.logger.info(`Extracting batch of ${itemIds.length} items...`);
    
    const results = [];
    for (const itemId of itemIds) {
      try {
        const result = await this.extractContent(itemId, contentType);
        results.push({ success: true, itemId, ...result });
      } catch (error) {
        results.push({ success: false, itemId, error: error.message });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    this.logger.info(`Batch complete: ${successCount}/${itemIds.length} successful`);
    
    return results;
  }

  async extractAll() {
    this.logger.info('Starting full site extraction...');
    
    // First, catalog the site
    const manifest = await this.catalogSite();
    
    const allResults = [];
    
    // Extract each content type
    for (const [contentType, data] of Object.entries(manifest.content_types)) {
      const itemIds = data.items.map(item => item.id || item.url);
      
      if (itemIds.length === 0) {
        this.logger.info(`No ${contentType}s to extract`);
        continue;
      }
      
      this.logger.info(`Extracting ${itemIds.length} ${contentType}s...`);
      
      // Process in batches
      const batchSize = this.config.migration_settings.batch_size || 10;
      for (let i = 0; i < itemIds.length; i += batchSize) {
        const batch = itemIds.slice(i, i + batchSize);
        const results = await this.extractBatch(batch, contentType);
        allResults.push(...results);
        
        this.logger.info(`Progress: ${Math.min(i + batchSize, itemIds.length)}/${itemIds.length}`);
      }
    }
    
    const successCount = allResults.filter(r => r.success).length;
    this.logger.success(`Extraction complete: ${successCount}/${allResults.length} items extracted`);
    
    return allResults;
  }
}

// CLI support
if (require.main === module) {
  const configPath = process.argv[2] || './config/migration-config.json';
  
  if (!fs.existsSync(configPath)) {
    console.error('Config file not found:', configPath);
    console.error('Usage: node extract.js [config-file.json]');
    process.exit(1);
  }
  
  const config = fs.readJsonSync(configPath);
  const extractor = new ContentExtractor(config);
  
  extractor.extractAll()
    .then(() => {
      console.log('✅ Extraction complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Extraction failed:', error.message);
      process.exit(1);
    });
}

module.exports = ContentExtractor;
