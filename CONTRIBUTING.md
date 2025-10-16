# Contributing to LiquiDB

Thanks for your interest in contributing!

## Development Setup

- Node.js LTS and npm
- macOS (for Homebrew and local DB binaries)
- Install deps: `npm install`
- Start dev: `npm run dev`

## Code Style

- TypeScript, strict types where practical
- Prefer small, readable functions
- Match existing formatting; run linters/formatters if present
- Avoid logging secrets; keep logs behind DEBUG flags

## Pull Requests

1. Fork and branch from `main`
2. Write clear commit messages
3. Include tests or manual steps to verify if applicable
4. Ensure `npm run build:electron` passes
5. Submit PR with a concise description and screenshots for UI changes

## Issues

- Use the issue templates if available
- Provide steps to reproduce, expected vs. actual behavior, and environment details

## Security

- Please report vulnerabilities privately (see SECURITY.md)

## License

- By contributing, you agree your contributions are licensed under the project license (MIT)
