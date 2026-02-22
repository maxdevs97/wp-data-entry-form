const axios = require('axios');

class WordPressAPIClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiType = config.api_type || 'rest';
    this.baseURL = config.url;
    
    // Setup axios instance with auth
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: this.getAuthHeaders()
    });

    // Add retry logic
    this.client.interceptors.response.use(
      response => response,
      async error => {
        const config = error.config;
        if (!config || !config.retry) {
          config.retry = 0;
        }
        
        if (config.retry < 3 && this.shouldRetry(error)) {
          config.retry += 1;
          this.logger.warn(`Retrying request (attempt ${config.retry}/3)`, {
            url: config.url,
            error: error.message
          });
          await this.sleep(1000 * config.retry); // Exponential backoff
          return this.client(config);
        }
        
        return Promise.reject(error);
      }
    );
  }

  getAuthHeaders() {
    const auth = this.config.auth;
    
    // Handle case where auth is not provided (public API access)
    if (!auth || !auth.method || auth.method === 'none') {
      return {
        'Content-Type': 'application/json'
      };
    }
    
    if (auth.method === 'application_password') {
      const token = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      return {
        'Authorization': `Basic ${token}`,
        'Content-Type': 'application/json'
      };
    } else if (auth.method === 'jwt') {
      return {
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json'
      };
    }
    
    return {
      'Content-Type': 'application/json'
    };
  }

  shouldRetry(error) {
    // Retry on network errors or 5xx server errors
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async get(endpoint, params = {}) {
    try {
      const response = await this.client.get(endpoint, { params });
      return response.data;
    } catch (error) {
      this.logger.error(`GET request failed: ${endpoint}`, {
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  }

  async post(endpoint, data) {
    try {
      const response = await this.client.post(endpoint, data);
      return response.data;
    } catch (error) {
      this.logger.error(`POST request failed: ${endpoint}`, {
        error: error.message,
        status: error.response?.status,
        details: error.response?.data
      });
      throw error;
    }
  }

  async put(endpoint, data) {
    try {
      const response = await this.client.put(endpoint, data);
      return response.data;
    } catch (error) {
      this.logger.error(`PUT request failed: ${endpoint}`, {
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  }

  async delete(endpoint) {
    try {
      const response = await this.client.delete(endpoint);
      return response.data;
    } catch (error) {
      this.logger.error(`DELETE request failed: ${endpoint}`, {
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  }

  // GraphQL support
  async graphql(query, variables = {}) {
    if (this.apiType !== 'graphql') {
      throw new Error('GraphQL not configured for this site');
    }
    
    const endpoint = this.config.graphql_endpoint || '/graphql';
    
    try {
      const response = await this.post(endpoint, {
        query,
        variables
      });
      
      if (response.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
      }
      
      return response.data;
    } catch (error) {
      this.logger.error('GraphQL query failed', {
        error: error.message,
        query: query.substring(0, 100)
      });
      throw error;
    }
  }

  // REST API helpers
  async getPosts(params = {}) {
    const endpoint = this.config.rest_endpoint + '/posts';
    return this.get(endpoint, { per_page: 100, ...params });
  }

  async getPost(id) {
    const endpoint = this.config.rest_endpoint + `/posts/${id}`;
    return this.get(endpoint, { context: 'edit' });
  }

  async createPost(data) {
    const endpoint = this.config.rest_endpoint + '/posts';
    return this.post(endpoint, data);
  }

  async updatePost(id, data) {
    const endpoint = this.config.rest_endpoint + `/posts/${id}`;
    return this.post(endpoint, data);
  }

  async getPages(params = {}) {
    const endpoint = this.config.rest_endpoint + '/pages';
    return this.get(endpoint, { per_page: 100, ...params });
  }

  async getMedia(params = {}) {
    const endpoint = this.config.rest_endpoint + '/media';
    return this.get(endpoint, { per_page: 100, ...params });
  }

  async uploadMedia(file, filename, mimeType) {
    const endpoint = this.config.rest_endpoint + '/media';
    
    try {
      const response = await this.client.post(endpoint, file, {
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
      return response.data;
    } catch (error) {
      this.logger.error('Media upload failed', {
        filename,
        error: error.message
      });
      throw error;
    }
  }

  async getCategories(params = {}) {
    const endpoint = this.config.rest_endpoint + '/categories';
    return this.get(endpoint, { per_page: 100, ...params });
  }

  async getTags(params = {}) {
    const endpoint = this.config.rest_endpoint + '/tags';
    return this.get(endpoint, { per_page: 100, ...params });
  }
}

module.exports = WordPressAPIClient;
