const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseGithubRepoUrl,
  extractImageUrlsFromReadme,
  isBadgeImageUrl,
  resolveImageUrl,
  pickBestReadmeImage,
  detectImageFormat,
} = require('./githubReadmeImage');

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

describe('extractImageUrlsFromReadme', () => {
  it('extracts markdown and html images', () => {
    const md = `
# Title
![demo](./docs/demo.png)
<img src="https://cdn.example.com/ui.jpg" />
![badge](https://img.shields.io/npm/v/x.svg)
`;
    const urls = extractImageUrlsFromReadme(md);
    assert.deepEqual(urls, [
      './docs/demo.png',
      'https://cdn.example.com/ui.jpg',
      'https://img.shields.io/npm/v/x.svg',
    ]);
  });
});

describe('isBadgeImageUrl', () => {
  it('detects common badge hosts', () => {
    assert.equal(isBadgeImageUrl('https://img.shields.io/npm/v/x.svg'), true);
    assert.equal(isBadgeImageUrl('https://travis-ci.org/owner/repo.svg'), true);
    assert.equal(isBadgeImageUrl('https://cdn.example.com/screenshot.png'), false);
  });
});

describe('resolveImageUrl', () => {
  it('resolves relative path against raw github', () => {
    assert.equal(
      resolveImageUrl('./docs/a.png', 'owner', 'repo', 'main'),
      'https://raw.githubusercontent.com/owner/repo/main/docs/a.png'
    );
  });

  it('keeps absolute http(s) urls', () => {
    assert.equal(
      resolveImageUrl('https://cdn.example.com/a.png', 'owner', 'repo', 'main'),
      'https://cdn.example.com/a.png'
    );
  });
});

describe('pickBestReadmeImage', () => {
  it('skips badges and returns first useful image', () => {
    const picked = pickBestReadmeImage(
      [
        'https://img.shields.io/npm/v/x.svg',
        './docs/demo.png',
        'https://cdn.example.com/other.jpg',
      ],
      'owner',
      'repo',
      'main'
    );
    assert.equal(picked, 'https://raw.githubusercontent.com/owner/repo/main/docs/demo.png');
  });

  it('returns null when only badges exist', () => {
    assert.equal(
      pickBestReadmeImage(['https://img.shields.io/npm/v/x.svg'], 'o', 'r', 'main'),
      null
    );
  });
});

describe('detectImageFormat', () => {
  it('detects from content-type and url', () => {
    assert.equal(detectImageFormat('image/jpeg', 'x.bin'), 'jpeg');
    assert.equal(detectImageFormat('', 'a.PNG'), 'png');
    assert.equal(detectImageFormat('', 'a.webp'), 'webp');
  });
});
