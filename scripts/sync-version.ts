#!/usr/bin/env tsx

/**
 * Synchronize version across all files
 * Reads version from package.json and ensures it's synced everywhere
 * Usage: tsx scripts/sync-version.ts [version]
 * 
 * If version is provided, updates package.json first, then syncs
 * If no version provided, reads from package.json and verifies sync
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const packageJsonPath = join(process.cwd(), 'package.json');

try {
  // Read package.json
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  
  // If version argument provided, update package.json first
  const versionArg = process.argv[2];
  if (versionArg) {
    // Validate semantic version format
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[0-9]+)?)?$/;
    if (!semverRegex.test(versionArg)) {
      console.error(`Error: Invalid version format: ${versionArg}`);
      console.error('Version must follow semantic versioning (e.g., 1.0.0 or 1.0.0-beta.1)');
      process.exit(1);
    }
    
    packageJson.version = versionArg;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`Updated package.json version to ${versionArg}`);
  }
  
  const version = packageJson.version;
  
  if (!version) {
    console.error('Error: No version found in package.json');
    process.exit(1);
  }
  
  console.log(`Version: ${version}`);
  console.log(`✅ Version is synced in package.json`);
  
  // Note: electron-builder automatically syncs package.json version to Info.plist during build
  // The app.getVersion() reads from the built app's Info.plist, which comes from package.json
  // So no manual sync is needed - electron-builder handles it during the build process
  
  console.log(`ℹ️  Version will be automatically synced to app bundle during build by electron-builder`);
  console.log(`ℹ️  app.getVersion() will read from Info.plist, which is generated from package.json`);
  
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error syncing version:', errorMessage);
  process.exit(1);
}

