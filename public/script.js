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
let pollingInterval = null;
let currentJobId = null;

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
      accessPassword = password;
      loginScreen.classList.remove('active');
      formScreen.classList.add('active');
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
  
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  hideMessage(formError);
  hideMessage(formSuccess);
  
  try {
    const certainPagesChecked = document.getElementById('contentTypeCertainPages').checked;
    const postTypesChecked = document.getElementById('contentTypePostTypes').checked;
    
    const formData = {
      password: accessPassword,
      sourceUrl: document.getElementById('sourceUrl').value.trim(),
      destinationUrl: document.getElementById('destinationUrl').value.trim(),
      wpUsername: document.getElementById('wpUsername').value.trim(),
      wpPassword: document.getElementById('wpPassword').value,
      contentTypeCertainPages: certainPagesChecked,
      contentTypePostTypes: postTypesChecked,
      certainPages: certainPagesChecked ? getTextareaArrayData('certainPagesTextarea') : [],
      postTypes: postTypesChecked ? getTextareaArrayData('postTypesTextarea') : [],
      specialInstructions: document.getElementById('specialInstructions').value.trim(),
      preserve: {
        slug: document.getElementById('preserveSlug').checked,
        headingStructures: document.getElementById('preserveHeadingStructures').checked,
        title: document.getElementById('preserveTitle').checked,
        featuredImages: document.getElementById('preserveFeaturedImages').checked,
        bodyContent: document.getElementById('preserveBodyContent').checked,
        categories: document.getElementById('preserveCategories').checked,
        tags: document.getElementById('preserveTags').checked,
        publicationDate: document.getElementById('preservePublicationDate').checked,
        author: document.getElementById('preserveAuthor').checked,
        seoMetadata: document.getElementById('preserveSEOMetadata').checked,
        internalLinks: document.getElementById('preserveInternalLinks').checked
      }
    };
    
    const validation = validateForm(formData);
    if (!validation.valid) {
      showMessage(formError, validation.error);
      return;
    }
    
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showResultsScreen(data.jobId, formData);
    } else {
      const errorMsg = data.error || 'An error occurred. Please try again.';
      const details = data.details ? `<br><small>${data.details}</small>` : '';
      showMessage(formError, errorMsg + details);
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
  const urlRegex = /^https?:\/\/.+/i;
  if (!data.sourceUrl || !urlRegex.test(data.sourceUrl)) {
    return { valid: false, error: 'Source URL must be a valid URL (starting with http:// or https://).' };
  }
  if (!data.destinationUrl || !urlRegex.test(data.destinationUrl)) {
    return { valid: false, error: 'Destination URL must be a valid URL (starting with http:// or https://).' };
  }
  
  if (!data.wpUsername || data.wpUsername.length < 2) {
    return { valid: false, error: 'WordPress username is required.' };
  }
  if (!data.wpPassword || data.wpPassword.length < 6) {
    return { valid: false, error: 'WordPress Application Password is required (minimum 6 characters).' };
  }
  
  if (!data.contentTypeCertainPages && !data.contentTypePostTypes) {
    return { valid: false, error: 'Please select at least one content type (Certain Pages or Post Types).' };
  }
  
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

// Real-time validation feedback
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

// Auto-focus first field
document.getElementById('password').focus();

// Results Screen Management
function showResultsScreen(jobId, formData) {
  try {
    console.log('🎯 showResultsScreen called with jobId:', jobId);
    currentJobId = jobId;
    
    // Hide form first
    formScreen.classList.remove('active');
    console.log('✅ Form screen hidden');
    
    // Get or create results screen
    let resultsScreen = document.getElementById('resultsScreen');
    if (!resultsScreen) {
      console.log('📝 Creating results screen...');
      resultsScreen = createResultsScreen();
      document.querySelector('.container').appendChild(resultsScreen);
      console.log('✅ Results screen created and appended');
      
      // Setup event listeners AFTER appending to DOM
      setupResultsButtons();
      setupFeedbackModal();
      console.log('✅ Event listeners attached');
    }
    
    // Show results screen
    resultsScreen.classList.add('active');
    console.log('✅ Results screen shown');
    
    // Reset form
    migrationForm.reset();
    
    // Update migration info (with error handling)
    try {
      document.getElementById('infoSource').textContent = formData.sourceUrl || '-';
      document.getElementById('infoDestination').textContent = formData.destinationUrl || '-';
      
      const contentTypeParts = [];
      if (formData.contentTypeCertainPages) {
        contentTypeParts.push(`Certain Pages (${formData.certainPages.length})`);
      }
      if (formData.contentTypePostTypes) {
        contentTypeParts.push(`Post Types (${formData.postTypes.length})`);
      }
      document.getElementById('infoContentType').textContent = contentTypeParts.join(' + ') || '-';
      console.log('✅ Migration info updated');
    } catch (infoError) {
      console.error('⚠️ Error updating migration info:', infoError);
      // Continue anyway - the results screen is still visible
    }
    
    // Start polling (with error handling)
    try {
      startPolling(jobId);
      console.log('✅ Polling started');
    } catch (pollError) {
      console.error('⚠️ Error starting polling:', pollError);
      // Show error in progress section
      document.getElementById('progressMessage').textContent = 'Error loading status. Please refresh.';
    }
  } catch (error) {
    console.error('❌ CRITICAL ERROR in showResultsScreen:', error);
    // Try to show an error message to the user
    alert(`Error showing results screen: ${error.message}\n\nPlease refresh the page and check the submission status.`);
    // Try to show form screen again
    formScreen.classList.add('active');
  }
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

        <section class="results-section error-section" id="errorSection" style="display: none;">
          <h2>❌ Migration Failed</h2>
          <div id="errorDetails" class="error-details"></div>
        </section>

        <section class="results-section" id="feedbackSection" style="display: none;">
          <h2>📣 Report an Issue</h2>
          <p>Found something wrong with the migration results? Let us know!</p>
          <button id="feedbackButton" class="btn btn-accent">
            Report Issue / Give Feedback
          </button>
        </section>

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

    <div id="feedbackModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>📣 Report an Issue</h2>
          <button class="modal-close" id="closeFeedbackModal">&times;</button>
        </div>
        <div class="modal-body">
          <form id="feedbackForm">
            <div class="form-group">
              <label for="feedbackCategory">Issue Category *</label>
              <select id="feedbackCategory" name="feedbackCategory" required>
                <option value="">Select a category...</option>
                <option value="wrong_label">Wrong post type label</option>
                <option value="missing_data">Missing data / content</option>
                <option value="incorrect_mapping">Incorrect mapping</option>
                <option value="broken_link">Broken link or URL</option>
                <option value="formatting_issue">Formatting issue</option>
                <option value="other">Other issue</option>
              </select>
            </div>

            <div class="form-group">
              <label for="feedbackItemReference">Which item has the issue? (optional)</label>
              <input 
                type="text" 
                id="feedbackItemReference" 
                name="feedbackItemReference" 
                placeholder="e.g., 'About Us page' or post ID"
              >
              <small>Help us identify the specific post, page, or content</small>
            </div>

            <div class="form-group">
              <label for="feedbackMessage">Describe the issue *</label>
              <textarea 
                id="feedbackMessage" 
                name="feedbackMessage" 
                rows="6"
                placeholder="Please describe what's wrong or what you expected..."
                required
              ></textarea>
            </div>

            <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="cancelFeedback">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary">
                <span class="btn-text">Submit Feedback</span>
                <span class="btn-loader" style="display: none;">●●●</span>
              </button>
            </div>

            <div id="feedbackError" class="error-message" style="display: none;"></div>
          </form>
        </div>
      </div>
    </div>
  `;
  
  return screen;
}

function startPolling(jobId) {
  console.log('🔄 Starting polling for job:', jobId);
  
  // Initial poll
  pollJobStatus(jobId).catch(error => {
    console.error('Error in initial poll:', error);
  });
  
  // Clear any existing interval
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  
  // Set up recurring poll
  pollingInterval = setInterval(() => {
    pollJobStatus(jobId).catch(error => {
      console.error('Error in polling interval:', error);
    });
  }, 3000);
  
  console.log('✅ Polling interval set (every 3 seconds)');
}

async function pollJobStatus(jobId) {
  try {
    console.log('📡 Polling job status:', jobId);
    const response = await fetch(`/api/job-status/${jobId}`);
    
    if (!response.ok) {
      console.error('❌ Failed to fetch job status. Status:', response.status);
      if (response.status === 404) {
        console.error('Job not found on server');
        document.getElementById('progressMessage').textContent = 'Job not found. Please contact support.';
      }
      return;
    }
    
    const job = await response.json();
    console.log('✅ Job status received:', job.status, '| Progress:', job.progress?.percentComplete + '%');
    
    updateResultsUI(job);
    
    // Stop polling if job is complete or failed
    if (job.status === 'complete' || job.status === 'failed') {
      console.log('🏁 Job finished. Stopping polling.');
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }
    
  } catch (error) {
    console.error('❌ Polling error:', error);
    // Don't stop polling on error - might be temporary network issue
    document.getElementById('progressMessage').textContent = 'Connection error. Retrying...';
  }
}

function updateResultsUI(job) {
  try {
    console.log('🔄 Updating results UI for job:', job.jobId);
    
    // Update status badge
    const statusBadge = document.getElementById('infoStatus');
    if (statusBadge) {
      statusBadge.textContent = job.status.charAt(0).toUpperCase() + job.status.slice(1);
      statusBadge.className = `status-badge status-${job.status}`;
    }
    
    // Update progress
    const progress = job.progress || {};
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    const progressMessage = document.getElementById('progressMessage');
    const progressItems = document.getElementById('progressItems');
    const progressStage = document.getElementById('progressStage');
    
    if (progressFill) progressFill.style.width = `${progress.percentComplete || 0}%`;
    if (progressPercent) progressPercent.textContent = `${progress.percentComplete || 0}%`;
    if (progressMessage) progressMessage.textContent = progress.message || 'Processing...';
    if (progressItems) progressItems.textContent = 
      `${progress.itemsProcessed || 0} / ${progress.itemsTotal || 0} items`;
    if (progressStage) progressStage.textContent = progress.stage || '-';
    
    console.log('✅ Progress UI updated:', progress.percentComplete + '%', '-', progress.message);
    
    // Handle completion
    if (job.status === 'complete' && job.results) {
      console.log('✅ Job complete! Showing results...');
      showResults(job);
    }
    
    // Handle failure
    if (job.status === 'failed') {
      console.error('❌ Job failed! Showing errors...');
      showError(job);
    }
  } catch (error) {
    console.error('❌ Error in updateResultsUI:', error);
  }
}

function showResults(job) {
  document.getElementById('progressSection').style.display = 'none';
  document.getElementById('resultsTableSection').style.display = 'block';
  document.getElementById('feedbackSection').style.display = 'block';
  
  const results = job.results || {};
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
  
  if (job.backupInfo) {
    document.getElementById('backupSection').style.display = 'block';
    document.getElementById('backupTimestamp').textContent = job.backupInfo.timestamp || '-';
    document.getElementById('backupLocation').textContent = job.backupInfo.directory || '-';
  }
}

function showError(job) {
  document.getElementById('progressSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'block';
  
  const errors = job.errors || [];
  const errorHTML = errors.map(err => `
    <div class="error-item">
      <div class="error-timestamp">${new Date(err.timestamp).toLocaleString()}</div>
      <div class="error-message">${escapeHtml(err.message)}</div>
    </div>
  `).join('');
  
  document.getElementById('errorDetails').innerHTML = errorHTML || '<p>An unknown error occurred.</p>';
}

function setupResultsButtons() {
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'newRequestButton' || e.target.closest('#newRequestButton')) {
      document.getElementById('resultsScreen').classList.remove('active');
      formScreen.classList.add('active');
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }
    
    if (e.target.id === 'refreshButton' || e.target.closest('#refreshButton')) {
      if (currentJobId) {
        pollJobStatus(currentJobId);
      }
    }
    
    if (e.target.id === 'restoreButton' || e.target.closest('#restoreButton')) {
      if (!confirm('Are you sure you want to restore the backup? This will rollback all migration changes.')) {
        return;
      }
      
      const restoreBtn = document.getElementById('restoreButton');
      restoreBtn.classList.add('loading');
      restoreBtn.disabled = true;
      
      try {
        const response = await fetch(`/api/restore/${currentJobId}`, {
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
    }
  });
}

function setupFeedbackModal() {
  const feedbackModal = document.getElementById('feedbackModal');
  const feedbackForm = document.getElementById('feedbackForm');
  
  document.addEventListener('click', (e) => {
    if (e.target.id === 'feedbackButton' || e.target.closest('#feedbackButton')) {
      feedbackModal.style.display = 'flex';
      setTimeout(() => feedbackModal.classList.add('active'), 10);
      document.getElementById('feedbackCategory').focus();
    }
    
    if (e.target.id === 'closeFeedbackModal' || e.target.id === 'cancelFeedback') {
      feedbackModal.classList.remove('active');
      setTimeout(() => {
        feedbackModal.style.display = 'none';
        feedbackForm.reset();
        hideMessage(document.getElementById('feedbackError'));
      }, 300);
    }
    
    if (e.target === feedbackModal) {
      feedbackModal.classList.remove('active');
      setTimeout(() => feedbackModal.style.display = 'none', 300);
    }
  });
  
  feedbackForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = feedbackForm.querySelector('button[type="submit"]');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    hideMessage(document.getElementById('feedbackError'));
    
    try {
      const jobResponse = await fetch(`/api/job-status/${currentJobId}`);
      const job = await jobResponse.json();
      
      const feedbackData = {
        jobId: currentJobId,
        category: document.getElementById('feedbackCategory').value,
        itemReference: document.getElementById('feedbackItemReference').value.trim(),
        message: document.getElementById('feedbackMessage').value.trim(),
        requesterEmail: 'team-member',
        timestamp: new Date().toISOString()
      };
      
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData)
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        feedbackModal.classList.remove('active');
        setTimeout(() => {
          feedbackModal.style.display = 'none';
          feedbackForm.reset();
        }, 300);
        alert('✅ Thank you! Your feedback has been submitted. The team will review it shortly.');
      } else {
        showMessage(
          document.getElementById('feedbackError'), 
          data.error || 'Failed to submit feedback. Please try again.'
        );
      }
      
    } catch (error) {
      showMessage(
        document.getElementById('feedbackError'), 
        'Network error: Unable to submit feedback. Please try again.'
      );
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
