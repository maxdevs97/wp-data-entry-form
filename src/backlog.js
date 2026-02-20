const fs = require('fs').promises;
const path = require('path');

/**
 * Add migration request to Kit's backlog.md (## Inbox section)
 */
async function addToKitBacklog(submissionData) {
  const backlogPath = process.env.KIT_BACKLOG_PATH || '/Users/max/.openclaw/workspace/backlog.md';
  
  try {
    // Read current backlog
    let backlogContent = '';
    try {
      backlogContent = await fs.readFile(backlogPath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create new backlog if doesn't exist
        backlogContent = '# Backlog\n\n## Inbox\n\n';
      } else {
        throw error;
      }
    }

    // Format the task entry
    const taskEntry = formatTaskEntry(submissionData);

    // Find ## Inbox section
    const inboxRegex = /^## Inbox\s*$/m;
    const inboxMatch = backlogContent.match(inboxRegex);

    if (inboxMatch) {
      // Insert after ## Inbox header
      const insertPosition = inboxMatch.index + inboxMatch[0].length;
      backlogContent = 
        backlogContent.slice(0, insertPosition) + 
        '\n\n' + taskEntry + 
        backlogContent.slice(insertPosition);
    } else {
      // Append ## Inbox section if it doesn't exist
      backlogContent += '\n\n## Inbox\n\n' + taskEntry;
    }

    // Write back to file
    await fs.writeFile(backlogPath, backlogContent, 'utf-8');
    
    console.log(`✅ Added task to Kit's backlog: ${backlogPath}`);
    return { success: true };

  } catch (error) {
    console.error('Error adding to backlog:', error);
    throw new Error(`Failed to add to Kit's backlog: ${error.message}`);
  }
}

/**
 * Format task entry for backlog
 */
function formatTaskEntry(data) {
  const priorityFlag = data.priority === 'Urgent' ? '🔴 ' : '';
  const timestamp = new Date(data.timestamp).toLocaleString('en-US', { 
    timeZone: 'America/Chicago',
    dateStyle: 'short',
    timeStyle: 'short'
  });

  const postTypesFormatted = Array.isArray(data.postTypes) 
    ? data.postTypes.join(', ') 
    : data.postTypes || 'N/A';
  
  const certainPagesFormatted = Array.isArray(data.certainPages) 
    ? data.certainPages.join(', ') 
    : data.certainPages || 'N/A';

  return `### ${priorityFlag}WordPress Migration Request - ${data.requesterName || 'Team Member'}

**Submitted:** ${timestamp}  
**Requester:** ${data.requesterName || 'Team Member'} (${data.requesterEmail || 'team@sheragency.com'})  
**Priority:** ${data.priority || 'Normal'}

**Migration Details:**
- **Source:** ${data.sourceUrl}
- **Destination:** ${data.destinationUrl}
- **WP Username:** ${data.wpUsername}
- **WP Password:** \`${data.wpPassword}\` *(secure)*
- **Content Type:** ${data.contentType || data.contentTypeDisplay}
- **Post Types:** ${postTypesFormatted}
- **Certain Pages:** ${certainPagesFormatted}

**Preservation Settings:**
${data.preserve ? Object.entries(data.preserve).map(([key, value]) => `- ${key}: ${value ? '✓' : '✗'}`).join('\n') : 'Default (all elements)'}

**Special Instructions:**
${data.specialInstructions || 'None'}

**Status:** ${data.status}

**Job ID:** ${data.jobId || 'Pending'}

**Next Steps:**
1. Kit: Review request and validate requirements
2. Kit: Spawn Forge with migration parameters
3. Forge: Execute migration using mybabyswims.com framework
4. Forge: Run QA checks
5. Kit: Send completion email to requester + CC Max

---
`;
}

module.exports = {
  addToKitBacklog
};
