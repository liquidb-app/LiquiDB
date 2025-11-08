#!/usr/bin/env tsx

/**
 * Update version in package.json
 * Usage: tsx scripts/update-version.ts <version>
 * Example: tsx scripts/update-version.ts 1.0.0
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const version = process.argv[2];

if (!version) {
  console.error('Error: Version argument is required');
  console.error('Usage: tsx scripts/update-version.ts <version>');
  process.exit(1);
}

// Validate semantic version format
const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/;
if (!semverRegex.test(version)) {
  console.error(`Error: Invalid version format: ${version}`);
  console.error('Version must follow semantic versioning (e.g., 1.0.0 or 1.0.0-beta)');
  process.exit(1);
}

const packageJsonPath = join(process.cwd(), 'package.json');

try {
  // Read package.json
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  
  // Update version
  const oldVersion = packageJson.version;
  packageJson.version = version;
  
  // Write updated package.json
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  
  console.log(`Version updated from ${oldVersion} to ${version}`);
  console.log(`Updated ${packageJsonPath}`);
} catch (error: any) {
  console.error('Error updating version:', error.message);
  process.exit(1);
}

