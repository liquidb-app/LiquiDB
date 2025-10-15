# LiquiDB Development Guide

## Architecture Overview

LiquiDB is built using a modern stack combining Electron for the desktop application framework, Next.js for the frontend, and ShadCN/UI for the component library.

### Technology Stack

- **Electron**: Desktop application framework
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe JavaScript
- **ShadCN/UI**: Modern component library
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Headless UI primitives

## Project Structure

```
liquidb/
├── electron/                 # Electron main process
│   ├── main.ts              # Main process entry point
│   ├── preload.ts           # Preload script for secure IPC
│   └── services/            # Backend services
│       └── database-installer.ts
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── globals.css      # Global styles
│   │   ├── layout.tsx       # Root layout
│   │   └── page.tsx         # Home page
│   ├── components/          # React components
│   │   ├── ui/              # ShadCN/UI components
│   │   ├── AddDatabaseDialog.tsx
│   │   └── DatabaseCard.tsx
│   ├── lib/                 # Utility functions
│   │   └── utils.ts
│   └── types/               # TypeScript definitions
│       ├── database.ts
│       └── electron.d.ts
├── dist/                    # Compiled Electron code
├── out/                     # Next.js build output
└── release/                 # Distribution packages
```

## Database Support

### Supported Databases

1. **PostgreSQL** (Port 5432)
   - Versions: 16.1, 15.5, 14.10, 13.13, 12.17
   - Installation: `brew install postgresql@16`

2. **MySQL** (Port 3306)
   - Versions: 8.0.35, 8.0.34, 8.0.33, 5.7.44, 5.6.51
   - Installation: `brew install mysql@8.0`

3. **MariaDB** (Port 3306)
   - Versions: 11.2.2, 11.1.3, 10.11.6, 10.10.7, 10.9.9
   - Installation: `brew install mariadb@11`

4. **MongoDB** (Port 27017)
   - Versions: 7.0.4, 6.0.13, 5.0.22, 4.4.25, 4.2.25
   - Installation: `brew tap mongodb/brew && brew install mongodb-community`

5. **Cassandra** (Port 9042)
   - Versions: 4.1.3, 4.0.11, 3.11.16, 3.0.28
   - Installation: `brew install cassandra`

6. **Microsoft SQL Server** (Port 1433)
   - Versions: 2022, 2019, 2017, 2016
   - Installation: Docker or manual installation

7. **Amazon Redshift** (Port 5439)
   - Versions: 1.0.0, 0.9.0
   - Installation: AWS managed service

## Development Workflow

### Prerequisites

- Node.js 18+
- npm or yarn
- macOS (Intel or Apple Silicon)
- Homebrew (for database installations)

### Getting Started

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd liquidb
   npm install
   ```

2. **Development Mode**
   ```bash
   npm run dev
   ```
   This starts both Next.js dev server and Electron in development mode.

3. **Build for Production**
   ```bash
   npm run build
   npm run dist:mac
   ```

### Adding New Database Types

1. **Update Database Types**
   ```typescript
   // electron/main.ts
   ipcMain.handle('get-database-types', async () => {
     return [
       // ... existing types
       { id: 'new-db', name: 'New Database', defaultPort: 1234, icon: '🆕' },
     ];
   });
   ```

2. **Add Version Support**
   ```typescript
   // electron/main.ts
   const versions = {
     // ... existing versions
     'new-db': ['1.0.0', '0.9.0'],
   };
   ```

3. **Update Installation Logic**
   ```typescript
   // electron/services/database-installer.ts
   private static getHomebrewPackageName(dbType: string, version: string): string {
     const packages = {
       // ... existing packages
       'new-db': 'new-database-package',
     };
     return packages[dbType] || dbType;
   }
   ```

## IPC Communication

The application uses Electron's IPC (Inter-Process Communication) for secure communication between the main process and renderer process.

### Main Process Handlers

- `get-database-types`: Returns available database types
- `get-database-versions`: Returns versions for a specific database type
- `select-folder`: Opens folder selection dialog
- `install-database`: Installs a new database instance
- `get-installed-databases`: Returns list of installed databases
- `start-database`: Starts a database service
- `stop-database`: Stops a database service
- `delete-database`: Removes a database instance

### Preload Script

The preload script (`electron/preload.ts`) exposes a secure API to the renderer process:

```typescript
window.electronAPI = {
  getDatabaseTypes: () => ipcRenderer.invoke('get-database-types'),
  // ... other methods
};
```

## UI Components

### ShadCN/UI Components Used

- `Button`: Interactive buttons with variants
- `Card`: Container components for database cards
- `Dialog`: Modal dialogs for forms
- `Input`: Text input fields
- `Label`: Form labels
- `Select`: Dropdown selectors

### Custom Components

- `AddDatabaseDialog`: Modal for adding new databases
- `DatabaseCard`: Card component for displaying database instances

## Styling

The application uses Tailwind CSS with a custom design system based on ShadCN/UI:

- **Colors**: Semantic color tokens (primary, secondary, muted, etc.)
- **Typography**: Inter font family
- **Spacing**: Consistent spacing scale
- **Components**: Reusable component variants

## Building and Distribution

### Development Build
```bash
npm run build
```

### Production Distribution
```bash
npm run dist:mac
```

This creates a DMG file for macOS distribution with support for both Intel and Apple Silicon architectures.

## Security Considerations

1. **Context Isolation**: Enabled to prevent direct Node.js access from renderer
2. **Preload Script**: Secure API exposure through preload script
3. **Input Validation**: All user inputs are validated
4. **File System Access**: Limited to user-selected directories

## Future Enhancements

1. **Real Database Installation**: Integrate with Homebrew for actual database installation
2. **Database Management**: Add query interface and database administration tools
3. **Connection Management**: Add connection pooling and management
4. **Backup/Restore**: Implement database backup and restore functionality
5. **Performance Monitoring**: Add database performance metrics
6. **Plugin System**: Allow third-party database support through plugins

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
