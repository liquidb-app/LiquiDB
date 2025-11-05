#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('[Prepare Standalone] Starting...');

const rootDir = path.join(__dirname, '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const staticDir = path.join(rootDir, '.next', 'static');
const publicDir = path.join(rootDir, 'public');

// Check if standalone directory exists
if (!fs.existsSync(standaloneDir)) {
  console.error('[Prepare Standalone] Error: .next/standalone directory not found');
  console.error('[Prepare Standalone] Make sure to run "next build" with output: "standalone" first');
  process.exit(1);
}

// Copy .next/static to .next/standalone/.next/static
const targetStaticDir = path.join(standaloneDir, '.next', 'static');
console.log(`[Prepare Standalone] Copying static files from ${staticDir} to ${targetStaticDir}`);

if (fs.existsSync(staticDir)) {
  // Remove existing static directory if it exists
  if (fs.existsSync(targetStaticDir)) {
    fs.rmSync(targetStaticDir, { recursive: true, force: true });
  }
  
  // Copy static directory
  copyRecursiveSync(staticDir, targetStaticDir);
  console.log('[Prepare Standalone] ✓ Static files copied');
} else {
  console.warn('[Prepare Standalone] Warning: .next/static directory not found');
}

// Copy public directory to .next/standalone/public
const targetPublicDir = path.join(standaloneDir, 'public');
console.log(`[Prepare Standalone] Copying public files from ${publicDir} to ${targetPublicDir}`);

if (fs.existsSync(publicDir)) {
  // Remove existing public directory if it exists
  if (fs.existsSync(targetPublicDir)) {
    fs.rmSync(targetPublicDir, { recursive: true, force: true });
  }
  
  // Copy public directory
  copyRecursiveSync(publicDir, targetPublicDir);
  console.log('[Prepare Standalone] ✓ Public files copied');
} else {
  console.warn('[Prepare Standalone] Warning: public directory not found');
}

console.log('[Prepare Standalone] ✓ Standalone build prepared successfully');

// Helper function to recursively copy directories
function copyRecursiveSync(src, dest) {
  try {
    const stats = fs.statSync(src);
    
    if (stats.isDirectory()) {
      // Create directory if it doesn't exist
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      
      // Recursively copy all files/subdirectories
      fs.readdirSync(src).forEach((childItemName) => {
        copyRecursiveSync(
          path.join(src, childItemName),
          path.join(dest, childItemName)
        );
      });
    } else {
      // Copy file
      fs.copyFileSync(src, dest);
    }
  } catch (error) {
    console.error(`[Prepare Standalone] Error copying ${src}:`, error.message);
    throw error;
  }
}
