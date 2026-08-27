const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseGithubRepoUrl,
  normalizeHomepageUrl,
} = require('./githubRepo');

describe('parseGithubRepoUrl', () => {
  it('parses https github repo url', () => {
    assert.deepEqual(parseGithubRepoUrl('https://github.com/owner/repo'), {
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('strips .git and extra path', () => {
    assert.deepEqual(
      parseGithubRepoUrl('https://github.com/owner/repo.git/blob/main/README.md'),
      { owner: 'owner', repo: 'repo' }
    );
  });

  it('returns null for non-github urls', () => {
    assert.equal(parseGithubRepoUrl('https://example.com/owner/repo'), null);
  });
});

describe('normalizeHomepageUrl', () => {
  it('keeps absolute https url', () => {
    assert.equal(normalizeHomepageUrl('https://excalidraw.com'), 'https://excalidraw.com');
  });

  it('adds https for host-only homepage', () => {
    assert.equal(normalizeHomepageUrl('excalidraw.com'), 'https://excalidraw.com');
  });

  it('returns null for empty', () => {
    assert.equal(normalizeHomepageUrl(''), null);
    assert.equal(normalizeHomepageUrl('   '), null);
    assert.equal(normalizeHomepageUrl(null), null);
  });
});
