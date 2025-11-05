# LiquiDB - macOS Build Notes

## Summary of Changes

This document outlines all the changes made to fix the Electron build for macOS and ensure the app works correctly.

## Issues Fixed

### 1. Next.js Standalone Build Configuration
**Problem:** The Next.js standalone build wasn't properly configured with static files and public assets.

**Solution:**
- Created `scripts/prepare-standalone.js` to copy static files and public directory into the standalone build
- Updated build scripts to run preparation before electron-builder
- Standalone build now includes all necessary files at `.next/standalone/`

### 2. Font Loading (Google Fonts → Vercel Geist)
**Problem:** Google Fonts caused build failures in offline/sandboxed environments.

**Solution:**
- Installed `geist` npm package (Vercel's official font package)
- Updated `app/layout.tsx` to use `GeistSans` and `GeistMono`
- Font files are now bundled with the app (no external network requests)
- Works offline and in packaged builds

### 3. Node.js Dependency
**Problem:** The app required Node.js to be installed on the user's system to run the Next.js server.

**Solution:**
- Created `scripts/download-node.js` to download Node.js binaries for both arm64 and x64
- Updated electron-builder config to bundle Node.js binaries
- Modified `electron/main.js` to use bundled Node.js first, with fallback to system Node.js
- App now works without requiring Node.js installation

### 4. Electron-Builder Configuration
**Problem:** Files weren't being packaged correctly for production.

**Solution:**
- Updated `build.files` to include standalone directory and resources
- Configured `asarUnpack` for standalone files and bundled binaries
- Added `extraResources` to properly bundle architecture-specific Node.js
  - Uses `${arch}` template variable (electron-builder replaces with 'arm64' or 'x64')
  - Copies correct Node.js binary for the target architecture

## Build Process

### Prerequisites
- Node.js (for development)
- npm dependencies installed

### Build Commands

```bash
# Install dependencies
npm install

# Build for macOS (downloads Node.js, builds Next.js, packages app)
npm run electron:build:mac

# Or manually:
npm run prepare:node          # Download Node.js binaries
npm run build                 # Build Next.js
npm run prepare:standalone    # Prepare standalone with static files
electron-builder --mac        # Package Electron app
```

### Build Output
- `.dmg` and `.zip` files in `dist/` directory
- App includes:
  - Bundled Node.js v20.18.1 (arm64 and x64)
  - Next.js standalone server
  - All static assets and fonts
  - Electron app with proper configuration

## Architecture

### Production App Structure
```
LiquiDB.app/
├── Contents/
│   ├── MacOS/
│   │   └── LiquiDB (Electron executable)
│   ├── Resources/
│   │   ├── bin/
│   │   │   └── bin/
│   │   │       └── node (bundled Node.js)
│   │   ├── app.asar.unpacked/
│   │   │   └── .next/
│   │   │       └── standalone/
│   │   │           ├── server.js
│   │   │           ├── .next/ (build files)
│   │   │           ├── public/ (static assets)
│   │   │           └── node_modules/ (dependencies)
│   │   └── electron/ (main process files)
```

### Runtime Flow
1. Electron launches `electron/main.js`
2. Main process checks for bundled Node.js at `Resources/bin/bin/node`
3. Spawns Node.js process to run `.next/standalone/server.js`
4. Next.js server starts on port 3000
5. Electron window loads `http://localhost:3000`
6. UI is rendered with bundled Geist fonts

## Key Files

### Scripts
- `scripts/download-node.js` - Downloads Node.js binaries for bundling
- `scripts/prepare-standalone.js` - Prepares standalone build with static files

### Configuration
- `package.json` - Build scripts and electron-builder config
- `next.config.mjs` - Next.js with standalone output
- `electron/main.js` - Main process with bundled Node.js support

### Dependencies
- `geist` - Vercel's font package (bundled)
- `electron` - v39.0.0
- `next` - v15.5.4
- Node.js v20.18.1 (bundled, not in package.json)

## Testing

### Verify Build Components
```bash
# Check Node.js binaries
ls -lh resources/bin/*/bin/node

# Check standalone build
ls -la .next/standalone/

# Test standalone server
cd .next/standalone && PORT=3001 node server.js
```

### Development Mode
```bash
npm run dev  # Runs Next.js dev server + Electron
```

### Production Testing
Since we're in a Linux environment, actual macOS app testing must be done on macOS. However, all components have been verified:
- ✅ Next.js builds successfully
- ✅ Standalone server runs correctly
- ✅ Node.js binaries downloaded for both architectures
- ✅ Fonts are bundled (no external requests)
- ✅ All files are properly configured for electron-builder

## Homebrew Note

Homebrew is **not bundled** with the app because:
- Large size (~500MB+ base, several GB with databases)
- System-specific installation requirements
- Updates frequently

The app handles Homebrew by:
- Detecting if Homebrew is installed
- Automatically installing Homebrew if needed (with user permission)
- Managing database installations through Homebrew

## File Size Estimates

- Base Electron app: ~200MB
- Bundled Node.js: ~90MB per architecture (180MB for universal)
- Next.js build: ~50MB
- Total app size: ~430-450MB

## Security Considerations

- Node.js binaries are official builds from nodejs.org
- ASAR unpacking allows proper execution of standalone server
- No external network requests for fonts or core functionality
- Homebrew installation is done through official Homebrew install script

## Known Limitations

1. **macOS Only**: Current configuration is for macOS only
2. **Architecture**: Supports both Apple Silicon (arm64) and Intel (x64)
3. **Node.js Version**: Bundled v20.18.1 (LTS) - update `scripts/download-node.js` to change

## Future Improvements

1. Add Windows and Linux build configurations
2. Consider bundling common database binaries
3. Add auto-update mechanism
4. Optimize bundle size with compression
5. Add code signing and notarization for macOS

## Troubleshooting

### App doesn't open
- Check Console.app for error messages
- Verify Node.js binary exists in app bundle
- Check that standalone server files are present

### Fonts not loading
- Verify `.next/standalone/.next/static` contains font files
- Check browser console for font loading errors

### Database management issues
- These are handled by Homebrew, not related to the Electron build
- Check Homebrew installation and database binaries

## Build Verification Checklist

Before releasing:
- [ ] Build completes without errors
- [ ] .dmg and .zip files are created
- [ ] App opens and shows UI
- [ ] Fonts render correctly
- [ ] Database management features work
- [ ] Settings persist between launches
- [ ] Auto-start works if enabled
- [ ] App works on both Apple Silicon and Intel Macs
