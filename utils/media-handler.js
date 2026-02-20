const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class MediaHandler {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.cacheDir = config.media_handling?.local_cache_path || './migration-assets';
    this.mediaCache = new Map(); // url -> local path mapping
    this.uploadedMedia = new Map(); // local path -> destination media ID mapping
    
    fs.ensureDirSync(this.cacheDir);
    this.loadCache();
  }

  loadCache() {
    const cacheFile = path.join(this.cacheDir, 'media-cache.json');
    if (fs.existsSync(cacheFile)) {
      try {
        const cache = fs.readJsonSync(cacheFile);
        this.mediaCache = new Map(Object.entries(cache.downloaded || {}));
        this.uploadedMedia = new Map(Object.entries(cache.uploaded || {}));
        this.logger.info(`Loaded media cache: ${this.mediaCache.size} downloaded, ${this.uploadedMedia.size} uploaded`);
      } catch (e) {
        this.logger.warn('Could not load media cache', { error: e.message });
      }
    }
  }

  saveCache() {
    const cacheFile = path.join(this.cacheDir, 'media-cache.json');
    const cache = {
      downloaded: Object.fromEntries(this.mediaCache),
      uploaded: Object.fromEntries(this.uploadedMedia),
      lastUpdated: new Date().toISOString()
    };
    fs.writeJsonSync(cacheFile, cache, { spaces: 2 });
  }

  async downloadImage(url, postId) {
    // Check cache first
    if (this.mediaCache.has(url)) {
      const cachedPath = this.mediaCache.get(url);
      if (fs.existsSync(cachedPath)) {
        this.logger.debug(`Using cached image: ${url}`);
        return cachedPath;
      }
    }

    try {
      this.logger.info(`Downloading image: ${url}`);
      
      // Create post-specific directory
      const postDir = path.join(this.cacheDir, postId.toString());
      fs.ensureDirSync(postDir);
      
      // Download image
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'WordPress-Migration-Bot/1.0'
        }
      });
      
      // Extract filename from URL or generate one
      let filename = path.basename(new URL(url).pathname);
      if (!filename || filename.length > 255) {
        const ext = this.getExtensionFromMimeType(response.headers['content-type']);
        filename = `image-${crypto.randomBytes(8).toString('hex')}${ext}`;
      }
      
      const localPath = path.join(postDir, filename);
      
      // Save file
      fs.writeFileSync(localPath, response.data);
      
      // Cache the result
      this.mediaCache.set(url, localPath);
      this.saveCache();
      
      this.logger.success(`Downloaded: ${filename} (${this.formatBytes(response.data.length)})`);
      
      return localPath;
    } catch (error) {
      this.logger.error(`Failed to download image: ${url}`, {
        error: error.message
      });
      throw error;
    }
  }

  async downloadMultiple(urls, postId, maxConcurrent = 5) {
    const results = [];
    const chunks = this.chunkArray(urls, maxConcurrent);
    
    for (const chunk of chunks) {
      const promises = chunk.map(url => 
        this.downloadImage(url, postId).catch(err => {
          this.logger.warn(`Skipping failed download: ${url}`);
          return null;
        })
      );
      
      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }
    
    return results.filter(r => r !== null);
  }

  async uploadToWordPress(localPath, apiClient, metadata = {}) {
    // Check if already uploaded
    if (this.uploadedMedia.has(localPath)) {
      const cached = this.uploadedMedia.get(localPath);
      this.logger.debug(`Using cached upload: ${localPath} -> ${cached.id}`);
      return cached;
    }

    try {
      this.logger.info(`Uploading to WordPress: ${path.basename(localPath)}`);
      
      const fileBuffer = fs.readFileSync(localPath);
      const filename = path.basename(localPath);
      const mimeType = this.getMimeType(filename);
      
      const result = await apiClient.uploadMedia(fileBuffer, filename, mimeType);
      
      const uploadData = {
        id: result.id,
        url: result.source_url,
        localPath: localPath
      };
      
      // Cache the upload
      this.uploadedMedia.set(localPath, uploadData);
      this.saveCache();
      
      this.logger.success(`Uploaded: ${filename} -> ID ${result.id}`);
      
      return uploadData;
    } catch (error) {
      this.logger.error(`Failed to upload: ${localPath}`, {
        error: error.message
      });
      throw error;
    }
  }

  async uploadMultiple(localPaths, apiClient, maxConcurrent = 5) {
    const results = [];
    const chunks = this.chunkArray(localPaths, maxConcurrent);
    
    for (const chunk of chunks) {
      const promises = chunk.map(localPath => 
        this.uploadToWordPress(localPath, apiClient).catch(err => {
          this.logger.warn(`Skipping failed upload: ${localPath}`);
          return null;
        })
      );
      
      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }
    
    return results.filter(r => r !== null);
  }

  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  getExtensionFromMimeType(mimeType) {
    if (!mimeType) return '.jpg';
    
    const extensions = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg'
    };
    return extensions[mimeType] || '.jpg';
  }

  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  extractImagesFromHTML(html) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const images = [];
    
    $('img').each((i, elem) => {
      const src = $(elem).attr('src');
      const alt = $(elem).attr('alt') || '';
      const width = $(elem).attr('width');
      const height = $(elem).attr('height');
      
      if (src) {
        images.push({
          src,
          alt,
          width: width ? parseInt(width) : null,
          height: height ? parseInt(height) : null
        });
      }
    });
    
    return images;
  }

  rewriteImageURLs(html, urlMap) {
    let rewrittenHTML = html;
    
    for (const [oldUrl, newUrl] of Object.entries(urlMap)) {
      // Replace all occurrences of the old URL
      rewrittenHTML = rewrittenHTML.replace(new RegExp(oldUrl, 'g'), newUrl);
    }
    
    return rewrittenHTML;
  }
}

module.exports = MediaHandler;
