const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isXStatusUrl,
  resolveSelector,
  DEFAULT_TWEET_SELECTOR,
} = require('./xPost');

describe('isXStatusUrl', () => {
  it('accepts x.com and twitter.com status urls', () => {
    assert.equal(isXStatusUrl('https://x.com/user/status/123'), true);
    assert.equal(isXStatusUrl('https://www.x.com/user/status/123'), true);
    assert.equal(isXStatusUrl('https://twitter.com/user/status/123'), true);
    assert.equal(isXStatusUrl('https://www.twitter.com/user/status/123/photo/1'), true);
    assert.equal(isXStatusUrl('https://mobile.twitter.com/user/status/123'), true);
  });

  it('rejects non-status and non-x hosts', () => {
    assert.equal(isXStatusUrl('https://x.com/user'), false);
    assert.equal(isXStatusUrl('https://example.com/user/status/123'), false);
    assert.equal(isXStatusUrl('not-a-url'), false);
  });
});

describe('resolveSelector', () => {
  it('prefers explicit selector', () => {
    assert.equal(
      resolveSelector('https://x.com/u/status/1', '.custom'),
      '.custom'
    );
  });

  it('uses default tweet selector for x status without explicit', () => {
    assert.equal(
      resolveSelector('https://x.com/u/status/1', undefined),
      DEFAULT_TWEET_SELECTOR
    );
  });

  it('returns undefined for non-x without explicit selector', () => {
    assert.equal(resolveSelector('https://example.com/a', undefined), undefined);
  });
});
