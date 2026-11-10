const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const BrowserPool = require('./browserPool');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function setup(options = {}) {
  let launches = 0;
  const pool = new BrowserPool({
    maxSize: 1, idleTimeout: 15, waitTimeout: 100,
    launch: async () => {
      launches++;
      const browser = new EventEmitter();
      browser.connected = true;
      browser.isConnected = () => browser.connected;
      browser.close = async () => { browser.connected = false; browser.emit('disconnected'); };
      return browser;
    }, ...options,
  });
  return { pool, launches: () => launches };
}
test('lazy launch, reuse before timeout, close idle browser, then relaunch', async () => {
  const { pool, launches } = setup();
  assert.equal(launches(), 0);
  const first = await pool.getBrowser();
  await pool.releaseBrowser(first);
  assert.equal(await pool.getBrowser(), first);
  await delay(25);
  assert.equal(first.isConnected(), true); // acquired browser must not expire
  await pool.releaseBrowser(first);
  await delay(25);
  assert.equal(first.isConnected(), false);
  assert.notEqual(await pool.getBrowser(), first);
  assert.equal(launches(), 2);
  await pool.closeAll();
});
test('queued requests recover when busy browser disconnects', async () => {
  const { pool, launches } = setup();
  const first = await pool.getBrowser();
  const next = pool.getBrowser();
  await first.close();
  const replacement = await next;
  assert.notEqual(replacement, first);
  assert.equal(launches(), 2);
  await pool.closeAll();
});
test('launch failure frees slot', async () => {
  let calls = 0;
  const { pool } = setup({ launch: async () => { calls++; throw new Error('launch failed'); } });
  await assert.rejects(pool.getBrowser(), /launch failed/);
  await assert.rejects(pool.getBrowser(), /launch failed/);
  assert.equal(calls, 2);
  await pool.closeAll();
});
test('bounded wait and shutdown rejects queued requests and closes busy browsers', async () => {
  const { pool } = setup({ waitTimeout: 10 });
  const browser = await pool.getBrowser();
  await assert.rejects(pool.getBrowser(), /等待浏览器超时/);
  const waiting = assert.rejects(pool.getBrowser(), /浏览器池已关闭/);
  await pool.closeAll();
  await waiting;
  assert.equal(browser.isConnected(), false);
});
test('failed context cleanup discards browser immediately', async () => {
  const { pool } = setup();
  const browser = await pool.getBrowser();
  await pool.releaseBrowser(browser, { discard: true });
  assert.equal(browser.isConnected(), false);
  await pool.closeAll();
});
