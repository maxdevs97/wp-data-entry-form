#!/bin/bash
#
# End-to-End Test for WordPress Migration Fixes
# Tests the complete flow from form submission to job completion
#

set -e

echo "🧪 WordPress Migration Framework - End-to-End Test"
echo "=================================================="
echo ""

# Configuration
BASE_URL="https://wp-data-entry-form-6u5hz.ondigitalocean.app"
SOURCE_URL="https://mybabyswims.com"
DEST_URL="https://mbstest3.sherstaging.com"
PASSWORD="${FORM_PASSWORD:-test123}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📋 Test Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Source: $SOURCE_URL"
echo "  Destination: $DEST_URL"
echo ""

# Test 1: Health check
echo "Test 1: Health Check"
echo "--------------------"
HEALTH=$(curl -s "$BASE_URL/api/health" || echo "FAIL")
if [[ "$HEALTH" == *"ok"* ]]; then
  echo -e "${GREEN}✅ Health check passed${NC}"
else
  echo -e "${RED}❌ Health check failed${NC}"
  exit 1
fi
echo ""

# Test 2: Password verification
echo "Test 2: Password Verification"
echo "-----------------------------"
PASSWORD_CHECK=$(curl -s -X POST "$BASE_URL/api/verify-password" \
  -H "Content-Type: application/json" \
  -d "{\"password\": \"$PASSWORD\"}" || echo "FAIL")

if [[ "$PASSWORD_CHECK" == *"valid"* ]]; then
  echo -e "${GREEN}✅ Password verification passed${NC}"
else
  echo -e "${RED}❌ Password verification failed${NC}"
  echo "  Response: $PASSWORD_CHECK"
  exit 1
fi
echo ""

# Test 3: Submit migration with natural language post types
echo "Test 3: Submit Migration (Natural Language Post Types)"
echo "-----------------------------------------------------"
echo "  Post types: 'blog posts only' (should parse to 'post')"
echo ""

SUBMIT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/submit" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "'"$PASSWORD"'",
    "sourceUrl": "'"$SOURCE_URL"'",
    "destinationUrl": "'"$DEST_URL"'",
    "wpUsername": "admin",
    "wpPassword": "test password",
    "contentTypeCertainPages": false,
    "contentTypePostTypes": true,
    "certainPages": [],
    "postTypes": ["blog posts only"],
    "specialInstructions": "Test migration - natural language post types",
    "preserve": {
      "slug": true,
      "headingStructures": true,
      "title": true,
      "featuredImages": true,
      "bodyContent": true,
      "categories": true,
      "tags": true,
      "publicationDate": true,
      "author": true,
      "seoMetadata": true,
      "internalLinks": true
    }
  }' || echo "FAIL")

echo "Response:"
echo "$SUBMIT_RESPONSE" | jq '.' 2>/dev/null || echo "$SUBMIT_RESPONSE"
echo ""

if [[ "$SUBMIT_RESPONSE" == *"jobId"* ]]; then
  JOB_ID=$(echo "$SUBMIT_RESPONSE" | jq -r '.jobId' 2>/dev/null || echo "")
  
  if [ -n "$JOB_ID" ]; then
    echo -e "${GREEN}✅ Migration submitted successfully${NC}"
    echo "  Job ID: $JOB_ID"
  else
    echo -e "${RED}❌ Could not extract job ID${NC}"
    exit 1
  fi
else
  echo -e "${RED}❌ Migration submission failed${NC}"
  echo "  Response: $SUBMIT_RESPONSE"
  exit 1
fi
echo ""

# Test 4: Check job status
echo "Test 4: Job Status Check"
echo "------------------------"
echo "  Checking status for: $JOB_ID"
echo ""

sleep 2

STATUS_RESPONSE=$(curl -s "$BASE_URL/api/status/$JOB_ID" || echo "FAIL")

echo "Status:"
echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
echo ""

if [[ "$STATUS_RESPONSE" == *"job"* ]] && [[ "$STATUS_RESPONSE" != *"not found"* ]]; then
  echo -e "${GREEN}✅ Job status retrieved${NC}"
  
  # Check for "Invalid Date" error
  if [[ "$STATUS_RESPONSE" == *"Invalid Date"* ]]; then
    echo -e "${RED}❌ 'Invalid Date' error found in response${NC}"
    exit 1
  else
    echo -e "${GREEN}✅ No 'Invalid Date' errors${NC}"
  fi
else
  echo -e "${RED}❌ Job status check failed${NC}"
  exit 1
fi
echo ""

# Test 5: Verify post type was parsed correctly
echo "Test 5: Post Type Parsing Verification"
echo "--------------------------------------"

# Check if the job was created with the correct content type
# This would require checking the Google Sheets or job logs
# For now, we'll just verify the submission was accepted

echo -e "${YELLOW}⚠️  Manual verification required:${NC}"
echo "  1. Check Google Sheets Jobs tab"
echo "  2. Verify content type shows 'post', not 'blog posts only'"
echo "  3. Check if extraction found posts from mybabyswims.com"
echo ""

# Summary
echo "=================================================="
echo "🎉 End-to-End Test Summary"
echo "=================================================="
echo -e "${GREEN}✅ Health check${NC}"
echo -e "${GREEN}✅ Password verification${NC}"
echo -e "${GREEN}✅ Migration submission${NC}"
echo -e "${GREEN}✅ Job status retrieval${NC}"
echo -e "${GREEN}✅ No 'Invalid Date' errors${NC}"
echo ""
echo "Job URL: $BASE_URL/status?jobId=$JOB_ID"
echo ""
echo -e "${GREEN}All automated tests passed!${NC}"
echo ""
echo "Next steps:"
echo "  1. Monitor job progress at the URL above"
echo "  2. Verify post type parsing in Google Sheets"
echo "  3. Check if migration extracts content successfully"
echo ""
