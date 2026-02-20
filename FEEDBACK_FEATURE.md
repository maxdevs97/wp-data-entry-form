# Feedback Mechanism - Feature Documentation

## Overview

The WordPress Data Entry Form now includes a comprehensive feedback mechanism that allows users to report issues with migration results directly from the results page.

## User Flow

1. **User submits migration request** → Form processes migration
2. **Migration completes** → Results screen shows migration details
3. **User notices issue** → Clicks "Report Issue / Give Feedback" button
4. **Feedback modal opens** → User fills out form
5. **User submits feedback** → Confirmation message displayed
6. **Background processing:**
   - Feedback logged to Google Sheets (Feedback tab)
   - Email notification sent to Max
   - User can continue viewing results

## Features

### 1. Feedback Button
- **Location:** Results screen, below migration results table
- **Visibility:** Only shown when migration is complete
- **Style:** Prominent accent button with gradient background
- **Text:** "Report Issue / Give Feedback"

### 2. Feedback Modal

**Fields:**
- **Issue Category*** (Required dropdown):
  - Wrong post type label
  - Missing data / content
  - Incorrect mapping
  - Broken link or URL
  - Formatting issue
  - Other issue

- **Which item has the issue?** (Optional text):
  - Helps identify specific post/page
  - Examples: "About Us page", "Post ID 123"
  - User-friendly prompt

- **Describe the issue*** (Required textarea):
  - Minimum 10 characters
  - Allows detailed explanation
  - Pre-formatted with helpful placeholder

**Buttons:**
- **Cancel:** Closes modal without submitting
- **Submit Feedback:** Validates and submits form

### 3. Data Collection

**Collected Fields:**
- `jobId` - Migration job identifier
- `category` - Selected issue category
- `itemReference` - Optional item identifier
- `message` - User's detailed description
- `requesterEmail` - Email from job data
- `timestamp` - Submission time (ISO 8601)

### 4. Storage (Google Sheets)

**Tab:** "Feedback" (auto-created if missing)

**Columns:**
| Timestamp | Job ID | Category | Item Reference | Message | Requester Email | Status |
|-----------|--------|----------|----------------|---------|-----------------|--------|
| ISO datetime | job_xyz | wrong_label | About Us | Label shows... | user@example.com | New |

**Benefits:**
- Centralized feedback tracking
- Easy filtering and sorting
- Shareable with team
- No additional database required

### 5. Email Notifications

**Recipient:** max@sheragency.com

**Subject:** `🚨 Migration Feedback: [Category] - Job [ID]`

**Content:**
- Feedback details (category, item, message)
- Requester information
- Related migration context (source, destination, status)
- Direct link to Google Sheets Feedback tab
- Professional HTML formatting with gradients and badges

**Design:**
- Red gradient header
- Structured info boxes
- Category badge for quick identification
- Mobile-responsive

## Technical Implementation

### API Endpoint

**Route:** `POST /api/feedback`

**Request Body:**
```json
{
  "jobId": "job_1234567890",
  "category": "wrong_label",
  "itemReference": "About Us page",
  "message": "The post type label shows 'page' but should be 'custom_page'",
  "requesterEmail": "user@sheragency.com",
  "timestamp": "2026-02-20T10:00:00.000Z"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Thank you for your feedback! The team will review it shortly."
}
```

**Response (Error):**
```json
{
  "error": "Missing required feedback fields"
}
```

### Validation Rules

1. **Required Fields:** jobId, category, message, requesterEmail
2. **Message Length:** Minimum 10 characters
3. **Category:** Must be one of predefined values
4. **Email Format:** Validated by existing job data

### Error Handling

- **Network Errors:** User-friendly message in modal
- **Validation Errors:** Specific error displayed
- **Backend Errors:** Graceful degradation, user notified
- **Sheet/Email Failures:** Logged but don't block submission

## UI/UX Design

### Modal Styling
- **Background:** Semi-transparent dark overlay (75% opacity)
- **Content:** Dark card with rounded corners
- **Animation:** Fade in + scale up (300ms ease)
- **Responsive:** 90% width on mobile, max 600px on desktop
- **Accessibility:** Close on ESC key, click outside, or X button

### Color Scheme
- **Primary:** Matches existing dark theme
- **Accent:** Purple-blue gradient (#667eea → #764ba2)
- **Error:** Red (#ff6b6b)
- **Success:** Green (#00d4aa)

### Typography
- **Headers:** 24px bold
- **Body:** 14-16px normal
- **Labels:** 14px semi-bold
- **Placeholders:** Muted gray

## Configuration

### Environment Variables

**Required:**
- `GOOGLE_CREDENTIALS_PATH` - Service account JSON path
- `GOOGLE_SHEET_ID` - Target spreadsheet ID

**Optional:**
- `EMAIL_FROM` - Sender email address
- `EMAIL_PROVIDER` - SMTP or console
- `SMTP_*` - SMTP configuration for production

### Google Service Account
- **Email:** hex-s-login@gen-lang-client-0723023532.iam.gserviceaccount.com
- **Impersonates:** max@sheragency.com
- **Scopes:** spreadsheets, drive

## Usage Examples

### Example 1: Wrong Label
```
Category: Wrong post type label
Item: "Team Members" section
Message: The label shows "page" but these should be labeled as "team_member" post type.
```

### Example 2: Missing Content
```
Category: Missing data / content
Item: Contact page (ID 42)
Message: The contact form shortcode didn't migrate. Source had [contact-form-7 id="123"] but destination is empty.
```

### Example 3: Broken Link
```
Category: Broken link or URL
Item: Homepage hero image
Message: Hero image link points to old domain instead of new domain. Shows https://old-site.com/image.jpg
```

## Future Enhancements

**Possible Improvements:**
1. Feedback status tracking (New → In Progress → Resolved)
2. User notifications when feedback is addressed
3. Attachment support (screenshots)
4. Auto-detect common issues
5. Feedback analytics dashboard
6. Integration with project management tools
7. Priority flagging
8. Response threading

## Testing

**Manual Tests:**
1. Complete a migration and view results
2. Click feedback button → Modal opens
3. Try submitting empty form → Validation errors shown
4. Fill form and submit → Success confirmation
5. Check Google Sheets → New row added to Feedback tab
6. Check Max's email → Notification received
7. Test on mobile → Responsive design works
8. Test modal close methods → All work (X, Cancel, outside click)

**Edge Cases:**
- No GOOGLE_SHEET_ID configured → Logged but doesn't fail
- SMTP not configured → Logged to console
- Invalid job ID → Graceful error
- Network timeout → User notified

## Support

**Issues or Questions:**
- Check Google Sheets for feedback entries
- Review email notifications
- Check server logs for errors
- Verify environment variables are set

**Common Issues:**
1. **No email received:** Check SMTP configuration
2. **Sheet not updating:** Verify GOOGLE_SHEET_ID and credentials
3. **Modal not opening:** Check browser console for JS errors
4. **Feedback tab missing:** Will be auto-created on first submission

---

**Version:** 1.0.0  
**Last Updated:** 2026-02-20  
**Maintained By:** Forge (OpenClaw Agent)
