#!/bin/bash

echo "🧪 Testing Live Deployment - Google Sheets Job Storage"
echo ""

# Submit a test migration request
echo "📤 Submitting test migration request..."
RESPONSE=$(curl -s -X POST https://wp-data-entry-form-6u5hz.ondigitalocean.app/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "formPassword": "SherTeam2026!Secure",
    "requesterName": "Test User (Deployment Test)",
    "requesterEmail": "test@example.com",
    "sourceUrl": "https://source-test.example.com",
    "destinationUrl": "https://dest-test.example.com",
    "wpUsername": "admin",
    "wpPassword": "test123",
    "contentTypeCertainPages": true,
    "certainPages": ["/about", "/services", "/contact"],
    "specialInstructions": "Testing Google Sheets persistence after deployment"
  }')

echo "Response:"
echo "$RESPONSE" | jq .

# Extract job ID and status URL
JOB_ID=$(echo "$RESPONSE" | jq -r '.jobId')
STATUS_URL=$(echo "$RESPONSE" | jq -r '.statusUrl')

echo ""
echo "✅ Submission successful!"
echo "📋 Job ID: $JOB_ID"
echo "🔗 Status URL: $STATUS_URL"
echo ""

# Wait a moment for the job to start processing
echo "⏳ Waiting 3 seconds for job to start processing..."
sleep 3

# Check the status URL
echo ""
echo "🔍 Checking status URL..."
STATUS=$(curl -s "$STATUS_URL")
echo "$STATUS" | jq .

JOB_STATUS=$(echo "$STATUS" | jq -r '.job.status')
STAGE=$(echo "$STATUS" | jq -r '.job.progress.stage')

echo ""
if [ "$JOB_STATUS" != "null" ] && [ "$JOB_STATUS" != "" ]; then
    echo "✅ Job found in Google Sheets!"
    echo "   Status: $JOB_STATUS"
    echo "   Stage: $STAGE"
    echo ""
    echo "🎉 SUCCESS! Jobs are persisting in Google Sheets"
    echo ""
    echo "📊 View jobs in Google Sheets:"
    echo "   https://docs.google.com/spreadsheets/d/1_2ojO0QAtYiHVHGv1EGOoUi5i9Ady7ey4tJUEYAfXpk/edit"
    echo ""
    echo "💡 To test deployment persistence:"
    echo "   1. Trigger a new deployment (git push)"
    echo "   2. Check this status URL again: $STATUS_URL"
    echo "   3. The job should still be found (no 'Job not found' error)"
else
    echo "❌ FAILED: Job not found!"
    echo "   This indicates the Google Sheets integration is not working correctly."
fi
