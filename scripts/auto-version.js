#!/usr/bin/env node

/**
 * Automatic semantic versioning based on commit messages
 * Replaces semantic-release functionality
 */

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Read package.json
const packagePath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const currentVersion = packageJson.version;

// Get commits since last tag
let commits = [];
try {
  const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
  if (lastTag) {
    commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(c => c.trim() !== '');
  } else {
    commits = execSync('git log --pretty=format:"%s" -20', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(c => c.trim() !== '');
  }
} catch (error) {
  console.error('Error getting commits:', error.message);
  process.exit(1);
}

// Determine version bump type
let bumpType = null;
let hasBreaking = false;

for (const commit of commits) {
  const lowerCommit = commit.toLowerCase();
  
  // Check for breaking changes
  if (lowerCommit.includes('breaking change') || lowerCommit.includes('breaking:') || commit.match(/^BREAKING/)) {
    hasBreaking = true;
    bumpType = 'major';
    break;
  }
  
  // Check for features
  if (commit.match(/^feat(\(.+\))?:/) || commit.match(/^feature(\(.+\))?:/)) {
    if (!bumpType || bumpType === 'patch') {
      bumpType = 'minor';
    }
  }
  
  // Check for fixes
  if (commit.match(/^fix(\(.+\))?:/) || commit.match(/^bugfix(\(.+\))?:/)) {
    if (!bumpType) {
      bumpType = 'patch';
    }
  }
  
  // Check for other patch-level changes
  if (commit.match(/^(perf|refactor|revert)(\(.+\))?:/)) {
    if (!bumpType) {
      bumpType = 'patch';
    }
  }
}

// If no changes detected, don't bump
if (!bumpType && !hasBreaking) {
  console.log('No version bump needed');
  process.exit(0);
}

// Calculate new version
const [major, minor, patch] = currentVersion.split('.').map(Number);
let newVersion;

if (hasBreaking || bumpType === 'major') {
  newVersion = `${major + 1}.0.0`;
} else if (bumpType === 'minor') {
  newVersion = `${major}.${minor + 1}.0`;
} else if (bumpType === 'patch') {
  newVersion = `${major}.${minor}.${patch + 1}`;
} else {
  console.log('No version bump needed');
  process.exit(0);
}

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`Version bumped: ${currentVersion} → ${newVersion}`);
console.log(`Bump type: ${bumpType || 'major'}`);
console.log(`New version: ${newVersion}`);

// Output for GitHub Actions
console.log(`::set-output name=new_version::${newVersion}`);
console.log(`::set-output name=bump_type::${bumpType || 'major'}`);

// Also write to file for GitHub Actions
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_version=${newVersion}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `bump_type=${bumpType || 'major'}\n`);
}

