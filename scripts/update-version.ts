#!/usr/bin/env tsx

/**
 * Update version in package.json
 * Usage: tsx scripts/update-version.ts <version>
 * Example: tsx scripts/update-version.ts 1.0.0
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

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
  
  // Optionally create tag if --tag flag is provided
  if (process.argv.includes('--tag')) {
    const tag = `v${version}`;
    
    try {
      // Check if tag already exists
      execSync(`git rev-parse ${tag}`, { stdio: 'ignore' });
      console.log(`Tag ${tag} already exists`);
    } catch {
      // Tag doesn't exist, create it
      try {
        console.log(`Creating tag: ${tag}`);
        execSync(`git tag -a ${tag} -m "Release ${version}"`, { stdio: 'inherit' });
        
        if (process.argv.includes('--push')) {
          console.log(`Pushing tag: ${tag}`);
          execSync(`git push origin ${tag}`, { stdio: 'inherit' });
          console.log(`✅ Tag ${tag} created and pushed`);
        } else {
          console.log(`✅ Tag ${tag} created locally`);
          console.log(`   Run 'git push origin ${tag}' to push it`);
        }
      } catch (tagError: unknown) {
        const errorMessage = tagError instanceof Error ? tagError.message : 'Unknown error';
        console.error('Error creating tag:', errorMessage);
      }
    }
  }
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error updating version:', errorMessage);
  process.exit(1);
}

