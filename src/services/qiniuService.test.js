const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// 仅测纯逻辑，不连七牛
const { buildPublicUrl } = require('./qiniuService');

describe('buildPublicUrl', () => {
  it('strips comment from domain env mistake', () => {
    const config = require('../config/default');
    const original = config.qiniu.domain;
    config.qiniu.domain = 'https://qiniu.gafata.com  # 自定义域名（可选）';
    const url = buildPublicUrl('screenshots/a.png');
    assert.equal(url, 'https://qiniu.gafata.com/screenshots/a.png');
    config.qiniu.domain = original;
  });
});
