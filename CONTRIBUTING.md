# Contributing to LiquiDB

Thank you for your interest in contributing to LiquiDB! We welcome contributions from the community and are grateful for your help in making this project better.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue list as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Screenshots** (if applicable)
- **Environment details**:
  - macOS version
  - LiquiDB version
  - Node.js version (if relevant)
- **Error messages** or logs (if any)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Clear title and description**
- **Use case**: Why is this enhancement useful?
- **Proposed solution** (if you have ideas)
- **Alternatives considered** (if any)

### Pull Requests

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/database-monitoring`)
3. **Make your changes**
4. **Test your changes** thoroughly
5. **Commit your changes** using conventional commit format (`git commit -m 'feat: add database monitoring feature'`)
6. **Push to the branch** (`git push origin feature/database-monitoring`)
7. **Open a Pull Request**

#### Pull Request Guidelines

- Keep PRs focused and small when possible
- Include a clear description of what the PR does
- Reference related issues (e.g., "Fixes #123")
- Ensure all tests pass (if applicable)
- Update documentation as needed
- Follow the existing code style

## Development Setup

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- macOS (for development and testing)

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/alexg-sh/LiquiDB.git
   cd LiquiDB
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the Next.js application
- `npm run electron:build` - Build the Electron application
- `npm run lint` - Run ESLint
- `npm run electron:compile` - Compile TypeScript for Electron

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Follow existing type definitions
- Avoid `any` types when possible
- Use meaningful variable and function names

### Code Style

- Follow the existing code style in the project
- Use ESLint for code quality
- Format code consistently (consider using Prettier if configured)

### Commit Messages

**Commit messages MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) specification** to ensure proper semantic versioning (semver).

**Format:** `<type>: <subject>`

#### Types That Trigger Releases (use for user-facing changes)

- `feat:` - New feature (minor version: 1.1.0 → 1.2.0)
- `fix:` - Bug fix (patch version: 1.1.0 → 1.1.1)
- `perf:` - Performance improvement (patch version)
- `refactor:` - Code refactoring (patch version)
- `revert:` - Revert commit (patch version)
- `feat!:` - Breaking change (major version: 1.1.0 → 2.0.0)

#### Types That Do NOT Trigger Releases (use for internal changes)

- `chore:` - Dependencies, config, build changes
- `docs:` - Documentation only
- `style:` - Code formatting, whitespace
- `test:` - Test additions or changes
- `build:` - Build system changes
- `ci:` - CI/CD workflow changes

#### Rules

1. Use lowercase type: `fix:`, `feat:`, `chore:` (NOT `Fix:` or `FIX:`)
2. Subject in imperative mood: "add feature" NOT "added feature"
3. No period at end of subject
4. Keep subject concise (under 72 characters)
5. Optional scope: `feat(database): add pooling`
6. Reference issue numbers when applicable (e.g., `feat: add database monitoring (fixes #123)`)

#### Decision Tree

- New user-facing feature? → `feat:`
- Bug fix? → `fix:`
- Performance improvement? → `perf:`
- Code refactoring? → `refactor:`
- Breaking change? → `feat!:` or add `BREAKING CHANGE:` footer
- Documentation only? → `docs:`
- Test change? → `test:`
- Build/CI change? → `build:` or `ci:`
- Dependency/config/internal? → `chore:`
- Just formatting? → `style:`

#### Examples

✅ **Correct:**
- `feat: add dark mode toggle`
- `fix: resolve database connection timeout`
- `perf: optimize query performance by 40%`
- `refactor: improve error handling structure`
- `chore: update dependencies`
- `docs: update README with installation instructions`
- `test: add unit tests for database manager`
- `ci: update GitHub Actions workflow`
- `feat(database): add connection pooling`
- `fix(ui): correct port display in database card`
- `feat!: remove deprecated database config format` (breaking change)

❌ **Incorrect:**
- `Added new feature` (missing type prefix)
- `Switch to react-jsx JSX transform` (missing type prefix)
- `Removed comments (test)` (missing type prefix)
- `Fix: Database bug` (uppercase type)
- `feat: Added dark mode` (past tense, not imperative)
- `feat: add dark mode toggle.` (period at end)

## Project Structure

```
LiquiDB/
├── app/              # Next.js app directory
├── components/       # React components
├── electron/        # Electron main process code
├── helper/          # Helper service code
├── hooks/           # React hooks
├── lib/             # Shared utilities
├── types/           # TypeScript type definitions
└── public/          # Static assets
```

## Testing

- Test your changes manually before submitting a PR
- Ensure the application builds successfully
- Test on macOS (the primary platform)
- Check for console errors and warnings

## Documentation

- Update README.md if you change setup instructions
- Add JSDoc comments for new functions/classes
- Update CHANGELOG.md for user-facing changes

## Questions?

If you have questions about contributing, feel free to:

- Open an issue with the `question` label
- Contact the maintainers at support@liquidb.app

## License

By contributing to LiquiDB, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to LiquiDB! 🎉

