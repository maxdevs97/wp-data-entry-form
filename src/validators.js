const axios = require('axios');

/**
 * Validate form submission data
 */
function validateRequest(data) {
  const {
    sourceUrl,
    destinationUrl,
    wpUsername,
    wpPassword,
    contentTypeCertainPages,
    contentTypePostTypes,
    certainPages,
    postTypes
  } = data;

  // URL validation
  const urlRegex = /^https?:\/\/.+/i;
  if (!sourceUrl || !urlRegex.test(sourceUrl)) {
    return { valid: false, error: 'Valid source URL is required (must start with http:// or https://)' };
  }
  if (!destinationUrl || !urlRegex.test(destinationUrl)) {
    return { valid: false, error: 'Valid destination URL is required (must start with http:// or https://)' };
  }

  // WordPress credentials
  if (!wpUsername || wpUsername.trim().length === 0) {
    return { valid: false, error: 'WordPress username is required' };
  }
  if (!wpPassword || wpPassword.trim().length === 0) {
    return { valid: false, error: 'WordPress Application Password is required' };
  }

  // Content type validation
  if (!contentTypeCertainPages && !contentTypePostTypes) {
    return { valid: false, error: 'At least one content type must be selected' };
  }
  
  if (contentTypeCertainPages && (!certainPages || certainPages.length === 0)) {
    return { valid: false, error: 'Please specify at least one page when "Certain Pages" is selected' };
  }
  
  if (contentTypePostTypes && (!postTypes || postTypes.length === 0)) {
    return { valid: false, error: 'Please specify at least one post type when "Post Types" is selected' };
  }

  // XSS protection - basic sanitization check
  const dangerousPatterns = /<script|javascript:|onerror=|onload=/i;
  const allValues = Object.values(data).join(' ');
  if (dangerousPatterns.test(allValues)) {
    return { valid: false, error: 'Invalid characters detected in submission' };
  }

  return { valid: true };
}

/**
 * Test WordPress REST API connection
 */
async function testWPConnection(url, username, password) {
  try {
    // Clean URL - remove trailing slash and ensure proper format
    let baseUrl = url.trim().replace(/\/$/, '');
    
    // Ensure URL has protocol
    if (!baseUrl.match(/^https?:\/\//i)) {
      baseUrl = `https://${baseUrl}`;
    }

    // Try multiple REST API endpoints (some sites use different paths)
    const endpoints = [
      `${baseUrl}/wp-json/wp/v2/users/me`,
      `${baseUrl}/wp-json/wp/v2/posts?per_page=1`,
      `${baseUrl}/index.php/wp-json/wp/v2/users/me`
    ];

    let lastError = null;

    for (const apiUrl of endpoints) {
      try {
        console.log(`Testing WordPress connection: ${apiUrl}`);
        
        // Test authentication with Application Password format
        const authPassword = password.replace(/\s+/g, ''); // Remove spaces from app password
        
        const response = await axios.get(apiUrl, {
          auth: {
            username,
            password: authPassword
          },
          timeout: 15000,
          maxRedirects: 5,
          validateStatus: (status) => status < 500,
          headers: {
            'User-Agent': 'WP-Migration-Tool/1.0'
          }
        });

        if (response.status === 200) {
          console.log(`✅ WordPress connection successful via ${apiUrl}`);
          return { 
            valid: true, 
            message: 'WordPress connection successful',
            endpoint: apiUrl,
            user: response.data.name || response.data[0]?.author || 'Connected'
          };
        } else if (response.status === 401 || response.status === 403) {
          lastError = 'Authentication failed. Please verify your WordPress username and Application Password.';
        } else {
          lastError = `WordPress returned status ${response.status}`;
        }
      } catch (endpointError) {
        lastError = endpointError.message;
        // Continue to next endpoint
      }
    }

    // All endpoints failed
    return { 
      valid: false, 
      error: lastError || 'Cannot connect to WordPress REST API' 
    };

  } catch (error) {
    console.error('WordPress connection test error:', error);
    
    if (error.code === 'ECONNREFUSED') {
      return { 
        valid: false, 
        error: 'Connection refused. Please check if the WordPress site is accessible and the URL is correct.' 
      };
    }
    
    if (error.code === 'ENOTFOUND') {
      return { 
        valid: false, 
        error: 'Domain not found. Please check the URL is correct and the site exists.' 
      };
    }
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return { 
        valid: false, 
        error: 'Connection timeout. The WordPress site may be slow or unreachable.' 
      };
    }
    
    if (error.response && error.response.status === 401) {
      return { 
        valid: false, 
        error: 'Authentication failed. Please check your WordPress username and Application Password.' 
      };
    }

    if (error.response && error.response.status === 404) {
      return { 
        valid: false, 
        error: 'WordPress REST API not found. Please verify the URL and ensure WordPress REST API is enabled.' 
      };
    }

    return { 
      valid: false, 
      error: `Connection failed: ${error.message}. Please verify the WordPress site URL and REST API availability.` 
    };
  }
}

module.exports = {
  validateRequest,
  testWPConnection
};
