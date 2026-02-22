#!/usr/bin/env node

const axios = require('axios');

async function testFeaturedImageExtraction() {
  console.log('=== Testing Featured Image Extraction ===\n');
  
  // Get a post from source
  const sourceUrl = 'https://mybabyswims.com';
  const response = await axios.get(`${sourceUrl}/wp-json/wp/v2/posts/1067`);
  const post = response.data;
  
  console.log('Source Post:');
  console.log('  ID:', post.id);
  console.log('  Title:', post.title.rendered);
  console.log('  Featured Media ID:', post.featured_media);
  console.log('  Has featured_media?', post.featured_media > 0);
  console.log('');
  
  if (post.featured_media && post.featured_media > 0) {
    // Fetch the media details
    const mediaResponse = await axios.get(`${sourceUrl}/wp-json/wp/v2/media/${post.featured_media}`);
    const media = mediaResponse.data;
    
    console.log('Featured Media Details:');
    console.log('  Media ID:', media.id);
    console.log('  Title:', media.title.rendered);
    console.log('  Source URL:', media.source_url);
    console.log('  Alt Text:', media.alt_text || '(empty)');
    console.log('  MIME Type:', media.mime_type);
    console.log('');
    
    console.log('✅ Featured image IS present on source and can be extracted');
  } else {
    console.log('❌ No featured image on source post');
  }
}

testFeaturedImageExtraction().catch(console.error);
