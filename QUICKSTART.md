# LiquiDB Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- macOS (Intel or Apple Silicon)

### Installation & Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build Electron Main Process**
   ```bash
   npm run build:electron
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

   Or use the convenience script:
   ```bash
   ./scripts/dev.sh
   ```

## 🎯 Using LiquiDB

### Main Interface
- The application opens with a clean, modern interface
- You'll see demo databases (PostgreSQL and MySQL) if none are installed
- Click "Add Database" to install a new database

### Adding a Database

1. **Click "Add Database"** button
2. **Select Database Type** from the dropdown:
   - 🐘 PostgreSQL
   - 🐬 MySQL  
   - 🐚 MariaDB
   - 🍃 MongoDB
   - ☁️ Cassandra
   - 🗄️ Microsoft SQL Server
   - 🔴 Amazon Redshift

3. **Choose Version** from the available versions
4. **Configure Settings**:
   - Database name
   - Port (defaults provided)
   - Data directory (click folder icon to select)

5. **Click "Install Database"** to complete setup

### Managing Databases

- **Start/Stop**: Use the play/stop buttons on each database card
- **Delete**: Click the trash icon to remove a database
- **Status**: Green dot = running, Gray dot = stopped, Red dot = error

## 🛠️ Development

### Project Structure
```
liquidb/
├── electron/           # Electron main process
├── src/
│   ├── app/           # Next.js pages
│   ├── components/    # React components
│   └── types/         # TypeScript definitions
├── dist/              # Compiled Electron code
└── scripts/           # Development scripts
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:electron` - Build Electron main process only
- `npm run dist:mac` - Create macOS distribution

### Building for Production

```bash
# Build the application
npm run build

# Create distributable package
npm run dist:mac
```

## 🔧 Troubleshooting

### Common Issues

1. **"Cannot find module '/dist/main.js'"**
   ```bash
   npm run build:electron
   ```

2. **Port 3000 already in use**
   ```bash
   # Kill existing processes
   pkill -f "next dev"
   pkill -f "electron"
   
   # Restart
   npm run dev
   ```

3. **Dependencies not installed**
   ```bash
   npm install
   ```

### Getting Help

- Check the [DEVELOPMENT.md](DEVELOPMENT.md) for detailed technical information
- Review the [README.md](README.md) for project overview
- Check the terminal output for error messages

## 🎉 You're Ready!

LiquiDB is now running and ready to use. The Electron window should be open showing the main interface where you can start managing your databases.

Happy database management! 🚀
