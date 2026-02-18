require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { validateRequest, testWPConnection } = require('./validators');
const { addToKitBacklog } = require('./backlog');
const { logToGoogleSheet } = require('./sheets');
const { sendConfirmationEmail } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting: 3 requests per user per day
const submissionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3,
  message: { error: 'Rate limit exceeded. Maximum 3 requests per day per user.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use email as the rate limit key
    return req.body.requesterEmail || req.ip;
  }
});

// Password check middleware
const checkPassword = (req, res, next) => {
  const { password } = req.body;
  if (password !== process.env.FORM_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  next();
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Password verification endpoint
app.post('/api/verify-password', (req, res) => {
  const { password } = req.body;
  if (password === process.env.FORM_PASSWORD) {
    return res.json({ valid: true });
  }
  res.status(401).json({ valid: false, error: 'Invalid password' });
});

// Main submission endpoint
app.post('/api/submit', submissionLimiter, checkPassword, async (req, res) => {
  try {
    const {
      requesterName,
      requesterEmail,
      sourceUrl,
      destinationUrl,
      wpUsername,
      wpPassword,
      contentType,
      postTypes,
      specialInstructions,
      priority
    } = req.body;

    // Validate request
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Test WP REST API connection (fail fast)
    const wpConnection = await testWPConnection(destinationUrl, wpUsername, wpPassword);
    if (!wpConnection.valid) {
      return res.status(400).json({ 
        error: `WordPress connection failed: ${wpConnection.error}`,
        details: 'Please verify the destination URL and credentials are correct.'
      });
    }

    const submissionData = {
      timestamp: new Date().toISOString(),
      requesterName,
      requesterEmail,
      sourceUrl,
      destinationUrl,
      wpUsername, // Will be encrypted in real deployment
      wpPassword, // Will be encrypted in real deployment
      contentType,
      postTypes: postTypes || 'N/A',
      specialInstructions: specialInstructions || 'None',
      priority: priority ? 'Urgent' : 'Normal',
      status: 'Pending Review'
    };

    // Add to Kit's backlog
    await addToKitBacklog(submissionData);

    // Log to Google Sheet
    await logToGoogleSheet(submissionData);

    // Send confirmation email
    await sendConfirmationEmail(submissionData);

    res.json({ 
      success: true, 
      message: 'Migration request submitted successfully. You will receive a confirmation email shortly.',
      requestId: Buffer.from(submissionData.timestamp).toString('base64').substring(0, 12)
    });

  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ 
      error: 'Internal server error. Please try again or contact support.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 WordPress Data Entry Form running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
