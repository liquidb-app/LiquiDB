#!/usr/bin/env tsx

/**
 * Generate release notes from git commits
 * Usage: tsx scripts/generate-release-notes.ts <version>
 * Example: tsx scripts/generate-release-notes.ts 1.0.0
 */

import { execSync } from 'child_process';

const version = process.argv[2];

if (!version) {
  console.error('Error: Version argument is required');
  console.error('Usage: tsx scripts/generate-release-notes.ts <version>');
  process.exit(1);
}

try {
  // Get the latest tag
  let lastTag: string;
  try {
    const tags = execSync('git tag --sort=-version:refname', { encoding: 'utf-8' }).trim().split('\n');
    // Filter out the current tag if it exists
    lastTag = tags.find(tag => tag !== `v${version}` && tag !== version) || tags[0] || '';
  } catch {
    lastTag = '';
  }

  // Get commits since last tag (or all commits if no tag exists)
  let commits: string[];
  if (lastTag) {
    try {
      const commitLog = execSync(`git log ${lastTag}..HEAD --pretty=format:"- %s (%h)"`, { encoding: 'utf-8' }).trim();
      commits = commitLog ? commitLog.split('\n') : [];
    } catch {
      commits = [];
    }
  } else {
    // If no previous tag, get last 50 commits
    try {
      const commitLog = execSync('git log -50 --pretty=format:"- %s (%h)"', { encoding: 'utf-8' }).trim();
      commits = commitLog ? commitLog.split('\n') : [];
    } catch {
      commits = [];
    }
  }

  // Generate release notes
  let releaseNotes = `# Release ${version}\n\n`;
  
  if (commits.length > 0) {
    releaseNotes += '## Changes\n\n';
    releaseNotes += commits.join('\n');
    releaseNotes += '\n\n';
  } else {
    releaseNotes += '## Changes\n\n';
    releaseNotes += '- Initial release\n\n';
  }

  // Add installation instructions
  releaseNotes += '## Installation\n\n';
  releaseNotes += 'Download the appropriate installer for your platform:\n';
  releaseNotes += '- **macOS**: DMG or ZIP file\n';
  releaseNotes += '- **Windows**: NSIS installer or portable executable\n';
  releaseNotes += '- **Linux**: AppImage or DEB package\n\n';

  // Output to stdout (will be captured by GitHub Actions)
  console.log(releaseNotes);
} catch (error: any) {
  console.error('Error generating release notes:', error.message);
  // Fallback release notes
  console.log(`# Release ${version}\n\n## Changes\n\n- See commit history for details\n`);
  process.exit(0); // Don't fail the build if release notes generation fails
}

