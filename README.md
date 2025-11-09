<div align="center">
  <img src="public/liquiDB.png" alt="LiquiDB Logo" width="200" />
  
  # LiquiDB
  
  A modern, lightweight database management tool. Create, manage, and run multiple database instances locally with an intuitive interface.
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![macOS](https://img.shields.io/badge/platform-macOS-blue.svg)](https://www.apple.com/macos/)
  [![Windows](https://img.shields.io/badge/platform-Windows-blue.svg)](https://www.microsoft.com/windows)
  [![Linux](https://img.shields.io/badge/platform-Linux-blue.svg)](https://www.linux.org/)
</div>

## Key Capabilities

LiquiDB provides a comprehensive solution for managing local database instances:

- **Multi-Database Support**: Manage PostgreSQL, MySQL, MongoDB, and Redis databases all in one place
- **Easy Installation**: Automatic database installation with version selection via platform package managers
- **Database Lifecycle Management**: Create, start, stop, and delete database instances with ease
- **Auto-Start**: Configure databases to automatically start when the application launches
- **Port Management**: Automatic port conflict detection and resolution
- **Real-Time Monitoring**: Monitor database status, system metrics, and resource usage
- **Version Management**: Install and manage multiple versions of each database type
- **Process Management**: Automatic cleanup of orphaned processes and proper shutdown handling
- **File Watching**: Monitor database configuration files for changes
- **System Integration**: Native platform integration with proper permissions handling
- **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS

## Quick Start

### Download

Visit [liquidb.app](https://liquidb.app) or [GitHub Releases](https://github.com/alexg-sh/LiquiDB/releases) to download LiquiDB for your platform:

#### macOS
- **File**: `LiquiDB-<version>-universal.dmg` (recommended) or `LiquiDB-<version>-universal-mac.zip`
- **Architecture**: Universal (supports both Intel and Apple Silicon)
- **Installation**:
  1. Open the downloaded `.dmg` file
  2. Drag LiquiDB to your Applications folder
  3. Launch LiquiDB from Applications

#### Windows
- **File**: `LiquiDB Setup <version>.exe` (installer) or `LiquiDB-<version>-win.zip` (portable)
- **Architecture**: x64
- **Installation**:
  - **Installer**: Run the `.exe` file and follow the installation wizard
  - **Portable**: Extract the `.zip` file and run `LiquiDB.exe`

#### Linux
- **File**: `LiquiDB-<version>.AppImage` (recommended) or `LiquiDB-<version>.deb`
- **Architecture**: x64
- **Installation**:
  - **AppImage**: Make executable (`chmod +x LiquiDB-<version>.AppImage`) and run
  - **DEB**: Install with `sudo dpkg -i LiquiDB-<version>.deb` or your package manager

### First Steps

1. **Grant Permissions**
   - LiquiDB will request necessary permissions for database management
   - Follow the on-screen prompts to grant required permissions

2. **Create Your First Database**
   - Click the "Add Database" button
   - Select a database type (PostgreSQL, MySQL, MongoDB, or Redis)
   - Choose a version and configure settings
   - Click "Create" to install and start your database

### Requirements

#### macOS
- macOS 10.15 (Catalina) or later
- Homebrew (for database installation)
- Administrator permissions (for database management)

#### Windows
- Windows 10 or later
- Administrator permissions (for database management)
- Package manager for database installation (Chocolatey recommended)

#### Linux
- Ubuntu 18.04+ / Debian 10+ / Fedora 32+ / or compatible distribution
- Administrator permissions (for database management)
- Package manager for database installation (apt, yum, dnf, etc.)

## Support

- **Website**: [liquidb.app](https://liquidb.app)
- **Email**: [support@liquidb.app](mailto:support@liquidb.app)
- **GitHub Issues**: [Report a bug or request a feature](https://github.com/alexg-sh/LiquiDB/issues)

For security vulnerabilities, please see our [Security Policy](SECURITY.md).

## Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help makes LiquiDB better for everyone.

Please read our [Contributing Guide](CONTRIBUTING.md) to get started. It includes:

- How to set up your development environment
- Our coding standards and commit message conventions
- How to submit pull requests
- Our code of conduct

### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following our [commit message conventions](CONTRIBUTING.md#commit-messages)
4. Test your changes thoroughly
5. Submit a pull request

For more details, see our [Contributing Guide](CONTRIBUTING.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/), [React](https://react.dev/), and [Next.js](https://nextjs.org/)
- UI components powered by [Radix UI](https://www.radix-ui.com/) and [shadcn/ui](https://ui.shadcn.com/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)

---

<div align="center">
  Made with ❤️ for developers everywhere
</div>
