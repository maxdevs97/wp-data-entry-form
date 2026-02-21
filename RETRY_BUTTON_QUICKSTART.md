# Retry Button - Quick Start Guide

## For End Users

### When You'll See It
The **"🔄 Retry Migration"** button appears on the status page when a migration fails.

### How to Use It
1. View your failed migration on the status page
2. Review the error details to understand what went wrong
3. Click the **"Retry Migration"** button
4. You'll be redirected to a new status page showing the retry in progress
5. The retry uses the exact same settings as the original migration

### What Gets Preserved
✅ Source URL
✅ Destination URL  
✅ WordPress credentials
✅ Selected post types
✅ Selected pages
✅ Content preservation settings (slugs, dates, authors)
✅ Special instructions

### Important Notes
- You don't need to re-enter any information
- Each retry creates a new job ID for tracking
- The original failed job remains in the logs for reference
- Retry is instant - no waiting or extra steps

---

## For Developers

### Quick Test
```bash
# 1. Navigate to project directory
cd /Users/max/.openclaw/workspace-forge/wp-data-entry-form

# 2. Run test script
NODE_ENV=production \
  GOOGLE_CREDENTIALS_PATH=/Users/max/.openclaw/workspace-forge/.env.google-service-account.json \
  GOOGLE_SHEET_ID=1_2ojO0QAtYiHVHGv1EGOoUi5i9Ady7ey4tJUEYAfXpk \
  node test-retry-button.js
```

### Manual Testing
```bash
# 1. Start the server
npm start

# 2. Open browser to failed job status page
# Example: http://localhost:3000/status?jobId=job-123-failed

# 3. Click retry button

# 4. Verify redirect to new job
# Should see: http://localhost:3000/status?jobId=job-456-retry
```

### API Endpoint
```bash
curl -X POST http://localhost:3000/api/retry \
  -H "Content-Type: application/json" \
  -d '{"jobId": "job-1234567890-abc123"}'
```

**Response (success):**
```json
{
  "success": true,
  "message": "Retry migration created successfully",
  "newJobId": "job-1234567899-xyz789",
  "originalJobId": "job-1234567890-abc123"
}
```

**Response (error - job not found):**
```json
{
  "error": "Original job not found"
}
```

**Response (error - wrong status):**
```json
{
  "error": "Can only retry failed jobs",
  "currentStatus": "complete"
}
```

---

## For Support Team

### Common Scenarios

#### Scenario 1: User reports retry button missing
**Check:**
- Is the job status "failed" or "error"?
- Is the user on the correct status page URL?
- Check browser console for JavaScript errors

**Fix:**
- Verify job status in Google Sheets (Jobs tab)
- If status is different, button won't show (by design)

#### Scenario 2: Retry button clicked but nothing happens
**Check:**
- Browser console for errors
- Network tab for failed API calls
- Server logs for `/api/retry` errors

**Fix:**
- Check Google credentials are valid
- Verify Google Sheet is accessible
- Check job exists in Sheets

#### Scenario 3: Retry created but settings changed
**Check:**
- Original job submissionData in Google Sheets
- Compare with retry job submissionData

**Fix:**
- If data missing in original, retry can't preserve it
- User may need to submit manually with correct settings

---

## Troubleshooting

### Button Not Visible
✅ Expected: Only shows for failed/error jobs
❌ Check: Job status in database
🔧 Fix: Verify job truly failed

### Button Click Does Nothing
✅ Check browser console for errors
✅ Check network tab for API call
❌ Possible: JavaScript error or CORS issue
🔧 Fix: Check status.js loaded correctly

### Retry Creates Job But Settings Lost
✅ Check original job has complete submissionData
❌ Possible: Original job corrupted or incomplete
🔧 Fix: May need manual resubmission

### API Returns 404
✅ Check job ID is correct
✅ Check job exists in Google Sheets
❌ Possible: Job deleted or expired
🔧 Fix: Cannot retry deleted job

---

## Architecture

```
┌─────────────────┐
│  Failed Job     │
│  status.html    │
└────────┬────────┘
         │
         │ User clicks "Retry" button
         │
         ▼
┌─────────────────┐
│  status.js      │
│  handleRetry()  │
└────────┬────────┘
         │
         │ POST /api/retry { jobId }
         │
         ▼
┌─────────────────┐
│  server.js      │
│  /api/retry     │
└────────┬────────┘
         │
         │ jobManager.getJob(jobId)
         │
         ▼
┌─────────────────┐
│  Google Sheets  │
│  Retrieve Job   │
└────────┬────────┘
         │
         │ Original submission data
         │
         ▼
┌─────────────────┐
│  jobManager     │
│  .createJob()   │
└────────┬────────┘
         │
         │ New job with same params
         │
         ▼
┌─────────────────┐
│  processJob()   │
│  Background     │
└────────┬────────┘
         │
         │ Returns newJobId
         │
         ▼
┌─────────────────┐
│  Frontend       │
│  Redirect       │
└────────┬────────┘
         │
         │ window.location = /status?jobId={new}
         │
         ▼
┌─────────────────┐
│  New Job        │
│  Status Page    │
└─────────────────┘
```

---

## Files Modified

### Frontend
- `/public/status.html` - Added retry button to error section
- `/public/status.js` - Added handleRetry() function and event handlers

### Backend
- `/src/server.js` - Added POST /api/retry endpoint

### Testing
- `/test-retry-button.js` - Unit test for retry functionality

### Documentation
- `/RETRY_BUTTON_IMPLEMENTATION.md` - Full technical documentation
- `/RETRY_BUTTON_QUICKSTART.md` - This quick start guide

---

## Deployment Checklist

- [x] Code changes completed
- [x] Unit tests passing
- [x] Manual testing completed
- [x] Documentation written
- [ ] Code reviewed
- [ ] Deployed to staging
- [ ] QA testing on staging
- [ ] Deployed to production
- [ ] Verified on production
- [ ] Team notified

---

**Last Updated:** February 20, 2026
**Status:** ✅ Ready for Deployment
