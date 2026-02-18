# Kit's Guide to WordPress Migration Requests

## Overview

The WordPress Data Entry Form automatically adds migration requests to your `backlog.md` file in the `## Inbox` section. This guide explains how to process these requests and spawn Forge for execution.

## When a New Request Arrives

### 1. Check Your Backlog

New requests appear in `backlog.md` under `## Inbox`:

```markdown
### 🔴 WordPress Migration Request - John Doe

**Submitted:** 2/18/26, 10:30 AM
**Requester:** John Doe (john@sheragency.com)
**Priority:** Urgent

**Migration Details:**
- **Source:** https://old-site.com
- **Destination:** https://new-site.com
- **WP Username:** admin
- **WP Password:** `password123` *(secure)*
- **Content Type:** blog posts
- **Post Types:** portfolio, testimonials

**Special Instructions:**
Exclude any draft posts. Only migrate published content from the last 2 years.

**Status:** Pending Review

**Next Steps:**
1. Kit: Review request and validate requirements
2. Kit: Spawn Forge with migration parameters
3. Forge: Execute migration using mybabyswims.com framework
4. Forge: Run QA checks
5. Kit: Send completion email to requester + CC Max
```

### 2. Review the Request

**Check for:**
- ✅ Valid source and destination URLs
- ✅ Reasonable scope (not too large)
- ✅ Clear requirements
- ✅ Appropriate priority level
- ⚠️ Any security concerns
- ⚠️ Unusual domain patterns

**Manual approval flow:** The form accepts any domain, but you review each request before spawning Forge.

### 3. Spawn Forge

Once validated, spawn Forge with migration details:

```
@forge

Execute WordPress migration:

**Source:** https://old-site.com
**Destination:** https://new-site.com
**WP Username:** admin
**WP Password:** password123
**Content Type:** blog posts
**Post Types:** portfolio, testimonials

**Special Instructions:**
Exclude any draft posts. Only migrate published content from the last 2 years.

**Framework:** Use mybabyswims.com migration pattern:
1. Connect to source via WP REST API (or scraping if no API)
2. Fetch content based on type/post types
3. Transform data for destination format
4. Upload to destination via WP REST API
5. Run QA checks:
   - Verify post count matches
   - Check images are migrated
   - Validate internal links
   - Test sample posts on destination
6. Generate migration report

**Requester:** John Doe (john@sheragency.com)
**Priority:** Urgent

On completion, send results to requester + CC max@sheragency.com
```

## Forge's Migration Pattern

Forge should follow the mybabyswims.com framework:

### Phase 1: Discovery
- Connect to source site
- Analyze content structure
- Count total items
- Check for special requirements

### Phase 2: Content Extraction
- Fetch posts/pages via WP REST API
- If no API: scrape HTML with Cheerio/Puppeteer
- Extract: title, content, excerpt, featured image, meta, categories, tags

### Phase 3: Data Transformation
- Clean HTML
- Fix image URLs
- Update internal links
- Map categories/tags

### Phase 4: Upload
- Authenticate with destination WP REST API
- Create posts in batches (10 at a time)
- Upload images to media library
- Set featured images
- Assign categories/tags

### Phase 5: QA Checks
- Verify post count: source vs destination
- Sample 5-10 posts for manual review
- Check image migration completeness
- Test internal link functionality
- Generate diff report

### Phase 6: Report & Notify
- Create migration summary
- Document any issues/warnings
- Email requester with results
- CC Max on completion

## Completion Workflow

### On Success

1. **Update backlog status:**
```markdown
**Status:** ✅ Completed (2/18/26, 2:45 PM)
```

2. **Send completion email:**

To: `requester@sheragency.com`  
CC: `max@sheragency.com`  
Subject: `WordPress Migration Complete - [Source] → [Destination]`

```
Hi [Requester Name],

Great news! Your WordPress migration has been completed successfully.

MIGRATION SUMMARY
-----------------
Source: https://old-site.com
Destination: https://new-site.com
Content Migrated: 47 blog posts
Duration: 32 minutes
Completed: February 18, 2026 at 2:45 PM

WHAT WAS MIGRATED
-----------------
✅ 47 blog posts
✅ 89 images (uploaded to media library)
✅ Categories and tags
✅ Featured images
✅ Post metadata

QUALITY ASSURANCE
-----------------
✅ Post count verified (47/47)
✅ Sample posts reviewed (10/10 passed)
✅ Images loaded correctly
✅ Internal links updated
✅ SEO metadata preserved

NEXT STEPS
----------
1. Review migrated content at: https://new-site.com/wp-admin
2. Check a few posts to ensure formatting is correct
3. Test any custom functionality
4. Let us know if any adjustments are needed

If you have any questions or notice any issues, please reply to this email.

Best regards,
Sher Agency Automation Team
(Kit + Forge)
```

### On Failure

1. **Update backlog status:**
```markdown
**Status:** ⚠️ Failed - Escalated to Max
```

2. **Escalate to Max:**

To: `max@sheragency.com`  
Subject: `ESCALATION: WordPress Migration Failed - [Requester Name]`

```
Max,

A WordPress migration request has failed and requires your attention.

REQUEST DETAILS
---------------
Requester: John Doe (john@sheragency.com)
Submitted: 2/18/26, 10:30 AM
Priority: Urgent

Source: https://old-site.com
Destination: https://new-site.com

FAILURE REASON
--------------
[Detailed error message]

TROUBLESHOOTING ATTEMPTED
-------------------------
- [What Forge tried]
- [Any workarounds attempted]

RECOMMENDATION
--------------
[What should be done next]

Full logs attached.

Do not email requester yet - awaiting your guidance.

Kit 🎯
```

3. **Do NOT email requester until Max reviews**

## Rate Limiting

- Form limits: 3 requests per user per day
- If a user hits the limit, they'll see an error
- You can manually process additional requests if urgent

## Google Sheet Audit Trail

All submissions are logged to Google Sheet:

**Columns:**
- Timestamp
- Requester
- Email
- Source URL
- Destination URL
- Content Type
- Priority
- Status
- Completion Time
- Notes

**Use this for:**
- Tracking all migration requests
- Identifying patterns (which sites get migrated often)
- Generating reports for Max
- Debugging issues

## Troubleshooting

### Request Looks Suspicious
- Check domain reputation
- Verify requester email is from sheragency.com
- Ask Max before proceeding

### Duplicate Request
- Check Google Sheet for previous submissions
- Merge with existing task if appropriate

### Unclear Requirements
- Reply to requester's email asking for clarification
- Update backlog with clarifications once received

### Source Site Unavailable
- Test URL manually
- Check if site is down temporarily
- Contact requester if issue persists

## Security Notes

- ⚠️ WP credentials are stored in plain text in backlog
- 🔒 Keep backlog.md secure
- 🔐 Never commit backlog to public repos
- 🚨 Rotate credentials after migration is complete

## Questions?

Contact Max if:
- Request seems unusual or suspicious
- Technical issues with form
- Rate limit needs adjustment
- Need to modify workflow

---

**Form URL:** [To be added after deployment]  
**Google Sheet:** [To be added after first submission]  
**Last Updated:** February 18, 2026
