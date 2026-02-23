// Status Page Script
let pollingInterval = null;
let currentJobId = null;

// Extract jobId from URL query params
function getJobIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('jobId');
}

// Initialize page on load
window.addEventListener('DOMContentLoaded', async () => {
  const jobId = getJobIdFromURL();
  
  if (!jobId) {
    showNotFoundScreen('No job ID provided in URL');
    return;
  }
  
  currentJobId = jobId;
  console.log('Loading status for job:', jobId);
  
  // Start polling
  try {
    await pollJobStatus(jobId);
    startPolling(jobId);
  } catch (error) {
    console.error('Failed to load job:', error);
    showNotFoundScreen('Job not found or error loading status');
  }
  
  // Setup event listeners
  setupEventListeners();
});

function startPolling(jobId) {
  console.log('🔄 Starting polling for job:', jobId);
  
  // Clear any existing interval
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  
  // Set up recurring poll (every 5 seconds to avoid rate limits)
  pollingInterval = setInterval(() => {
    pollJobStatus(jobId).catch(error => {
      console.error('Error in polling interval:', error);
    });
  }, 5000);
  
  console.log('✅ Polling interval set (every 5 seconds)');
}

async function pollJobStatus(jobId) {
  try {
    console.log('📡 Polling job status:', jobId);
    const response = await fetch(`/api/job-status/${jobId}`);
    
    if (!response.ok) {
      console.error('❌ Failed to fetch job status. Status:', response.status);
      if (response.status === 404) {
        showNotFoundScreen('Job not found');
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
      }
      return;
    }
    
    const job = await response.json();
    console.log('✅ Job status received:', job.status, '| Progress:', job.progress?.percentComplete + '%');
    
    updateResultsUI(job);
    
    // Stop polling if job is complete or failed
    if (job.status === 'complete' || job.status === 'failed' || job.status === 'error') {
      console.log('🏁 Job finished. Stopping polling.');
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }
    
  } catch (error) {
    console.error('❌ Polling error:', error);
    document.getElementById('progressMessage').textContent = 'Connection error. Retrying...';
  }
}

function updateResultsUI(job) {
  try {
    console.log('🔄 Updating results UI for job:', job.jobId);
    
    // Update migration info
    const submissionData = job.submissionData || {};
    document.getElementById('infoSource').textContent = submissionData.sourceUrl || '-';
    document.getElementById('infoDestination').textContent = submissionData.destinationUrl || '-';
    document.getElementById('infoContentType').textContent = submissionData.contentTypeDisplay || '-';
    
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
    if (job.status === 'failed' || job.status === 'error') {
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
    document.getElementById('jobIdDisplay').textContent = job.jobId || '-';
    document.getElementById('backupTimestamp').textContent = job.backupInfo.timestamp || '-';
    document.getElementById('backupLocation').textContent = job.backupInfo.directory || '-';
  }
  
  // Load and display QA results
  loadQAResults(job.jobId);
}

async function loadQAResults(jobId) {
  try {
    console.log('📊 Loading QA results for job:', jobId);
    
    const response = await fetch(`/api/qa-summary/${jobId}`);
    
    if (!response.ok) {
      console.warn('⚠️ QA summary not available (may still be generating)');
      return;
    }
    
    const qaSummary = await response.json();
    console.log('✅ QA summary loaded:', qaSummary);
    
    displayQAResults(qaSummary, jobId);
  } catch (error) {
    console.error('❌ Failed to load QA results:', error);
  }
}

function displayQAResults(qaSummary, jobId) {
  const qaSection = document.getElementById('qaSection');
  if (!qaSection) return;
  
  // Show QA section
  qaSection.style.display = 'block';
  
  // Update summary numbers
  document.getElementById('qaPassedCount').textContent = qaSummary.passed || 0;
  document.getElementById('qaFailedCount').textContent = qaSummary.failed || 0;
  document.getElementById('qaAverageScore').textContent = (qaSummary.average_score || 0).toFixed(1) + '%';
  
  // Setup view detailed report button
  const viewReportBtn = document.getElementById('viewQAReportButton');
  if (viewReportBtn) {
    viewReportBtn.onclick = () => {
      window.open(`/api/qa-report/${jobId}`, '_blank');
    };
  }
  
  // Populate QA table
  const qaTableBody = document.getElementById('qaTableBody');
  if (qaTableBody) {
    qaTableBody.innerHTML = '';
    
    if (qaSummary.items && qaSummary.items.length > 0) {
      qaSummary.items.forEach(item => {
        const scoreClass = item.overall_score >= 90 ? 'success' : 
                          item.overall_score >= 70 ? 'warning' : 'error';
        
        const statusBadge = item.passed 
          ? '<span class="status-badge status-complete">✓ Passed</span>'
          : '<span class="status-badge status-failed">✗ Failed</span>';
        
        // Get issues summary
        const issues = item.errors && item.errors.length > 0
          ? item.errors.slice(0, 2).map(e => e.check.replace(/_/g, ' ')).join(', ')
          : 'None';
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><strong>${escapeHtml(item.title)}</strong></td>
          <td><span class="score-badge score-${scoreClass}">${item.overall_score}%</span></td>
          <td>${statusBadge}</td>
          <td><span style="font-size: 13px; color: var(--text-secondary);">${escapeHtml(issues)}</span></td>
        `;
        qaTableBody.appendChild(row);
      });
    } else {
      qaTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No QA data available</td></tr>';
    }
  }
  
  console.log('✅ QA results displayed');
}

function showError(job) {
  document.getElementById('progressSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'block';
  
  const errors = job.errors || [];
  const errorHTML = errors.map(err => {
    const timestamp = err.timestamp ? new Date(err.timestamp).toLocaleString() : 'Unknown time';
    return `
      <div class="error-item">
        <div class="error-timestamp">${timestamp}</div>
        <div class="error-message">${escapeHtml(err.message)}</div>
      </div>
    `;
  }).join('');
  
  document.getElementById('errorDetails').innerHTML = errorHTML || '<p>An unknown error occurred.</p>';
  
  // Setup retry button listener
  const retryButton = document.getElementById('retryButton');
  if (retryButton && retryButton.parentNode) {
    // Remove any existing listeners
    const newRetryButton = retryButton.cloneNode(true);
    retryButton.parentNode.replaceChild(newRetryButton, retryButton);
    
    // Add fresh listener
    newRetryButton.addEventListener('click', () => handleRetry(job.jobId));
  }
}

function showNotFoundScreen(message) {
  document.getElementById('resultsScreen').style.display = 'none';
  const notFoundScreen = document.getElementById('notFoundScreen');
  notFoundScreen.style.display = 'block';
  console.error('Job not found:', message);
}

function setupEventListeners() {
  // Refresh button
  document.getElementById('refreshButton')?.addEventListener('click', () => {
    if (currentJobId) {
      pollJobStatus(currentJobId);
    }
  });
  
  // Copy link button
  document.getElementById('copyLinkButton')?.addEventListener('click', async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      const btn = document.getElementById('copyLinkButton');
      const originalText = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy link. Please copy manually from the address bar.');
    }
  });
  
  // Feedback button
  document.getElementById('feedbackButton')?.addEventListener('click', () => {
    const feedbackModal = document.getElementById('feedbackModal');
    feedbackModal.style.display = 'flex';
    setTimeout(() => feedbackModal.classList.add('active'), 10);
    document.getElementById('feedbackCategory').focus();
  });
  
  // Close feedback modal
  document.getElementById('closeFeedbackModal')?.addEventListener('click', closeFeedbackModal);
  document.getElementById('cancelFeedback')?.addEventListener('click', closeFeedbackModal);
  
  // Close modal when clicking outside
  document.getElementById('feedbackModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('feedbackModal')) {
      closeFeedbackModal();
    }
  });
  
  // Feedback form submission
  document.getElementById('feedbackForm')?.addEventListener('submit', handleFeedbackSubmit);
}

function closeFeedbackModal() {
  const feedbackModal = document.getElementById('feedbackModal');
  if (!feedbackModal) return;
  
  feedbackModal.classList.remove('active');
  setTimeout(() => {
    feedbackModal.style.display = 'none';
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) feedbackForm.reset();
    hideMessage(document.getElementById('feedbackError'));
    hideMessage(document.getElementById('feedbackSuccess'));
  }, 300);
}

async function handleRetry(jobId) {
  const retryButton = document.getElementById('retryButton');
  if (!retryButton) {
    console.error('Retry button not found');
    return;
  }
  
  const btnText = retryButton.querySelector('.btn-text');
  const btnLoader = retryButton.querySelector('.btn-loader');
  
  // Disable button and show loading state
  retryButton.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (btnLoader) btnLoader.style.display = 'inline';
  
  try {
    console.log('🔄 Retrying job:', jobId);
    
    const response = await fetch('/api/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ Retry successful! New job ID:', data.newJobId);
      
      // Show success message briefly
      if (btnText) {
        btnText.textContent = '✅ Retry Created!';
        btnText.style.display = 'inline';
      }
      if (btnLoader) btnLoader.style.display = 'none';
      
      // Redirect to new job status page
      setTimeout(() => {
        window.location.href = `/status?jobId=${data.newJobId}`;
      }, 1000);
      
    } else {
      throw new Error(data.error || 'Failed to create retry');
    }
    
  } catch (error) {
    console.error('❌ Retry failed:', error);
    
    // Show error state
    if (btnText) {
      btnText.textContent = '❌ Retry Failed';
      btnText.style.display = 'inline';
    }
    if (btnLoader) btnLoader.style.display = 'none';
    
    // Reset button after 3 seconds
    setTimeout(() => {
      if (btnText) btnText.textContent = '🔄 Retry Migration';
      retryButton.disabled = false;
    }, 3000);
    
    alert(`Failed to create retry: ${error.message}`);
  }
}

async function handleFeedbackSubmit(e) {
  e.preventDefault();
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (!submitBtn) {
    console.error('Submit button not found');
    return;
  }
  
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  hideMessage(document.getElementById('feedbackError'));
  hideMessage(document.getElementById('feedbackSuccess'));
  
  try {
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
      showMessage(
        document.getElementById('feedbackSuccess'),
        '✅ Thank you! Your feedback has been submitted.'
      );
      setTimeout(() => {
        closeFeedbackModal();
      }, 2000);
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
}

// Helper functions
function showMessage(element, html) {
  if (element) {
    element.innerHTML = html;
    element.style.display = 'block';
  }
}

function hideMessage(element) {
  if (element) {
    element.style.display = 'none';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
