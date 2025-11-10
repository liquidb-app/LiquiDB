# Security Policy

## Supported Versions

We actively support security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.6.x   | :white_check_mark: |
| < 1.6   | :x:                |

## Reporting a Vulnerability

We take the security of LiquiDB seriously. If you discover a security vulnerability, please follow these steps:

### How to Report

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email security details to: **team@liquidb.app**
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact and severity
   - Suggested fix (if available)
   - Your contact information (optional)

### What to Expect

- **Initial Response**: We will acknowledge receipt of your report within 48 hours
- **Assessment**: We will assess the vulnerability within 7 days
- **Updates**: We will provide regular updates on the status of the vulnerability
- **Resolution**: We will work to resolve critical vulnerabilities as quickly as possible

### Disclosure Policy

- We will credit you for the discovery (unless you prefer to remain anonymous)
- We will coordinate with you on the disclosure timeline
- We will publish a security advisory once the vulnerability is patched

### Security Best Practices

When using LiquiDB:

- Keep the application updated to the latest version
- Use strong passwords for database instances
- Be cautious when exposing database ports to external networks
- Review and understand the permissions requested by the application
- Report suspicious behavior or potential security issues immediately

### Scope

The following are considered in-scope for security reporting:

- Remote code execution vulnerabilities
- Privilege escalation issues
- Authentication and authorization flaws
- Data exposure or leakage
- Injection vulnerabilities (SQL, command, etc.)
- Cross-site scripting (XSS) in the Electron renderer
- Insecure data storage
- Network security issues

The following are generally **out of scope**:

- Denial of service attacks
- Social engineering attacks
- Physical security issues
- Issues requiring physical access to the device
- Issues in third-party dependencies (please report to the respective maintainers)

### Security Updates

Security updates will be released as patch versions (e.g., 1.4.3 → 1.4.4) and will be available through:

- GitHub Releases
- Built-in auto-update mechanism (if enabled)
- The application's official website

Thank you for helping keep LiquiDB secure!

