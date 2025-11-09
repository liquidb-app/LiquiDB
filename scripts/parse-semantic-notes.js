#!/usr/bin/env node

/**
 * Parse semantic-release notes and extract features, fixes, and breaking changes
 * Usage: node scripts/parse-semantic-notes.js <semantic-release-notes>
 */

const fs = require('fs');
const path = require('path');

function parseSemanticNotes(notes) {
  if (!notes || notes.trim() === '') {
    return {
      features: [],
      fixes: [],
      breaking: []
    };
  }

  const result = {
    features: [],
    fixes: [],
    breaking: []
  };

  // Split notes by sections
  const sections = notes.split(/^##\s+/m);
  
  sections.forEach(section => {
    const lines = section.split('\n');
    const header = lines[0]?.trim().toLowerCase();
    
    if (!header) return;
    
    // Extract features
    if (header.includes('feature') || header.includes('feat')) {
      lines.slice(1).forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
          const content = trimmed.replace(/^[*-]\s*/, '').trim();
          if (content) {
            result.features.push(`- ✨ ${content}`);
          }
        }
      });
    }
    
    // Extract fixes
    if (header.includes('fix') || header.includes('bug')) {
      lines.slice(1).forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
          const content = trimmed.replace(/^[*-]\s*/, '').trim();
          if (content) {
            result.fixes.push(`- 🐛 ${content}`);
          }
        }
      });
    }
    
    // Extract breaking changes
    if (header.includes('breaking')) {
      lines.slice(1).forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
          const content = trimmed.replace(/^[*-]\s*/, '').trim();
          if (content) {
            result.breaking.push(`- ⚠️ **${content}**`);
          }
        }
      });
    }
  });

  return result;
}

// If run as script
if (require.main === module) {
  const notes = process.argv[2] || '';
  const parsed = parseSemanticNotes(notes);
  
  console.log(JSON.stringify(parsed, null, 2));
}

module.exports = { parseSemanticNotes };

