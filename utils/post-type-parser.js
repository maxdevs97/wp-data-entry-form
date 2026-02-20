/**
 * Parse natural language post type descriptions to WordPress post type slugs
 * 
 * Handles user input like:
 * - "blog posts" → "post"
 * - "pages" → "page"
 * - "portfolio items" → "portfolio"
 * - "team member profiles" → "team"
 * 
 * Also handles technical slugs directly:
 * - "post" → "post"
 * - "portfolio" → "portfolio"
 */

const COMMON_POST_TYPE_MAPPINGS = {
  // Standard WordPress types
  'post': 'post',
  'posts': 'post',
  'blog post': 'post',
  'blog posts': 'post',
  'blog': 'post',
  'article': 'post',
  'articles': 'post',
  
  'page': 'page',
  'pages': 'page',
  'static page': 'page',
  'static pages': 'page',
  
  // Common custom post types
  'portfolio': 'portfolio',
  'portfolio item': 'portfolio',
  'portfolio items': 'portfolio',
  'portfolio piece': 'portfolio',
  'portfolio pieces': 'portfolio',
  'project': 'portfolio',
  'projects': 'portfolio',
  
  'testimonial': 'testimonial',
  'testimonials': 'testimonial',
  'review': 'testimonial',
  'reviews': 'testimonial',
  'client review': 'testimonial',
  'client reviews': 'testimonial',
  
  'team': 'team',
  'team member': 'team',
  'team members': 'team',
  'team member profile': 'team',
  'team member profiles': 'team',
  'staff': 'team',
  'staff member': 'team',
  'staff members': 'team',
  
  'event': 'event',
  'events': 'event',
  
  'product': 'product',
  'products': 'product',
  'woocommerce product': 'product',
  'shop item': 'product',
  
  'service': 'service',
  'services': 'service',
  
  'faq': 'faq',
  'faqs': 'faq',
  'frequently asked question': 'faq',
  'frequently asked questions': 'faq',
  
  'case study': 'case_study',
  'case studies': 'case_study',
  
  'news': 'news',
  'news item': 'news',
  'news items': 'news'
};

/**
 * Extract post type slug from natural language or technical input
 */
function parsePostType(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }
  
  // Normalize: lowercase, trim, remove extra whitespace
  let normalized = input.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Empty string after trim
  if (!normalized) {
    return null;
  }
  
  // Remove common qualifiers that don't change meaning
  normalized = normalized
    .replace(/^all\s+/, '')        // "all blog posts" → "blog posts"
    .replace(/\s+only$/, '')       // "blog posts only" → "blog posts"
    .replace(/^just\s+/, '')       // "just pages" → "pages"
    .replace(/^the\s+/, '')        // "the portfolio" → "portfolio"
    .replace(/\s+type$/, '')       // "post type" → "post"
    .replace(/\s+content$/, '');   // "blog content" → "blog"
  
  // Check direct mapping
  if (COMMON_POST_TYPE_MAPPINGS[normalized]) {
    return COMMON_POST_TYPE_MAPPINGS[normalized];
  }
  
  // Try removing trailing 's' (plurals)
  const singular = normalized.replace(/s$/, '');
  if (COMMON_POST_TYPE_MAPPINGS[singular]) {
    return COMMON_POST_TYPE_MAPPINGS[singular];
  }
  
  // If it looks like a technical slug (lowercase, no spaces, maybe underscores/hyphens),
  // use it directly
  if (/^[a-z0-9_-]+$/.test(normalized)) {
    return normalized;
  }
  
  // Last resort: extract first word and use as slug
  // "team member profiles" → "team"
  // "portfolio items" → "portfolio"
  const firstWord = normalized.split(' ')[0];
  
  // Check if first word is mapped
  if (COMMON_POST_TYPE_MAPPINGS[firstWord]) {
    return COMMON_POST_TYPE_MAPPINGS[firstWord];
  }
  
  // Convert to slug format (lowercase, replace spaces with underscores)
  return firstWord.replace(/[^a-z0-9]/g, '_');
}

/**
 * Parse multiple post type inputs (from textarea)
 */
function parsePostTypes(inputs) {
  if (!Array.isArray(inputs)) {
    return [];
  }
  
  const postTypes = new Set();
  
  for (const input of inputs) {
    const parsed = parsePostType(input);
    if (parsed) {
      postTypes.add(parsed);
    }
  }
  
  return Array.from(postTypes);
}

module.exports = {
  parsePostType,
  parsePostTypes,
  COMMON_POST_TYPE_MAPPINGS
};
