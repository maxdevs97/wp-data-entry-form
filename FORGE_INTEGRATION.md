# Forge Integration Guide

This document explains how Forge should run migrations that were submitted via the WordPress Data Entry Form.

## Overview

When a user submits a migration request:
1. Form creates a **Job ID** and stores job metadata
2. Form adds task to Kit's backlog with the Job ID
3. Kit spawns Forge with the Job ID
4. Forge runs migration and updates job status in real-time
5. User sees live progress in the form UI
6. Upon completion, user sees detailed results with source→destination URL mappings

## Running a Migration (Forge)

### Command

```bash
cd /Users/max/.openclaw/workspace-forge/wordpress-migration

node run-migration-with-tracking.js \
  --job-id <jobId> \
  --config <path-to-config.json> \
  --form-api http://localhost:3000
```

### Parameters

- `--job-id` *(required)*: Job ID from the form submission (e.g., `job-1708534800000-abc123`)
- `--config` *(required)*: Path to migration config file
- `--form-api` *(optional)*: Form API URL (default: `http://localhost:3000`)

### Example

```bash
# Kit receives task with jobId: job-1708534800000-abc123
# Kit creates migration config: /tmp/migration-config-abc123.json
# Kit spawns Forge with:

node run-migration-with-tracking.js \
  --job-id job-1708534800000-abc123 \
  --config /tmp/migration-config-abc123.json
```

## Migration Config Template

When Kit receives a migration request, create a config file with these details:

```json
{
  "project_name": "migration-<jobId>",
  "source": {
    "url": "<sourceUrl from form>",
    "auth": {
      "method": "application_password",
      "username": "admin",
      "password": "xxxx xxxx xxxx xxxx"
    },
    "api_type": "rest"
  },
  "destination": {
    "url": "<destinationUrl from form>",
    "auth": {
      "method": "application_password",
      "username": "<wpUsername from form>",
      "password": "<wpPassword from form>"
    },
    "api_type": "rest",
    "wordpress_path": "/var/www/html"
  },
  "backup_settings": {
    "create_backup": true,
    "backup_directory": "./backups"
  },
  "migration_settings": {
    "content_types": ["post", "page"],
    "batch_size": 10,
    "insert_as_draft": false,
    "verify_before_publish": true
  }
}
```

### Handling Form Data

**Content Types:**
- If `contentTypeCertainPages` is checked, extract the `certainPages` array (page slugs/IDs)
- If `contentTypePostTypes` is checked, use the `postTypes` array
- Configure extraction filters accordingly

**Example:**
```javascript
// From form submission:
{
  contentTypeCertainPages: true,
  certainPages: ["about-us", "contact", "services"],
  contentTypePostTypes: true,
  postTypes: ["portfolio", "testimonials"]
}

// Translate to config:
{
  "migration_settings": {
    "content_types": ["page", "portfolio", "testimonials"],
    "specific_pages": ["about-us", "contact", "services"]
  }
}
```

## Job Status Updates

The migration script automatically updates job status. The form polls `/api/job-status/:jobId` every 3 seconds.

### Status Flow

1. **pending** → Job created, waiting to start
2. **running** → Migration is in progress
   - Stage: `backup` → Creating backup
   - Stage: `extracting` → Extracting content from source
   - Stage: `transforming` → Transforming content
   - Stage: `inserting` → Inserting into destination
   - Stage: `verifying` → Running QA checks
3. **complete** → Migration finished successfully
4. **failed** → Migration encountered an error

### Progress Updates

Progress is automatically tracked with:
- `percentComplete` (0-100)
- `itemsProcessed` / `itemsTotal`
- `stage` (current stage name)
- `message` (human-readable status)

Example:
```json
{
  "stage": "inserting",
  "message": "Inserted 47 of 120 items",
  "percentComplete": 65,
  "itemsProcessed": 47,
  "itemsTotal": 120
}
```

## Results Format

Upon completion, the migration script sends results to the form:

```json
{
  "totalMigrated": 120,
  "totalFailed": 0,
  "migratedPosts": [
    {
      "title": "About Us",
      "sourceId": 42,
      "destinationId": 8,
      "sourceUrl": "https://old-site.com/about-us",
      "destinationUrl": "https://new-site.com/about-us",
      "slug": "about-us"
    },
    ...
  ],
  "failedPosts": [],
  "duration": "2m 15s",
  "qaResults": {
    "totalVerified": 120,
    "passed": 118,
    "failed": 2
  }
}
```

## Backup & Restore

### Backup Creation

The migration automatically creates a backup before any writes:
- Database export (WP-CLI)
- Files archive (wp-content directory)
- Metadata stored in job

### Restore Request

If user clicks "Restore Backup" in the form:
1. Form sends restore request to `/api/restore/:jobId`
2. API adds restore task to Kit's backlog
3. Kit spawns Forge to run restore script

### Restore Command

```bash
node scripts/restore-backup.js <backupTimestamp>

# Example:
node scripts/restore-backup.js 20260219-143000
```

### Restore Script

The restore script should:
1. Find backup files in `./backups/backup-<timestamp>/`
2. Import SQL: `wp db import backup-<timestamp>.sql`
3. Extract files: `tar -xzf backup-<timestamp>-files.tar.gz`
4. Verify restoration
5. Update job status (optional)

## Error Handling

If migration fails:
1. Script calls `tracker.fail(error)`
2. Job status → `failed`
3. Error details stored in job
4. User sees error message in form

Kit should:
- Monitor job status
- Alert Max if job status is `failed` after 1 hour
- Include error details in notification

## Testing

### Test Local Setup

1. Start form server:
```bash
cd /Users/max/.openclaw/workspace-forge/wp-data-entry-form
npm start
```

2. Submit test migration via form

3. Check job created:
```bash
ls wp-data-entry-form/jobs/
```

4. Run migration manually:
```bash
cd wordpress-migration
node run-migration-with-tracking.js \
  --job-id job-1708534800000-abc123 \
  --config config/test-migration.json \
  --form-api http://localhost:3000
```

5. Monitor job updates in form UI

### Test Polling

Open browser to: `http://localhost:3000`
Submit a migration request and watch real-time progress updates.

## Deployment

When deploying to production:

1. **Form API URL**: Update `--form-api` to production URL
2. **Job Storage**: Jobs stored in `wp-data-entry-form/jobs/` (persistent volume recommended)
3. **Backup Storage**: Backups in `wordpress-migration/backups/` (ensure sufficient disk space)
4. **Cleanup**: Run job cleanup periodically: `jobManager.cleanOldJobs(30)` (keeps 30 days)

## Environment Variables

Form requires:
```env
PORT=3000
FORM_PASSWORD=your-secret-password
KIT_BACKLOG_PATH=/Users/max/.openclaw/workspace/backlog.md
NODE_ENV=production
```

Migration framework:
```env
# No additional env vars required
# All config passed via JSON file
```

## Monitoring

### Job Status Check

```bash
# Get job status
curl http://localhost:3000/api/job-status/job-1708534800000-abc123
```

### List All Jobs

```javascript
const jobManager = require('./src/jobs');
const jobs = await jobManager.listJobs(50);
console.log(jobs);
```

## Summary

**User submits form** → **Job created** → **Task added to Kit's backlog** → **Kit spawns Forge with Job ID** → **Forge runs migration with tracking** → **User sees live progress** → **Results displayed with source→destination URLs** → **Restore option available**

For questions, contact Forge or check:
- Form repo: https://github.com/maxdevs97/wp-data-entry-form
- Migration framework: `/Users/max/.openclaw/workspace-forge/wordpress-migration/`
