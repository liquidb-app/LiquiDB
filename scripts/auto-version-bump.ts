#!/usr/bin/env tsx

/**
 * Automatically bump version based on commit messages (conventional commits)
 * Simplified version for use in GitHub Actions workflows
 * Usage: tsx scripts/auto-version-bump.ts [current_version] [major|minor|patch]
 * 
 * If no bump type argument provided, defaults to patch bump
 */

import fs from 'fs';
import path from 'path';

type BumpType = 'major' | 'minor' | 'patch';

function bumpVersion(version: string, type: BumpType): string {
  const [major, minor, patch] = version.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${type}`);
  }
}

function main() {
  const currentVersion = process.argv[2];
  const bumpType = (process.argv[3] as BumpType) || 'patch';

  if (!currentVersion) {
    console.error('Current version is required as the first argument.');
    process.exit(1);
  }

  if (!['major', 'minor', 'patch'].includes(bumpType)) {
    console.error('Invalid bump type. Use major, minor, or patch.');
    process.exit(1);
  }

  const newVersion = bumpVersion(currentVersion, bumpType);

  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

  console.log(newVersion);
}

main();

