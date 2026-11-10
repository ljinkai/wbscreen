const { AppError } = require('../utils/errorHandler');

// Slots include browsers being launched or closed, so replacement never exceeds the limit.
class BrowserPool {
  constructor({ launch, maxSize, idleTimeout, waitTimeout }) {
    Object.assign(this, { launch, maxSize, idleTimeout, waitTimeout });
    this.entries = new Set();
    this.waiters = new Set();
    this.pending = new Set();
    this.closed = false;
  }

  wake() {
    for (const wake of [...this.waiters]) wake();
  }

  async getBrowser(deadline = Date.now() + this.waitTimeout) {
    if (this.closed) throw new AppError('浏览器池已关闭', 'BROWSER_POOL_CLOSED', 503);
    for (const entry of this.entries) {
      if (entry.idle && entry.browser.isConnected()) {
        clearTimeout(entry.timer);
        entry.idle = false;
        return entry.browser;
      }
    }
    if (this.entries.size + this.pending.size < this.maxSize) {
      const task = this.createBrowser();
      this.pending.add(task);
      try { return await task; }
      finally { this.pending.delete(task); this.wake(); }
    }
    await new Promise((resolve, reject) => {
      const wake = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiters.delete(wake);
        reject(new AppError('等待浏览器超时', 'BROWSER_WAIT_TIMEOUT', 503));
      }, Math.max(0, deadline - Date.now()));
      this.waiters.add(wake);
    });
    return this.getBrowser(deadline);
  }

  async createBrowser() {
    let browser;
    try { browser = await this.launch(); }
    catch (error) {
      throw new AppError(`创建浏览器实例失败: ${error.message}`, 'BROWSER_CREATE_ERROR', 500);
    }
    const entry = { browser, idle: false };
    this.entries.add(entry);
    browser.once('disconnected', () => {
      clearTimeout(entry.timer);
      this.entries.delete(entry);
      this.wake();
    });
    if (this.closed) {
      await this.closeEntry(entry);
      throw new AppError('浏览器池已关闭', 'BROWSER_POOL_CLOSED', 503);
    }
    return browser;
  }

  async closeEntry(entry) {
    if (entry.closing) return entry.closing;
    clearTimeout(entry.timer);
    entry.idle = false;
    entry.closing = (async () => {
      try { await entry.browser.close(); }
      catch (error) {
        console.error('关闭浏览器失败:', error.message);
        entry.browser.process()?.kill('SIGKILL');
      } finally {
        this.entries.delete(entry);
        this.wake();
      }
    })();
    return entry.closing;
  }

  async releaseBrowser(browser, { discard = false } = {}) {
    const entry = [...this.entries].find(item => item.browser === browser);
    if (!entry || entry.idle || entry.closing) return;
    if (discard || this.closed || !browser.isConnected()) return this.closeEntry(entry);
    entry.idle = true;
    entry.timer = setTimeout(() => { void this.closeEntry(entry); }, this.idleTimeout);
    entry.timer.unref();
    this.wake();
  }

  async closeAll() {
    this.closed = true;
    this.wake();
    await Promise.allSettled([...this.pending]);
    await Promise.all([...this.entries].map(entry => this.closeEntry(entry)));
  }
}

module.exports = BrowserPool;
