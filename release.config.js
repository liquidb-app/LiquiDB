module.exports = {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'revert', release: 'patch' },
          { type: 'refactor', release: 'patch' },
          { type: 'docs', release: false },
          { type: 'style', release: false },
          { type: 'chore', release: false },
          { type: 'test', release: false },
          { type: 'build', release: false },
          { type: 'ci', release: false },
          { breaking: true, release: 'major' }
        ],
        parserOpts: {
          noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES']
        }
      }
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: 'Features', hidden: false },
            { type: 'fix', section: 'Bug Fixes', hidden: false },
            { type: 'perf', section: 'Performance Improvements', hidden: false },
            { type: 'revert', section: 'Reverts', hidden: false },
            { type: 'refactor', section: 'Code Refactoring', hidden: false },
            { type: 'docs', section: 'Documentation', hidden: false },
            { type: 'style', section: 'Styles', hidden: false },
            { type: 'chore', section: 'Miscellaneous Chores', hidden: false },
            { type: 'test', section: 'Tests', hidden: false },
            { type: 'build', section: 'Build System', hidden: false },
            { type: 'ci', section: 'Continuous Integration', hidden: false }
          ]
        },
        writerOpts: {
          commitPartial: `* {{#if scope}}**{{scope}}:** {{/if}}{{subject}}{{#each references}}{{#if @root.repository}}{{#if this.action}} ([#{{this.action}}]({{@root.host}}/{{#if this.owner}}{{this.owner}}/{{/if}}{{@root.repository}}/issues/{{this.action}})){{/if}}{{/if}}{{/each}} ([{{shortHash}}](https://github.com/alexg-sh/LiquiDB/commit/{{hash}}))`,
          transform: (commit, context) => {
            // Handle invalid commit dates - normalize to valid ISO strings
            const normalizeDate = (dateValue) => {
              if (!dateValue) return new Date().toISOString();
              
              // Try to parse the date
              let date;
              if (typeof dateValue === 'string') {
                date = new Date(dateValue);
              } else if (dateValue instanceof Date) {
                date = dateValue;
              } else {
                date = new Date(dateValue);
              }
              
              // Check if date is valid
              if (isNaN(date.getTime()) || !isFinite(date.getTime())) {
                // Use current date as fallback for invalid dates
                return new Date().toISOString();
              }
              
              // Ensure date is within reasonable bounds (not before 1970 or too far in future)
              const minDate = new Date('1970-01-01');
              const maxDate = new Date('2100-01-01');
              if (date < minDate || date > maxDate) {
                return new Date().toISOString();
              }
              
              return date.toISOString();
            };
            
            // Normalize dates if they exist - return a new object instead of modifying the immutable commit
            const normalizedCommit = { ...commit };
            
            if (normalizedCommit.committerDate !== undefined) {
              normalizedCommit.committerDate = normalizeDate(normalizedCommit.committerDate);
            }
            if (normalizedCommit.authorDate !== undefined) {
              normalizedCommit.authorDate = normalizeDate(normalizedCommit.authorDate);
            }
            
            return normalizedCommit;
          }
        }
      }
    ],
    '@semantic-release/changelog',
    '@semantic-release/npm',
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
        signed: true
      }
    ],
    [
      '@semantic-release/github',
      {
        draft: true,
        successComment: false,
        releasedLabels: false,
        assets: false
      }
    ]
  ]
};
