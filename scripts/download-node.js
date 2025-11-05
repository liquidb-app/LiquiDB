#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const NODE_VERSION = 'v20.18.1'; // LTS version
const ARCHITECTURES = ['arm64', 'x64'];

const rootDir = path.join(__dirname, '..');
const binDir = path.join(rootDir, 'resources', 'bin');

// Ensure directories exist
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

console.log('[Download Node] Starting Node.js download for macOS...');
console.log(`[Download Node] Version: ${NODE_VERSION}`);

async function downloadNode(arch) {
  const filename = `node-${NODE_VERSION}-darwin-${arch}.tar.gz`;
  const url = `https://nodejs.org/dist/${NODE_VERSION}/${filename}`;
  const targetPath = path.join(binDir, filename);
  const extractPath = path.join(binDir, arch);

  console.log(`[Download Node] Downloading ${arch} build from ${url}`);

  // Skip if already downloaded and extracted
  if (fs.existsSync(path.join(extractPath, 'bin', 'node'))) {
    console.log(`[Download Node] ${arch} build already exists, skipping download`);
    return;
  }

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(targetPath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`[Download Node] Downloaded ${filename}`);
        
        // Extract the tarball
        console.log(`[Download Node] Extracting ${filename}...`);
        
        const tar = spawn('tar', ['-xzf', targetPath, '-C', binDir]);
        
        tar.on('close', (code) => {
          if (code === 0) {
            // Rename extracted directory to arch name
            const extractedDir = path.join(binDir, `node-${NODE_VERSION}-darwin-${arch}`);
            
            if (fs.existsSync(extractedDir)) {
              fs.renameSync(extractedDir, extractPath);
              console.log(`[Download Node] Extracted and renamed to ${arch}/`);
              
              // Clean up tarball
              fs.unlinkSync(targetPath);
              console.log(`[Download Node] Cleaned up ${filename}`);
              
              resolve();
            } else {
              reject(new Error(`Extracted directory not found: ${extractedDir}`));
            }
          } else {
            reject(new Error(`Extraction failed with code ${code}`));
          }
        });
        
        tar.on('error', (error) => {
          reject(error);
        });
      });
    }).on('error', (error) => {
      fs.unlink(targetPath, () => {});
      reject(error);
    });
  });
}

async function main() {
  try {
    // Download for both architectures
    for (const arch of ARCHITECTURES) {
      await downloadNode(arch);
    }
    
    console.log('[Download Node] ✓ All Node.js binaries downloaded successfully');
    console.log('[Download Node] Binaries located in:', binDir);
  } catch (error) {
    console.error('[Download Node] Error:', error);
    process.exit(1);
  }
}

main();
