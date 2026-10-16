/**
 * Parse GitHub issue form body
 * Extracts field values from the markdown-formatted issue body
 */

export function parseIssueBody(body) {
  const fields = {
    siteUrl: '',
    title: '',
    description: '',
    repoUrl: '',
    confirmation: false
  };

  if (!body || typeof body !== 'string') {
    throw new Error('Issue body is empty or invalid');
  }

  // Parse form fields from markdown sections
  const sections = body.split('###').map(s => s.trim());

  for (const section of sections) {
    // Site URL
    if (section.toLowerCase().includes('site url')) {
      const match = section.match(/https?:\/\/[^\s]+/);
      if (match) {
        fields.siteUrl = match[0].trim();
      }
    }

    // Title
    if (section.toLowerCase().includes('title') && !section.toLowerCase().includes('site url')) {
      const lines = section.split('\n');
      if (lines.length > 1) {
        fields.title = lines.slice(1).join(' ').trim();
      }
    }

    // Description
    if (section.toLowerCase().includes('description')) {
      const lines = section.split('\n');
      if (lines.length > 1) {
        fields.description = lines.slice(1).join(' ').trim();
      }
    }

    // Repository URL
    if (section.toLowerCase().includes('repository')) {
      const match = section.match(/https?:\/\/[^\s]+/);
      if (match) {
        fields.repoUrl = match[0].trim();
      }
    }

    // Confirmation checkboxes
    if (section.toLowerCase().includes('confirmation')) {
      fields.confirmation = section.includes('[X]') || section.includes('[x]');
    }
  }

  // Validate required fields
  if (!fields.siteUrl) {
    throw new Error('Site URL is required');
  }

  if (!fields.title) {
    throw new Error('Title is required');
  }

  if (!fields.confirmation) {
    throw new Error('Confirmation checkboxes must be checked');
  }

  return fields;
}
