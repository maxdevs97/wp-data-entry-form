# Testing Guide - Real WordPress Migration Framework

## Quick Verification Checklist

### ✅ Issue #1: Job ID in URL
**Status:** Already working - no changes needed

**Test Steps:**
1. Go to https://wp-data-entry-form-6u5hz.ondigitalocean.app
2. Login with form password
3. Fill out and submit a migration request
4. **Verify:** URL changes to `/status?jobId=xxxxx`
5. **Verify:** Copy URL and open in new tab - should show same job
6. **Verify:** Refresh page - job still loads

**Expected Result:** ✅ Job ID persists in URL and is shareable

---

### ✅ Issue #2: Real Migration Framework
**Status:** Fully integrated and deployed

**Test Steps:**

#### Test 1: Simple Page Migration (Recommended First Test)
```
1. Login to form
2. Fill in:
   Source URL: https://your-source-site.com
   Destination URL: https://your-destination-site.com
   WP Username: admin
   WP Password: [Application Password - NOT regular password]
   Content Type: ☑ Certain Pages
   Pages to Migrate:
     /about-us
     /contact
   Preserve all settings: ☑ (check all boxes)

3. Submit
4. Watch progress bar - should show 5 stages:
   - Stage 0: Backup (5%)
   - Stage 1: Extraction (10-30%)
   - Stage 2: Transformation (35-45%)
   - Stage 3: Insertion (45-80%)
   - Stage 4: Verification (85-95%)
   - Stage 5: Complete (100%)

5. Verify results:
   ☐ Real page titles appear (not "Post 1", "Post 2")
   ☐ Source URLs are actual page URLs
   ☐ Destination URLs are actual migrated URLs
   ☐ Click links - they should work
   ☐ Backup info is shown
```

**Expected Result:** ✅ Real content migrated with actual URLs

---

#### Test 2: Post Type Migration
```
1. Fill in form:
   Content Type: ☑ Post Types
   Post Types:
     post
     page
   
2. Submit and wait
3. Verify:
   ☐ Progress shows real item counts (e.g., "15 / 32 items")
   ☐ Stage messages update ("Extracting posts...", "Inserting item 5 of 32...")
   ☐ Results table shows all posts/pages
   ☐ Each row has real title and URLs
```

**Expected Result:** ✅ All posts and pages migrated with real data

---

#### Test 3: Error Handling
```
1. Submit form with WRONG credentials
2. Verify:
   ☐ Job starts
   ☐ Error appears during extraction stage
   ☐ Job status changes to "failed"
   ☐ Error details shown in UI
   ☐ Error message is helpful (not generic)
```

**Expected Result:** ✅ Graceful error handling with clear messages

---

## How to Get WordPress Application Password

**Important:** WordPress Application Passwords are different from regular WordPress passwords!

### Steps:
1. Login to WordPress admin
2. Go to **Users → Profile**
3. Scroll to **Application Passwords** section
4. Enter an app name (e.g., "Migration Tool")
5. Click **Add New Application Password**
6. **Copy the generated password** (format: `xxxx xxxx xxxx xxxx xxxx xxxx`)
7. Use this password in the form (keep spaces or remove them, both work)

**Note:** If you don't see "Application Passwords" section, your WordPress version may not support it. Upgrade to WordPress 5.6+ or use a plugin like "Application Passwords".

---

## Debugging

### Check Logs
Logs are stored on the server:
```bash
# SSH into DigitalOcean droplet or check build logs
tail -f logs/{jobId}/migration-*.log
```

### Check Job Status
Via API:
```bash
curl https://wp-data-entry-form-6u5hz.ondigitalocean.app/api/job-status/{jobId}
```

### Common Issues

**"Job not found"**
- URL parameter might be incorrect
- Job might not have been created
- Check server logs

**"Authentication failed"**
- NOT using Application Password (using regular password instead)
- Username is incorrect
- REST API is disabled on WordPress

**"No content extracted"**
- Content filters too restrictive (e.g., specifying pages that don't exist)
- Source site is not accessible
- Credentials don't have permission to read content

**"Network timeout"**
- Source or destination site is slow
- Framework will retry automatically (3 attempts)
- Check network connectivity

**"Backup failed"**
- This is non-critical - migration will continue
- Backup requires database access
- Check destination WordPress has proper permissions

---

## What to Look For (Success Indicators)

### ✅ Good Signs
- Progress bar updates smoothly through all 5 stages
- Stage messages are specific (not generic)
- Item counts increase (e.g., "5 / 32", "10 / 32", "15 / 32")
- Results table has real post titles (not "Post 1")
- Source and destination URLs are clickable and work
- Backup info is displayed
- Duration is reasonable (2-10 minutes for small migrations)

### ❌ Red Flags
- Progress stuck at 0%
- Generic error messages ("An error occurred")
- Mock data in results ("Post 1", "Post 2", etc.)
- Fake URLs (e.g., "example.com/post-1")
- No backup info shown
- Duration is instant (< 5 seconds)

---

## Performance Expectations

| Content Amount | Expected Duration |
|----------------|-------------------|
| 1-10 items | 30 seconds - 2 minutes |
| 11-50 items | 2 - 5 minutes |
| 51-100 items | 5 - 10 minutes |
| 101-500 items | 10 - 30 minutes |
| 500+ items | 30+ minutes |

**Note:** Duration depends on:
- Content size (word count, images)
- Network speed
- Server resources
- Media file sizes

---

## Rollback / Restore

If migration has issues:

1. Click **Restore Backup** button in results screen
2. Confirm restoration
3. Wait for process to complete
4. Verify content is back to pre-migration state

**Warning:** Restore will UNDO all migration changes. Cannot be undone.

---

## Deployment Status

**Live URL:** https://wp-data-entry-form-6u5hz.ondigitalocean.app

**GitHub Repo:** https://github.com/maxdevs97/wp-data-entry-form

**Deployment:** Auto-deploy from GitHub main branch

**Last Deploy:** 2026-02-20 (Migration Framework Integration)

**Build Status:** Check DigitalOcean dashboard for deployment progress

---

## Support

**Logs Location:**
- Server: `./logs/{jobId}/`
- Local: `/Users/max/.openclaw/workspace-forge/wp-data-entry-form/logs/`

**Backup Location:**
- Server: `./backups/{jobId}/`
- Local: `/Users/max/.openclaw/workspace-forge/wp-data-entry-form/backups/`

**QA Reports:**
- Server: `./qa-reports/{jobId}/`
- Local: `/Users/max/.openclaw/workspace-forge/wp-data-entry-form/qa-reports/`

**GitHub Issues:** https://github.com/maxdevs97/wp-data-entry-form/issues

---

## Next Steps After Testing

1. ✅ Verify Job ID in URL works
2. ✅ Verify real content migration works
3. ✅ Test error handling
4. ✅ Test with real WordPress sites
5. 📝 Document any issues found
6. 🔄 Iterate based on feedback
7. 📊 Monitor production usage
8. 🎉 Celebrate successful migration!

---

**Ready to test?** Start with Test 1 (Simple Page Migration) above! 🚀
