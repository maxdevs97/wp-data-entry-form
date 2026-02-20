#!/bin/bash

# Test form submission after bug fixes
# Tests both server error fix and checkbox data handling

echo "🧪 Testing WordPress Data Entry Form"
echo "======================================"
echo ""

FORM_URL="https://wp-data-entry-form-6u5hz.ondigitalocean.app"
PASSWORD="${FORM_PASSWORD:-your-password-here}"

# Test 1: Verify password endpoint
echo "Test 1: Verifying password endpoint..."
PASSWORD_RESPONSE=$(curl -s -X POST "${FORM_URL}/api/verify-password" \
  -H "Content-Type: application/json" \
  -d "{\"password\": \"${PASSWORD}\"}")

echo "Response: ${PASSWORD_RESPONSE}"
echo ""

# Test 2: Submit form with preserve checkboxes
echo "Test 2: Submitting form with all data..."
SUBMIT_RESPONSE=$(curl -s -X POST "${FORM_URL}/api/submit" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "'"${PASSWORD}"'",
    "sourceUrl": "https://test-source.com",
    "destinationUrl": "https://test-destination.com",
    "wpUsername": "admin",
    "wpPassword": "test1234test1234",
    "contentTypeCertainPages": true,
    "contentTypePostTypes": false,
    "certainPages": ["about-us", "contact", "/blog/*"],
    "postTypes": [],
    "specialInstructions": "Test submission after bug fixes",
    "preserve": {
      "slug": true,
      "headingStructures": true,
      "title": true,
      "featuredImages": false,
      "bodyContent": true,
      "categories": true,
      "tags": false,
      "publicationDate": true,
      "author": true,
      "seoMetadata": true,
      "internalLinks": true
    }
  }')

echo "Response: ${SUBMIT_RESPONSE}"
echo ""

# Test 3: Check for success/error
if echo "${SUBMIT_RESPONSE}" | grep -q "\"success\":true"; then
  echo "✅ Test PASSED: Form submitted successfully!"
  JOB_ID=$(echo "${SUBMIT_RESPONSE}" | jq -r '.jobId')
  echo "Job ID: ${JOB_ID}"
elif echo "${SUBMIT_RESPONSE}" | grep -q "error"; then
  echo "❌ Test FAILED: Server returned error"
  echo "${SUBMIT_RESPONSE}" | jq '.'
else
  echo "⚠️  Unexpected response"
  echo "${SUBMIT_RESPONSE}"
fi

echo ""
echo "======================================"
echo "Test complete!"
