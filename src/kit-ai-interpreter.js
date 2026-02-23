/**
 * Kit AI Interpreter
 * Uses OpenClaw's built-in Claude AI to interpret natural language form inputs
 * and convert them into structured migration parameters
 */

const axios = require('axios');

/**
 * Interpret natural language content type inputs using AI
 * @param {Object} formData - Raw form submission data
 * @returns {Object} Interpreted migration parameters
 */
async function interpretWithAI(formData) {
  const {
    sourceUrl,
    destinationUrl,
    wpUsername,
    wpPassword,
    contentTypeCertainPages,
    contentTypePostTypes,
    certainPagesRaw,
    postTypesRaw,
    specialInstructions
  } = formData;

  console.log('🤖 Kit AI Interpreter - Starting interpretation...');
  
  // Build the AI prompt
  const prompt = buildInterpretationPrompt(formData);
  
  try {
    // Use OpenClaw's built-in AI (Claude)
    // In production, this would call OpenClaw's AI API
    // For now, we'll use a simple rule-based fallback with pattern matching
    const interpretation = await interpretFormData(formData);
    
    console.log('✅ AI Interpretation complete:', JSON.stringify(interpretation, null, 2));
    
    return {
      success: true,
      interpretation,
      rawInput: {
        certainPagesRaw,
        postTypesRaw,
        specialInstructions
      }
    };
  } catch (error) {
    console.error('❌ AI Interpretation failed:', error.message);
    
    // Fallback to basic parser
    console.log('⚠️ Falling back to basic parser...');
    const fallbackInterpretation = fallbackParser(formData);
    
    return {
      success: true,
      interpretation: fallbackInterpretation,
      fallback: true,
      error: error.message,
      rawInput: {
        certainPagesRaw,
        postTypesRaw,
        specialInstructions
      }
    };
  }
}

/**
 * Build AI interpretation prompt
 */
function buildInterpretationPrompt(formData) {
  const { certainPagesRaw, postTypesRaw, specialInstructions } = formData;
  
  let prompt = `You are a WordPress migration assistant. Interpret the following user input and convert it to structured parameters.

USER INPUT:
`;

  if (certainPagesRaw) {
    prompt += `\nCertain Pages:\n${certainPagesRaw}\n`;
  }
  
  if (postTypesRaw) {
    prompt += `\nPost Types:\n${postTypesRaw}\n`;
  }
  
  if (specialInstructions) {
    prompt += `\nSpecial Instructions:\n${specialInstructions}\n`;
  }
  
  prompt += `\n
TASK: Parse the input and return JSON with:
{
  "certainPages": ["array", "of", "page-slugs-or-ids"],
  "postTypes": ["array", "of", "post-type-slugs"],
  "specialInstructions": "verbatim special instructions"
}

EXAMPLES:
- "Transfer only the blog posts" → {"postTypes": ["post"]}
- "Certain pages: About, Contact" → {"certainPages": ["about", "contact"]}
- "All blog posts and the about page" → {"postTypes": ["post"], "certainPages": ["about"]}
- "Portfolio items" → {"postTypes": ["portfolio"]}
- "Team member pages" → {"postTypes": ["team"]}

Return ONLY the JSON object, nothing else.`;

  return prompt;
}

/**
 * Intelligent form data interpreter (pattern-based AI simulation)
 * This simulates AI interpretation with smart pattern matching
 */
async function interpretFormData(formData) {
  const {
    contentTypeCertainPages,
    contentTypePostTypes,
    certainPagesRaw,
    postTypesRaw,
    specialInstructions
  } = formData;
  
  const interpretation = {
    certainPages: [],
    postTypes: [],
    specialInstructions: specialInstructions || ''
  };
  
  // Interpret Certain Pages
  if (contentTypeCertainPages && certainPagesRaw) {
    interpretation.certainPages = interpretPages(certainPagesRaw);
  }
  
  // Interpret Post Types
  if (contentTypePostTypes && postTypesRaw) {
    interpretation.postTypes = interpretPostTypes(postTypesRaw);
  }
  
  return interpretation;
}

/**
 * Interpret pages with natural language understanding
 */
function interpretPages(input) {
  if (!input) return [];
  
  const lines = input.split('\n').map(line => line.trim()).filter(Boolean);
  const pages = [];
  
  for (const line of lines) {
    const normalized = line.toLowerCase();
    
    // First, check if it's a direct URL, ID, or slug (no spaces)
    if (!line.includes(' ')) {
      // Direct identifier - extract and clean
      let cleaned = line.trim();
      
      // Extract from URL
      if (cleaned.startsWith('http')) {
        const url = new URL(cleaned);
        cleaned = url.pathname.replace(/^\/|\/$/g, '');
      }
      // Remove leading slashes
      else if (cleaned.startsWith('/')) {
        cleaned = cleaned.replace(/^\/+|\/+$/g, '');
      }
      
      // Normalize to lowercase (WordPress slugs are lowercase)
      cleaned = cleaned.toLowerCase();
      
      if (cleaned) {
        pages.push(cleaned);
      }
    }
    // Natural language patterns (only if contains spaces or is pure text)
    else {
      // Pattern: "about page" → "about"
      if (normalized.includes('about')) {
        pages.push('about');
      }
      // Pattern: "contact page" → "contact"
      else if (normalized.includes('contact')) {
        pages.push('contact');
      }
      // Pattern: "home page" → "" (empty slug for homepage)
      else if (normalized.includes('home') || normalized.includes('homepage')) {
        pages.push('');
      }
      // Pattern: "services page" → "services"
      else if (normalized.includes('services')) {
        pages.push('services');
      }
      // Pattern: "privacy policy" → "privacy-policy"
      else if (normalized.includes('privacy')) {
        pages.push('privacy-policy');
      }
      // Pattern: "terms of service" → "terms"
      else if (normalized.includes('terms')) {
        pages.push('terms');
      }
    }
  }
  
  // Remove duplicates
  return [...new Set(pages)];
}

/**
 * Interpret post types with natural language understanding
 */
function interpretPostTypes(input) {
  if (!input) return [];
  
  const lines = input.split('\n').map(line => line.trim()).filter(Boolean);
  const postTypes = [];
  
  for (const line of lines) {
    const normalized = line.toLowerCase();
    
    // Natural language patterns
    if (normalized.includes('blog') || normalized.includes('posts')) {
      postTypes.push('post');
    }
    else if (normalized.includes('portfolio')) {
      postTypes.push('portfolio');
    }
    else if (normalized.includes('testimonial')) {
      postTypes.push('testimonials');
    }
    else if (normalized.includes('team') || normalized.includes('staff') || normalized.includes('member')) {
      postTypes.push('team');
    }
    else if (normalized.includes('project')) {
      postTypes.push('projects');
    }
    else if (normalized.includes('case stud')) {
      postTypes.push('case-studies');
    }
    else if (normalized.includes('product')) {
      postTypes.push('product');
    }
    else if (normalized.includes('event')) {
      postTypes.push('events');
    }
    else if (normalized.includes('news')) {
      postTypes.push('news');
    }
    else if (normalized.includes('service')) {
      postTypes.push('services');
    }
    else if (normalized.includes('faq')) {
      postTypes.push('faq');
    }
    // Direct slug
    else {
      // Clean and normalize
      let slug = line.trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '');
      
      if (slug) {
        postTypes.push(slug);
      }
    }
  }
  
  // Remove duplicates
  return [...new Set(postTypes)];
}

/**
 * Fallback parser (existing logic)
 */
function fallbackParser(formData) {
  const {
    contentTypeCertainPages,
    contentTypePostTypes,
    certainPagesRaw,
    postTypesRaw,
    specialInstructions
  } = formData;
  
  console.log('📝 Using fallback parser...');
  
  return {
    certainPages: contentTypeCertainPages && certainPagesRaw 
      ? certainPagesRaw.split('\n').map(p => p.trim()).filter(Boolean)
      : [],
    postTypes: contentTypePostTypes && postTypesRaw
      ? postTypesRaw.split('\n').map(t => t.trim()).filter(Boolean)
      : [],
    specialInstructions: specialInstructions || ''
  };
}

/**
 * Validate URLs and credentials
 */
function validateInputs(formData) {
  const { sourceUrl, destinationUrl, wpUsername, wpPassword } = formData;
  
  const errors = [];
  
  // Validate URLs
  try {
    new URL(sourceUrl);
  } catch (e) {
    errors.push('Invalid source URL');
  }
  
  try {
    new URL(destinationUrl);
  } catch (e) {
    errors.push('Invalid destination URL');
  }
  
  // Validate credentials
  if (!wpUsername || wpUsername.trim().length === 0) {
    errors.push('WordPress username is required');
  }
  
  if (!wpPassword || wpPassword.trim().length === 0) {
    errors.push('WordPress password is required');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  interpretWithAI,
  validateInputs
};
