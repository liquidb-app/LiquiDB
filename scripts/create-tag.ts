#!/usr/bin/env tsx

/**
 * Create a git tag from package.json version
 * Usage: tsx scripts/create-tag.ts [--push]
 * Example: tsx scripts/create-tag.ts --push
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const shouldPush = process.argv.includes('--push');

try {
  // Read package.json
  const packageJsonPath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const version = packageJson.version;

  if (!version) {
    console.error('Error: No version found in package.json');
    process.exit(1);
  }

  const tag = `v${version}`;

  // Check if tag already exists
  try {
    execSync(`git rev-parse ${tag}`, { stdio: 'ignore' });
    console.log(`Tag ${tag} already exists`);
    process.exit(0);
  } catch {
    // Tag doesn't exist, continue
  }

  // Create tag
  console.log(`Creating tag: ${tag}`);
  execSync(`git tag -a ${tag} -m "Release ${version}"`, { stdio: 'inherit' });

  if (shouldPush) {
    console.log(`Pushing tag: ${tag}`);
    execSync(`git push origin ${tag}`, { stdio: 'inherit' });
    console.log(`✅ Tag ${tag} created and pushed successfully`);
  } else {
    console.log(`✅ Tag ${tag} created locally`);
    console.log(`   Run 'git push origin ${tag}' to push it to remote`);
  }
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error creating tag:', errorMessage);
  process.exit(1);
}

