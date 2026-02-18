const axios = require('axios');

/**
 * Validate form submission data
 */
function validateRequest(data) {
  const {
    requesterName,
    requesterEmail,
    sourceUrl,
    destinationUrl,
    wpUsername,
    wpPassword,
    contentType
  } = data;

  // Required fields
  if (!requesterName || requesterName.trim().length === 0) {
    return { valid: false, error: 'Requester name is required' };
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!requesterEmail || !emailRegex.test(requesterEmail)) {
    return { valid: false, error: 'Valid email address is required' };
  }

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
    return { valid: false, error: 'WordPress password is required' };
  }

  // Content type
  const validContentTypes = ['blog posts', 'products', 'pages', 'all'];
  if (!contentType || !validContentTypes.includes(contentType.toLowerCase())) {
    return { valid: false, error: 'Valid content type is required' };
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
    // Clean URL
    const baseUrl = url.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/wp-json/wp/v2/users/me`;

    // Test authentication
    const response = await axios.get(apiUrl, {
      auth: {
        username,
        password
      },
      timeout: 10000,
      validateStatus: (status) => status < 500 // Accept 401/403 as valid responses
    });

    if (response.status === 200) {
      return { 
        valid: true, 
        message: 'WordPress connection successful',
        user: response.data.name
      };
    } else if (response.status === 401 || response.status === 403) {
      return { 
        valid: false, 
        error: 'Authentication failed. Please check username and password.' 
      };
    } else {
      return { 
        valid: false, 
        error: `Unexpected response from WordPress (${response.status})` 
      };
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return { 
        valid: false, 
        error: 'Cannot connect to WordPress site. Please check the URL.' 
      };
    }
    
    if (error.response && error.response.status === 401) {
      return { 
        valid: false, 
        error: 'Authentication failed. Please check username and password.' 
      };
    }

    return { 
      valid: false, 
      error: error.message || 'Failed to connect to WordPress REST API' 
    };
  }
}

module.exports = {
  validateRequest,
  testWPConnection
};
