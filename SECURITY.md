# Security Policy

## Supported Versions

We currently support the latest main branch and the most recent tagged release (if any).

## Reporting a Vulnerability

- Please email security reports to security@liquidb.app. If email isn't possible, open a private security advisory on GitHub instead of a public issue.
- Do not disclose the issue publicly until we've had a reasonable chance to investigate and release a fix.
- Include as much detail as possible: version, environment, PoC steps, impact, and suggested remediation if known.

## Handling Process

1. We will acknowledge receipt within 72 hours.
2. We will investigate and aim to provide a remediation plan or fix within a reasonable timeframe depending on severity.
3. Once a fix is available, we will publish a release and credit reporters who wish to be acknowledged.

## Best Practices for Users

- Always run the latest version.
- Set strong credentials for database instances; defaults are for local development only.
- Avoid exposing database ports to untrusted networks.
- Prefer unique OS users and limited permissions for database processes.
