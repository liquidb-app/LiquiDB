#!/usr/bin/env tsx

/**
 * Automatically bump version based on commit messages (conventional commits)
 * Simplified version for use in GitHub Actions workflows
 * Usage: tsx scripts/auto-version-bump.ts [major|minor|patch]
 * 
 * If no argument provided, defaults to patch bump
 */

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

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
  const bumpType = (process.argv[2] as BumpType) || 'patch';
  if (!['major', 'minor', 'patch'].includes(bumpType)) {
    console.error('Invalid bump type. Use major, minor, or patch.');
    process.exit(1);
  }

  const packageJsonPath = join(process.cwd(), 'package.json');

  try {
    // Read package.json
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const currentVersion = packageJson.version;
    
    if (!currentVersion) {
      console.error('Error: No version found in package.json');
      process.exit(1);
    }
    
    const newVersion = bumpVersion(currentVersion, bumpType);
    
    if (newVersion === currentVersion) {
      console.log(`Version is already ${currentVersion}`);
      // Output version for workflow use (GITHUB_OUTPUT format)
      const githubOutput = process.env.GITHUB_OUTPUT;
      if (githubOutput) {
        const output = `version=${currentVersion}\nbump_type=none\n`;
        appendFileSync(githubOutput, output);
      }
      process.exit(0);
    }
    
    // Update version
    packageJson.version = newVersion;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    
    console.log(`✅ Version bumped from ${currentVersion} to ${newVersion} (${bumpType})`);
    console.log(`Updated ${packageJsonPath}`);
    
    // Output in GITHUB_OUTPUT format (for GitHub Actions)
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      const output = `version=${newVersion}\nold_version=${currentVersion}\nbump_type=${bumpType}\n`;
      appendFileSync(githubOutput, output);
    }
    
    // Output new version to stdout for easy capture
    console.log(newVersion);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error bumping version:', errorMessage);
    process.exit(1);
  }
}

main();

