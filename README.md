# WordPress Data Entry Request Form

A professional web application for team members to submit WordPress migration requests. Built for the Sher Agency automation workflow.

## Features

- 🔐 **Password-protected access** - Team members only
- 📋 **Comprehensive form** - Captures all migration requirements
- ✅ **Real-time validation** - Tests WP REST API connection before submission
- 📧 **Email notifications** - Confirmation emails sent to requesters
- 📊 **Google Sheets audit trail** - All submissions logged automatically
- 🎨 **Professional dark mode UI** - Responsive design for all devices
- 🚦 **Rate limiting** - Max 3 requests per user per day
- 🔗 **Kit integration** - Automatically adds tasks to Kit's backlog

## Architecture

### Frontend
- Pure HTML/CSS/JavaScript (no framework dependencies)
- Professional dark mode design
- Responsive for desktop and mobile
- Real-time validation feedback
- Loading states and error handling

### Backend
- Node.js + Express
- Rate limiting per user email
- XSS/SQL injection protection
- WordPress REST API connection testing
- Google Sheets API integration
- Email sending via Nodemailer

### Integrations
1. **Kit's Backlog** - Adds tasks to `## Inbox` section
2. **Google Sheets** - Audit trail with all submission details
3. **Email** - Confirmation and completion notifications

## Setup

### 1. Install Dependencies

```bash
cd wp-data-entry-form
npm install
```

### 2. Configure Environment

Create `.env` file from template:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Set a secure team password
FORM_PASSWORD=your-secure-password

# Path to Kit's backlog file
KIT_BACKLOG_PATH=/Users/max/.openclaw/workspace/backlog.md

# Google service account credentials
GOOGLE_CREDENTIALS_PATH=/Users/max/.openclaw/workspace/.env.google-service-account.json

# Email SMTP settings (Gmail example)
EMAIL_FROM=noreply@sheragency.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 3. Google Sheets Setup

The application will automatically create a new Google Sheet on first submission if `GOOGLE_SHEET_ID` is not set. The sheet ID will be logged to console.

To use an existing sheet:
1. Create a Google Sheet
2. Share it with the service account email: `hex-s-login@gen-lang-client-0723023532.iam.gserviceaccount.com`
3. Add the sheet ID to your `.env` file

### 4. Run Locally

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Access at: http://localhost:3000

## Deployment

### DigitalOcean App Platform

1. **Push to GitHub:**
```bash
git init
git add .
git commit -m "Initial commit: WP Data Entry Form"
git branch -M main
git remote add origin https://github.com/maxdevs97/wp-data-entry-form.git
git push -u origin main
```

2. **Create DigitalOcean App:**
- Go to DigitalOcean App Platform
- Create new app from GitHub repo
- Select `maxdevs97/wp-data-entry-form`
- Set environment variables from `.env` file
- Deploy!

3. **Environment Variables to Set:**
```
FORM_PASSWORD
KIT_BACKLOG_PATH
GOOGLE_CREDENTIALS_PATH
GOOGLE_SHEET_ID
EMAIL_FROM
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
```

## Usage

### Team Member Workflow

1. Navigate to the form URL
2. Enter team password to access
3. Fill out migration request form:
   - Your name and email
   - Source URL (migrate FROM)
   - Destination URL (migrate TO)
   - Destination WordPress credentials
   - Content type to migrate
   - Special instructions (optional)
   - Priority flag (urgent/normal)
4. Submit request
5. Receive confirmation email

### Kit's Workflow

1. Review new request in `backlog.md` (## Inbox section)
2. Validate requirements and domain
3. Spawn Forge with migration parameters
4. Monitor Forge's progress
5. Send completion email when done

### Forge's Workflow

1. Execute migration using mybabyswims.com framework
2. Use WordPress REST API for data transfer
3. Run QA checks (data integrity, images, links)
4. Report results back to Kit

## Security

- ✅ Password-protected form access
- ✅ Rate limiting (3 requests/day per user)
- ✅ Input validation and sanitization
- ✅ XSS protection
- ✅ WordPress REST API connection testing
- ✅ HTTPS enforced in production
- ✅ Helmet.js security headers

## API Endpoints

### POST `/api/verify-password`
Verify team access password.

**Request:**
```json
{
  "password": "team-password"
}
```

**Response:**
```json
{
  "valid": true
}
```

### POST `/api/submit`
Submit migration request.

**Request:**
```json
{
  "password": "team-password",
  "requesterName": "John Doe",
  "requesterEmail": "john@sheragency.com",
  "sourceUrl": "https://old-site.com",
  "destinationUrl": "https://new-site.com",
  "wpUsername": "admin",
  "wpPassword": "password123",
  "contentType": "blog posts",
  "postTypes": "portfolio, testimonials",
  "specialInstructions": "Exclude draft posts",
  "priority": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Migration request submitted successfully.",
  "requestId": "MjAyNi0wMi"
}
```

## File Structure

```
wp-data-entry-form/
├── public/              # Frontend assets
│   ├── index.html      # Main form page
│   ├── styles.css      # Dark mode styling
│   └── script.js       # Client-side logic
├── src/                # Backend code
│   ├── server.js       # Express server
│   ├── validators.js   # Input validation & WP testing
│   ├── backlog.js      # Kit backlog integration
│   ├── sheets.js       # Google Sheets logging
│   └── email.js        # Email notifications
├── .env.example        # Environment template
├── package.json        # Dependencies
└── README.md           # This file
```

## Monitoring

### Logs
- Application logs available via `console.log` output
- DigitalOcean provides log viewing in dashboard
- All submissions logged to Google Sheet

### Health Check
```bash
curl https://your-app-url.ondigitalocean.app/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-18T16:00:00.000Z"
}
```

## Troubleshooting

### WordPress Connection Fails
- Verify destination URL is accessible
- Check WordPress REST API is enabled
- Confirm credentials have admin access
- Test manually: `curl https://site.com/wp-json/wp/v2/users/me -u username:password`

### Email Not Sending
- Check SMTP credentials in `.env`
- For Gmail: Use App Password, not account password
- Verify firewall allows SMTP port (587)

### Google Sheets Not Logging
- Verify service account credentials path
- Check service account has Sheet access
- Create sheet manually and add `GOOGLE_SHEET_ID`

### Rate Limit Hit
- Rate limit: 3 requests per user per day
- Based on email address
- Resets every 24 hours
- Contact admin to reset if needed

## Support

For issues or questions:
- Check logs in DigitalOcean dashboard
- Review Google Sheet audit trail
- Contact Max: max@sheragency.com

## License

Proprietary - Sher Agency Internal Tool

---

Built by Forge 🤖 | Managed by Kit 🎯 | February 2026
