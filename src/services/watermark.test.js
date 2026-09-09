const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveWatermark, validateScreenshotParams } = require('../utils/validator');

describe('resolveWatermark', () => {
  it('defaults off for normal screenshots', () => {
    const wm = resolveWatermark({ url: 'https://example.com' }, undefined);
    assert.equal(wm.enabled, false);
    assert.equal(wm.text, 'ezindie.com');
  });

  it('defaults on for github source', () => {
    const wm = resolveWatermark({ url: 'https://github.com/a/b' }, 'github');
    assert.equal(wm.enabled, true);
  });

  it('allows request to disable github watermark', () => {
    const wm = resolveWatermark({ watermark: false }, 'github');
    assert.equal(wm.enabled, false);
  });

  it('allows request to enable non-github watermark with custom text', () => {
    const wm = resolveWatermark(
      { watermark: true, watermarkText: 'custom.brand' },
      undefined
    );
    assert.equal(wm.enabled, true);
    assert.equal(wm.text, 'custom.brand');
  });

  it('accepts object form', () => {
    const wm = resolveWatermark(
      {
        watermark: {
          enabled: true,
          text: 'obj',
          position: 'top-left',
          opacity: 0.5,
        },
      },
      undefined
    );
    assert.equal(wm.enabled, true);
    assert.equal(wm.text, 'obj');
    assert.equal(wm.position, 'top-left');
    assert.equal(wm.opacity, 0.5);
  });
});

describe('validateScreenshotParams watermark', () => {
  it('attaches resolved watermark for github', () => {
    const params = validateScreenshotParams({
      url: 'https://github.com/excalidraw/excalidraw',
      source: 'github',
    });
    assert.equal(params.watermark.enabled, true);
    assert.equal(params.watermark.text, 'ezindie.com');
  });
});
