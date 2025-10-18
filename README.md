# LiquiDB - Modern Database Management for macOS

A sophisticated Electron-based database management application designed specifically for macOS developers.

## Development

Install dependencies:
\`\`\`bash
npm install
# or
pnpm install
\`\`\`

Run the development server:
\`\`\`bash
npm run dev
# or
pnpm dev
\`\`\`

This will start both the Next.js development server and Electron app.

## Building

Build for macOS:
\`\`\`bash
npm run electron:build:mac
\`\`\`

Build for Windows:
\`\`\`bash
npm run electron:build:win
\`\`\`

Build for Linux:
\`\`\`bash
npm run electron:build:linux
\`\`\`

## Features

- One-click installation of PostgreSQL, MySQL, MariaDB, MongoDB, and Cassandra
- Database lifecycle management (start/stop/restart)
- Port conflict detection and resolution
- Custom database icons and configuration
- Dark/Light mode with custom color schemes
- Blacklisted ports management

## Tech Stack

- Electron
- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui
