# Security Features

This document outlines the security measures implemented in the CRS Calculator to protect against common web vulnerabilities.

## 🛡️ Implemented Security Features

### 1. Content Security Policy (CSP)
**Protects against**: XSS (Cross-Site Scripting) attacks, code injection

**Implementation**: 
- Meta tag in `index.html`
- `_headers` file for GitHub Pages (if supported)

**Policy**:
```
default-src 'self'
script-src 'self' 'unsafe-inline' https://plausible.io
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
font-src 'self' https://fonts.gstatic.com
img-src 'self' data: https:
connect-src 'self' https://plausible.io
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
upgrade-insecure-requests
```

### 2. XSS Protection Headers
**Protects against**: Cross-site scripting attacks

**Headers**:
- `X-XSS-Protection: 1; mode=block` - Browser XSS filter
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing

### 3. Clickjacking Protection
**Protects against**: UI redressing attacks, iframe embedding

**Headers**:
- `X-Frame-Options: DENY` - Prevents site from being framed
- `frame-ancestors 'none'` (in CSP) - Modern alternative

### 4. HTTPS Enforcement
**Protects against**: Man-in-the-middle attacks, eavesdropping

**Implementation**:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `upgrade-insecure-requests` in CSP
- GitHub Pages automatic HTTPS

### 5. Input Sanitization
**Protects against**: XSS, SQL injection (client-side), data manipulation

**Implementation**: `src/utils/sanitize.js`
- HTML tag removal
- Special character escaping
- URL validation
- Object deep sanitization

**Usage**:
```javascript
import { sanitizeString, sanitizeObject } from './utils/sanitize';

const cleanInput = sanitizeString(userInput);
const cleanData = sanitizeObject(formData);
```

### 6. Rate Limiting
**Protects against**: Brute force, DDoS, abuse

**Implementation**: `RateLimiter` class in `src/utils/sanitize.js`

**Usage**:
```javascript
import { RateLimiter } from './utils/sanitize';

const limiter = new RateLimiter(10, 60000); // 10 attempts per minute

if (!limiter.isAllowed(userId)) {
  alert('Too many attempts. Please try again later.');
}
```

### 7. Secure Data Storage
**Protects against**: Data theft, session hijacking

**Implementation**:
- localStorage only (no sensitive data stored)
- No cookies or session tokens
- Data auto-cleared on completion
- No API keys or secrets in client code

### 8. Cross-Origin Policies
**Protects against**: CSRF, information leakage

**Headers**:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

### 9. Referrer Policy
**Protects against**: Information leakage via referer header

**Header**: `Referrer-Policy: strict-origin-when-cross-origin`

### 10. Permissions Policy
**Protects against**: Unauthorized access to browser APIs

**Disabled features**:
- Geolocation
- Microphone
- Camera
- Payment
- USB
- Magnetometer
- Gyroscope
- Accelerometer

---

## 🚨 Vulnerability Protection Matrix

| Attack Type | Protection Mechanism | Status |
|-------------|---------------------|--------|
| XSS (Reflected) | CSP + Input Sanitization | ✅ |
| XSS (Stored) | Input Sanitization + No Backend | ✅ |
| XSS (DOM-based) | CSP + React Auto-escaping | ✅ |
| SQL Injection | No Backend Database | ✅ |
| CSRF | SameSite + No Forms to Backend | ✅ |
| Clickjacking | X-Frame-Options + CSP | ✅ |
| MIME Sniffing | X-Content-Type-Options | ✅ |
| Man-in-the-Middle | HTTPS + HSTS | ✅ |
| DDoS / Brute Force | Rate Limiting | ✅ |
| Information Disclosure | CSP + Referrer Policy | ✅ |

---

## 🔒 Best Practices

### For Developers

1. **Never use `dangerouslySetInnerHTML`** in React components
2. **Always sanitize** user input before processing
3. **Validate** all form inputs on the client side
4. **Use environment variables** for any API keys (not applicable currently)
5. **Keep dependencies updated** to patch security vulnerabilities
6. **Review** security headers regularly

### For Users

1. **Use HTTPS** - Always access via `https://bostify.me`
2. **Keep browser updated** - Modern browsers have built-in security
3. **Clear browser data** if using a public computer
4. **Don't share** your results URL if it contains sensitive info

---

## 🔍 Security Auditing

### Manual Testing
```bash
# Check CSP headers
curl -I https://bostify.me

# Test XSS protection
# Try entering: <script>alert('XSS')</script> in any input
# Expected: Should be sanitized/escaped
```

### Automated Tools
- [Mozilla Observatory](https://observatory.mozilla.org/) - Security headers scan
- [SecurityHeaders.com](https://securityheaders.com/) - Header analysis
- [OWASP ZAP](https://www.zaproxy.org/) - Vulnerability scanner

---

## 📝 Security Checklist

- [x] Content Security Policy implemented
- [x] HTTPS enforced via HSTS
- [x] XSS protection headers
- [x] Clickjacking protection
- [x] Input sanitization utilities
- [x] Rate limiting mechanism
- [x] No sensitive data storage
- [x] Cross-origin policies
- [x] Referrer policy configured
- [x] Permissions policy restrictive
- [x] Dependencies audit clean (`npm audit`)
- [x] No hardcoded secrets
- [x] React auto-escaping enabled (default)

---

## 🐛 Reporting Security Issues

If you discover a security vulnerability, please:

1. **DO NOT** open a public issue
2. Email: [Your email or GitHub security advisories]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

---

## 📚 References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [Content Security Policy Guide](https://content-security-policy.com/)
- [React Security Best Practices](https://react.dev/learn/escape-hatches)

---

## 🔄 Last Updated

**Date**: 2026-02-11  
**Version**: 2.0  
**Reviewed by**: Development Team
