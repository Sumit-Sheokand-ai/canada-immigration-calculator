/**
 * Input Sanitization Utilities
 * Prevents XSS attacks by sanitizing user input
 */

/**
 * Sanitize string input by removing HTML tags and dangerous characters
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  
  // Remove HTML tags
  let clean = str.replace(/<[^>]*>/g, '');
  
  // Escape special HTML characters
  const htmlEscapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  
  clean = clean.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char]);
  
  return clean;
}

/**
 * Sanitize numeric input
 */
export function sanitizeNumber(value) {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Validate and sanitize URL
 */
export function sanitizeURL(url) {
  if (typeof url !== 'string') return '';
  
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    return '';
  }
  
  return '';
}

/**
 * Sanitize object keys and values
 */
export function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return {};
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleanKey = sanitizeString(key);
    
    if (typeof value === 'string') {
      sanitized[cleanKey] = sanitizeString(value);
    } else if (typeof value === 'number') {
      sanitized[cleanKey] = sanitizeNumber(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[cleanKey] = sanitizeObject(value);
    } else {
      sanitized[cleanKey] = value;
    }
  }
  
  return sanitized;
}

/**
 * Rate limiting helper - prevents abuse
 */
export class RateLimiter {
  constructor(maxAttempts = 10, windowMs = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = new Map();
  }
  
  isAllowed(key) {
    const now = Date.now();
    const userAttempts = this.attempts.get(key) || [];
    
    // Filter attempts within the time window
    const recentAttempts = userAttempts.filter(time => now - time < this.windowMs);
    
    if (recentAttempts.length >= this.maxAttempts) {
      return false;
    }
    
    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    
    return true;
  }
  
  reset(key) {
    this.attempts.delete(key);
  }
}
