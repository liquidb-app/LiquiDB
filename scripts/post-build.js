#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('[Post Build] Creating README for dist folder...');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// Check if dist exists
if (!fs.existsSync(distDir)) {
  console.log('[Post Build] No dist directory found, skipping README creation');
  process.exit(0);
}

const readmeContent = `# LiquiDB Build Output

This directory contains the built Electron application.

## Important Notes

### macOS Users

**DO NOT run the app from \`dist/mac-arm64/Electron.app\` directly!**

The app in this folder is named "Electron.app" because it hasn't been fully packaged yet.

**Use one of these instead:**

1. **Recommended**: Install the DMG file:
   - Look for \`LiquiDB-*.dmg\` in this directory
   - Double-click to mount and drag LiquiDB.app to Applications

2. **Or use the ZIP file**:
   - Look for \`LiquiDB-*-mac.zip\`
   - Extract and run LiquiDB.app

3. **Development/Testing**: If you need to run from dist folder:
   \`\`\`bash
   # This will run it properly:
   open dist/mac-arm64/Electron.app
   
   # Or use the command line to see errors:
   dist/mac-arm64/Electron.app/Contents/MacOS/Electron
   \`\`\`

## Troubleshooting

If the app doesn't start, check:

1. **Log file**: \`~/Library/Application Support/LiquiDB/app.log\`
2. **Canary file**: \`~/Library/Application Support/LiquiDB/app-started.txt\`
3. **Console**: Run from terminal to see error messages:
   \`\`\`bash
   /path/to/LiquiDB.app/Contents/MacOS/LiquiDB
   \`\`\`

## Build Structure

\`\`\`
dist/
├── mac-arm64/
│   └── Electron.app           # Unpacked app (not renamed yet)
├── LiquiDB-*.dmg              # Install this!
├── LiquiDB-*-mac.zip          # Or extract this!
└── README.md                  # This file
\`\`\`

## Technical Details

The app is named "Electron.app" in the mac-arm64 folder because electron-builder
creates it there before packaging it into the final DMG/ZIP with the correct name.

The DMG and ZIP files contain the properly named "LiquiDB.app".
`;

try {
  const readmePath = path.join(distDir, 'README.md');
  fs.writeFileSync(readmePath, readmeContent);
  console.log('[Post Build] ✓ Created README at:', readmePath);
} catch (error) {
  console.error('[Post Build] Error creating README:', error.message);
}
