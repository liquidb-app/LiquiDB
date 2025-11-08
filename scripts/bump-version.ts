#!/usr/bin/env tsx

/**
 * Automatically bump version based on commit messages (conventional commits)
 * Usage: tsx scripts/bump-version.ts [major|minor|patch]
 * Example: tsx scripts/bump-version.ts patch
 * 
 * If no argument provided, analyzes recent commits to determine bump type
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

type BumpType = 'major' | 'minor' | 'patch';

function parseVersion(version: string): [number, number, number] {
  const parts = version.split('.').map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function bumpVersion(version: string, type: BumpType): string {
  const [major, minor, patch] = parseVersion(version);
  
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

function detectBumpType(): BumpType {
  try {
    // Get commits since last tag
    const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim();
    const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
    const commits = execSync(`git log ${range} --pretty=format:"%s"`, { encoding: 'utf-8' }).trim().split('\n');
    
    if (commits.length === 0) {
      console.log('No new commits, using patch bump');
      return 'patch';
    }
    
    // Check for breaking changes
    const hasBreaking = commits.some(msg => 
      msg.includes('BREAKING CHANGE') || 
      msg.includes('BREAKING:') ||
      msg.match(/^[^:]+!:/) // Conventional commit with ! (e.g., feat!:)
    );
    
    if (hasBreaking) {
      console.log('Detected breaking changes, using major bump');
      return 'major';
    }
    
    // Check for features
    const hasFeature = commits.some(msg => msg.match(/^feat(\(.+\))?:/i));
    if (hasFeature) {
      console.log('Detected new features, using minor bump');
      return 'minor';
    }
    
    // Default to patch
    console.log('Using patch bump (default)');
    return 'patch';
  } catch {
    console.log('Could not analyze commits, using patch bump');
    return 'patch';
  }
}

const bumpTypeArg = process.argv[2] as BumpType | undefined;
const bumpType: BumpType = bumpTypeArg && ['major', 'minor', 'patch'].includes(bumpTypeArg)
  ? bumpTypeArg
  : detectBumpType();

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
    process.exit(0);
  }
  
  // Update version
  packageJson.version = newVersion;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  
  console.log(`✅ Version bumped from ${currentVersion} to ${newVersion} (${bumpType})`);
  console.log(`Updated ${packageJsonPath}`);
  
  // Optionally create tag if --tag flag is provided
  if (process.argv.includes('--tag')) {
    const tag = `v${newVersion}`;
    
    try {
      // Check if tag already exists
      execSync(`git rev-parse ${tag}`, { stdio: 'ignore' });
      console.log(`Tag ${tag} already exists`);
    } catch {
      // Tag doesn't exist, create it
      try {
        console.log(`Creating tag: ${tag}`);
        execSync(`git tag -a ${tag} -m "Release ${newVersion}"`, { stdio: 'inherit' });
        
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
  
  console.log(`\nNext steps:`);
  console.log(`  1. Review the changes: git diff package.json`);
  console.log(`  2. Commit: git add package.json && git commit -m "Bump version to ${newVersion}"`);
  if (!process.argv.includes('--tag')) {
    console.log(`  3. Create tag: npm run tag:create:push`);
  } else if (!process.argv.includes('--push')) {
    console.log(`  3. Push tag: git push origin v${newVersion}`);
  }
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error bumping version:', errorMessage);
  process.exit(1);
}

