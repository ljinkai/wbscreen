const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseStatusUrl, buildEmbedHtml } = require('./xEmbed');

describe('parseStatusUrl', () => {
  it('parses x.com status url', () => {
    assert.deepEqual(parseStatusUrl('https://x.com/jspeiser/status/2048722896306982980'), {
      username: 'jspeiser',
      statusId: '2048722896306982980',
      statusUrl: 'https://x.com/jspeiser/status/2048722896306982980',
    });
  });

  it('parses twitter.com with query string', () => {
    const parsed = parseStatusUrl(
      'https://twitter.com/jspeiser/status/2048722896306982980?ref_src=twsrc%5Etfw'
    );
    assert.equal(parsed.statusId, '2048722896306982980');
    assert.equal(parsed.username, 'jspeiser');
  });

  it('returns null for non-status urls', () => {
    assert.equal(parseStatusUrl('https://x.com/jspeiser'), null);
    assert.equal(parseStatusUrl('https://example.com/a/status/1'), null);
  });
});

describe('buildEmbedHtml', () => {
  it('includes blockquote, status link, and widgets.js', () => {
    const html = buildEmbedHtml({
      username: 'jspeiser',
      statusId: '2048722896306982980',
      statusUrl: 'https://x.com/jspeiser/status/2048722896306982980',
    });
    assert.match(html, /class="twitter-tweet"/);
    assert.match(html, /https:\/\/x\.com\/jspeiser\/status\/2048722896306982980/);
    assert.match(html, /platform\.x\.com\/widgets\.js/);
  });
});
