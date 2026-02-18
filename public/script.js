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
    const formData = {
      password: accessPassword,
      requesterName: document.getElementById('requesterName').value.trim(),
      requesterEmail: document.getElementById('requesterEmail').value.trim(),
      sourceUrl: document.getElementById('sourceUrl').value.trim(),
      destinationUrl: document.getElementById('destinationUrl').value.trim(),
      wpUsername: document.getElementById('wpUsername').value.trim(),
      wpPassword: document.getElementById('wpPassword').value,
      contentType: document.getElementById('contentType').value,
      postTypes: document.getElementById('postTypes').value.trim(),
      specialInstructions: document.getElementById('specialInstructions').value.trim(),
      priority: document.getElementById('priority').checked
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
      // Success!
      showMessage(formSuccess, `
        ✅ <strong>Migration request submitted successfully!</strong><br>
        <br>
        Request ID: <code>${data.requestId}</code><br>
        <br>
        ${data.message}<br>
        <br>
        You can submit another request or close this window.
      `);
      
      // Reset form
      migrationForm.reset();
      
      // Scroll to success message
      formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
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
    return { valid: false, error: 'WordPress password is required (minimum 6 characters).' };
  }
  
  // Content type
  if (!data.contentType) {
    return { valid: false, error: 'Please select a content type to migrate.' };
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
