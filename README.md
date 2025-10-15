# LiquiDB

A modern database management application for macOS built with Electron, Next.js, and ShadCN/UI.

## Features

- **Multi-Database Support**: PostgreSQL, MySQL, MariaDB, MongoDB, Cassandra, Microsoft SQL Server, and Amazon Redshift
- **Easy Installation**: One-click database installation with automatic configuration
- **macOS Optimized**: Native macOS experience with Intel and Apple Silicon support
- **Modern UI**: Beautiful interface built with ShadCN/UI components
- **Database Management**: Start, stop, and manage your database instances

## Supported Databases

- 🐘 **PostgreSQL** (Port 5432)
- 🐬 **MySQL** (Port 3306)
- 🐚 **MariaDB** (Port 3306)
- 🍃 **MongoDB** (Port 27017)
- ☁️ **Cassandra** (Port 9042)
- 🗄️ **Microsoft SQL Server** (Port 1433)
- 🔴 **Amazon Redshift** (Port 5439)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- macOS (Intel or Apple Silicon)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/liquidb.git
cd liquidb
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

### Building for Production

```bash
# Build the application
npm run build

# Create a distributable package
npm run dist:mac
```

## Development

### Project Structure

```
liquidb/
├── electron/           # Electron main process
├── src/
│   ├── app/           # Next.js app directory
│   ├── components/    # React components
│   ├── lib/          # Utility functions
│   └── types/        # TypeScript type definitions
├── dist/             # Compiled Electron code
└── out/              # Next.js build output
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run dist:mac` - Create macOS distribution

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.