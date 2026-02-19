// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const formScreen = document.getElementById('formScreen');
const loginForm = document.getElementById('loginForm');
const migrationForm = document.getElementById('migrationForm');
const loginError = document.getElementById('loginError');
const formError = document.getElementById('formError');
const formSuccess = document.getElementById('formSuccess');

// State
let accessPassword = '';

// Conditional Section Toggles
document.getElementById('contentTypeCertainPages').addEventListener('change', function() {
  document.getElementById('certainPagesSection').style.display = this.checked ? 'block' : 'none';
});

document.getElementById('contentTypePostTypes').addEventListener('change', function() {
  document.getElementById('postTypesSection').style.display = this.checked ? 'block' : 'none';
});

// Parse textarea data (one item per line)
function getTextareaArrayData(textareaId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea || !textarea.value) {
    return [];
  }
  
  // Split by newline, trim whitespace, filter empty lines
  return textarea.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

// Login Form Handler
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const password = document.getElementById('password').value;
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  
  // Show loading state
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  hideMessage(loginError);
  
  try {
    const response = await fetch('/api/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    const data = await response.json();
    
    if (data.valid) {
      // Store password for form submission
      accessPassword = password;
      
      // Switch screens
      loginScreen.classList.remove('active');
      formScreen.classList.add('active');
      
      // Reset login form
      loginForm.reset();
    } else {
      showMessage(loginError, 'Invalid password. Please try again.');
    }
  } catch (error) {
    showMessage(loginError, 'Connection error. Please try again.');
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});

// Migration Form Handler
migrationForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = migrationForm.querySelector('button[type="submit"]');
  
  // Show loading state
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  hideMessage(formError);
  hideMessage(formSuccess);
  
  try {
    // Gather form data
    const certainPagesChecked = document.getElementById('contentTypeCertainPages').checked;
    const postTypesChecked = document.getElementById('contentTypePostTypes').checked;
    
    const formData = {
      password: accessPassword,
      requesterName: document.getElementById('requesterName').value.trim(),
      requesterEmail: document.getElementById('requesterEmail').value.trim(),
      sourceUrl: document.getElementById('sourceUrl').value.trim(),
      destinationUrl: document.getElementById('destinationUrl').value.trim(),
      wpUsername: document.getElementById('wpUsername').value.trim(),
      wpPassword: document.getElementById('wpPassword').value,
      contentTypeCertainPages: certainPagesChecked,
      contentTypePostTypes: postTypesChecked,
      certainPages: certainPagesChecked ? getTextareaArrayData('certainPagesTextarea') : [],
      postTypes: postTypesChecked ? getTextareaArrayData('postTypesTextarea') : [],
      specialInstructions: document.getElementById('specialInstructions').value.trim()
    };
    
    // Client-side validation
    const validation = validateForm(formData);
    if (!validation.valid) {
      showMessage(formError, validation.error);
      return;
    }
    
    // Submit to API
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      // Success! Switch to results screen
      showResultsScreen(data.jobId, formData);
      
    } else {
      // Error from server
      const errorMsg = data.error || 'An error occurred. Please try again.';
      const details = data.details ? `<br><small>${data.details}</small>` : '';
      showMessage(formError, errorMsg + details);
      
      // Scroll to error
      formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
  } catch (error) {
    showMessage(formError, `
      Network error: Unable to submit request.<br>
      <small>Please check your connection and try again.</small>
    `);
    formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});

// Client-side Form Validation
function validateForm(data) {
  // Name validation
  if (!data.requesterName || data.requesterName.length < 2) {
    return { valid: false, error: 'Please enter your full name.' };
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!data.requesterEmail || !emailRegex.test(data.requesterEmail)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  
  // URL validation
  const urlRegex = /^https?:\/\/.+/i;
  if (!data.sourceUrl || !urlRegex.test(data.sourceUrl)) {
    return { valid: false, error: 'Source URL must be a valid URL (starting with http:// or https://).' };
  }
  if (!data.destinationUrl || !urlRegex.test(data.destinationUrl)) {
    return { valid: false, error: 'Destination URL must be a valid URL (starting with http:// or https://).' };
  }
  
  // WordPress credentials
  if (!data.wpUsername || data.wpUsername.length < 2) {
    return { valid: false, error: 'WordPress username is required.' };
  }
  if (!data.wpPassword || data.wpPassword.length < 6) {
    return { valid: false, error: 'WordPress Application Password is required (minimum 6 characters).' };
  }
  
  // Content type validation
  if (!data.contentTypeCertainPages && !data.contentTypePostTypes) {
    return { valid: false, error: 'Please select at least one content type (Certain Pages or Post Types).' };
  }
  
  // Validate repeater fields
  if (data.contentTypeCertainPages && data.certainPages.length === 0) {
    return { valid: false, error: 'Please specify at least one page to migrate.' };
  }
  
  if (data.contentTypePostTypes && data.postTypes.length === 0) {
    return { valid: false, error: 'Please specify at least one post type to migrate.' };
  }
  
  return { valid: true };
}

// Message Helpers
function showMessage(element, html) {
  element.innerHTML = html;
  element.style.display = 'block';
}

function hideMessage(element) {
  element.style.display = 'none';
}

// Real-time URL validation feedback
['sourceUrl', 'destinationUrl'].forEach(fieldId => {
  const field = document.getElementById(fieldId);
  field.addEventListener('blur', () => {
    const value = field.value.trim();
    if (value && !value.match(/^https?:\/\/.+/i)) {
      field.style.borderColor = 'var(--error)';
    } else {
      field.style.borderColor = 'var(--border-color)';
    }
  });
});

// Real-time email validation feedback
const emailField = document.getElementById('requesterEmail');
emailField.addEventListener('blur', () => {
  const value = emailField.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (value && !emailRegex.test(value)) {
    emailField.style.borderColor = 'var(--error)';
  } else {
    emailField.style.borderColor = 'var(--border-color)';
  }
});

// Auto-focus first field on screen change
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.target.classList.contains('active')) {
      const firstInput = mutation.target.querySelector('input:not([type="checkbox"])');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    }
  });
});

observer.observe(loginScreen, { attributes: true, attributeFilter: ['class'] });
observer.observe(formScreen, { attributes: true, attributeFilter: ['class'] });

// Initialize - focus first field
document.getElementById('password').focus();

// Results Screen Management
let pollingInterval = null;

function showResultsScreen(jobId, formData) {
  // Hide form screen
  formScreen.classList.remove('active');
  
  // Create results screen if it doesn't exist
  let resultsScreen = document.getElementById('resultsScreen');
  if (!resultsScreen) {
    resultsScreen = createResultsScreen();
    document.querySelector('.container').appendChild(resultsScreen);
  }
  
  // Show results screen
  resultsScreen.classList.add('active');
  
  // Reset form
  migrationForm.reset();
  
  // Start polling for job status
  startPolling(jobId, formData);
}

function createResultsScreen() {
  const screen = document.createElement('div');
  screen.id = 'resultsScreen';
  screen.className = 'screen';
  screen.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h1>🚀 Migration Status</h1>
        <p id="resultsSubtitle">Tracking your migration request</p>
      </div>
      <div class="card-body">
        <!-- Migration Info -->
        <section class="results-section" id="migrationInfo">
          <h2>Migration Details</h2>
          <div class="info-grid">
            <div class="info-item">
              <strong>Source:</strong>
              <span id="infoSource">-</span>
            </div>
            <div class="info-item">
              <strong>Destination:</strong>
              <span id="infoDestination">-</span>
            </div>
            <div class="info-item">
              <strong>Content Type:</strong>
              <span id="infoContentType">-</span>
            </div>
            <div class="info-item">
              <strong>Status:</strong>
              <span id="infoStatus" class="status-badge status-pending">Pending</span>
            </div>
          </div>
        </section>

        <!-- Progress Bar -->
        <section class="results-section" id="progressSection">
          <h2>Progress</h2>
          <div class="progress-container">
            <div class="progress-bar">
              <div id="progressFill" class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="progress-text">
              <span id="progressPercent">0%</span>
              <span id="progressMessage">Initializing...</span>
            </div>
          </div>
          <div class="progress-details">
            <span id="progressItems">0 / 0 items</span>
            <span id="progressStage">-</span>
          </div>
        </section>

        <!-- Results Table (Hidden until complete) -->
        <section class="results-section" id="resultsTableSection" style="display: none;">
          <h2>Migration Results</h2>
          <div class="results-summary" id="resultsSummary"></div>
          <div class="table-wrapper">
            <table class="results-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Source URL</th>
                  <th>Destination URL</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="resultsTableBody">
              </tbody>
            </table>
          </div>
        </section>

        <!-- Backup Info (Hidden until complete) -->
        <section class="results-section" id="backupSection" style="display: none;">
          <h2>🔄 Backup & Restore</h2>
          <div class="backup-info">
            <p>A backup was created before the migration. If you need to rollback these changes, click the restore button below.</p>
            <div class="backup-details">
              <div><strong>Backup Timestamp:</strong> <span id="backupTimestamp">-</span></div>
              <div><strong>Backup Location:</strong> <span id="backupLocation">-</span></div>
            </div>
            <div class="backup-actions">
              <button id="restoreButton" class="btn btn-warning">
                <span class="btn-text">⚠️ Restore Backup</span>
                <span class="btn-loader" style="display: none;">●●●</span>
              </button>
              <p class="warning-text">⚠️ This will rollback all migration changes. This action cannot be undone.</p>
            </div>
          </div>
        </section>

        <!-- Error Section (Hidden until error) -->
        <section class="results-section error-section" id="errorSection" style="display: none;">
          <h2>❌ Migration Failed</h2>
          <div id="errorDetails" class="error-details"></div>
        </section>

        <!-- Actions -->
        <div class="form-actions">
          <button id="newRequestButton" class="btn btn-secondary">
            Submit Another Request
          </button>
          <button id="refreshButton" class="btn btn-secondary">
            Refresh Status
          </button>
        </div>
      </div>
    </div>
  `;
  
  return screen;
}

function startPolling(jobId, formData) {
  // Store job ID for later use
  window.currentJobId = jobId;
  
  // Update migration info
  document.getElementById('infoSource').textContent = formData.sourceUrl;
  document.getElementById('infoDestination').textContent = formData.destinationUrl;
  document.getElementById('infoContentType').textContent = 
    (formData.contentTypeCertainPages ? `Certain Pages (${formData.certainPages.length})` : '') +
    (formData.contentTypeCertainPages && formData.contentTypePostTypes ? ' + ' : '') +
    (formData.contentTypePostTypes ? `Post Types (${formData.postTypes.length})` : '');
  
  // Poll immediately
  pollJobStatus(jobId);
  
  // Then poll every 3 seconds
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(() => pollJobStatus(jobId), 3000);
  
  // Setup button handlers
  setupResultsButtons(jobId);
}

async function pollJobStatus(jobId) {
  try {
    const response = await fetch(`/api/job-status/${jobId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch job status');
    }
    
    const job = await response.json();
    updateResultsUI(job);
    
    // Stop polling if complete or failed
    if (job.status === 'complete' || job.status === 'failed') {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    
  } catch (error) {
    console.error('Polling error:', error);
    // Continue polling despite errors
  }
}

function updateResultsUI(job) {
  // Update status badge
  const statusBadge = document.getElementById('infoStatus');
  statusBadge.textContent = job.status.charAt(0).toUpperCase() + job.status.slice(1);
  statusBadge.className = `status-badge status-${job.status}`;
  
  // Update progress
  const progress = job.progress;
  document.getElementById('progressFill').style.width = `${progress.percentComplete}%`;
  document.getElementById('progressPercent').textContent = `${progress.percentComplete}%`;
  document.getElementById('progressMessage').textContent = progress.message;
  document.getElementById('progressItems').textContent = `${progress.itemsProcessed} / ${progress.itemsTotal} items`;
  document.getElementById('progressStage').textContent = progress.stage;
  
  // Handle completion
  if (job.status === 'complete' && job.results) {
    showResults(job);
  }
  
  // Handle failure
  if (job.status === 'failed') {
    showError(job);
  }
}

function showResults(job) {
  // Hide progress section
  document.getElementById('progressSection').style.display = 'none';
  
  // Show results table
  document.getElementById('resultsTableSection').style.display = 'block';
  
  // Update summary
  const results = job.results;
  const summaryHTML = `
    <div class="summary-grid">
      <div class="summary-item success">
        <div class="summary-number">${results.totalMigrated || 0}</div>
        <div class="summary-label">Posts Migrated</div>
      </div>
      <div class="summary-item ${results.totalFailed > 0 ? 'error' : 'muted'}">
        <div class="summary-number">${results.totalFailed || 0}</div>
        <div class="summary-label">Failed</div>
      </div>
      <div class="summary-item info">
        <div class="summary-number">${results.duration || '-'}</div>
        <div class="summary-label">Duration</div>
      </div>
    </div>
  `;
  document.getElementById('resultsSummary').innerHTML = summaryHTML;
  
  // Populate results table
  const tbody = document.getElementById('resultsTableBody');
  tbody.innerHTML = '';
  
  if (results.migratedPosts && results.migratedPosts.length > 0) {
    results.migratedPosts.forEach(post => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(post.title)}</td>
        <td><a href="${escapeHtml(post.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(post.sourceUrl)}</a></td>
        <td><a href="${escapeHtml(post.destinationUrl)}" target="_blank" rel="noopener">${escapeHtml(post.destinationUrl)}</a></td>
        <td><span class="status-badge status-complete">✓</span></td>
      `;
      tbody.appendChild(row);
    });
  } else {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No migration results available</td></tr>';
  }
  
  // Show backup section if backup exists
  if (job.backupInfo) {
    document.getElementById('backupSection').style.display = 'block';
    document.getElementById('backupTimestamp').textContent = job.backupInfo.timestamp || '-';
    document.getElementById('backupLocation').textContent = job.backupInfo.directory || '-';
  }
}

function showError(job) {
  document.getElementById('progressSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'block';
  
  const errorHTML = job.errors.map(err => `
    <div class="error-item">
      <div class="error-timestamp">${new Date(err.timestamp).toLocaleString()}</div>
      <div class="error-message">${escapeHtml(err.message)}</div>
    </div>
  `).join('');
  
  document.getElementById('errorDetails').innerHTML = errorHTML || '<p>An unknown error occurred.</p>';
}

function setupResultsButtons(jobId) {
  // New Request button
  document.getElementById('newRequestButton').addEventListener('click', () => {
    // Hide results screen
    document.getElementById('resultsScreen').classList.remove('active');
    
    // Show form screen
    formScreen.classList.add('active');
    
    // Clear polling
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  });
  
  // Refresh button
  document.getElementById('refreshButton').addEventListener('click', () => {
    pollJobStatus(jobId);
  });
  
  // Restore button
  document.getElementById('restoreButton').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to restore the backup? This will rollback all migration changes.')) {
      return;
    }
    
    const restoreBtn = document.getElementById('restoreButton');
    restoreBtn.classList.add('loading');
    restoreBtn.disabled = true;
    
    try {
      const response = await fetch(`/api/restore/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: accessPassword })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        alert('✅ Restore request submitted successfully! Kit will process the restoration shortly.');
      } else {
        alert(`❌ Restore failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert('❌ Network error: Unable to submit restore request.');
    } finally {
      restoreBtn.classList.remove('loading');
      restoreBtn.disabled = false;
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
