/**
 * 截图服务
 */
const puppeteer = require('puppeteer');
const config = require('../config/default');
const { AppError } = require('../utils/errorHandler');
const qiniuService = require('./qiniuService');
const githubRepo = require('./githubRepo');
const xPost = require('./xPost');
const xEmbed = require('./xEmbed');

class BrowserPool {
  constructor() {
    this.browsers = [];
    this.maxSize = config.performance.browserPoolSize;
    this.currentSize = 0;
  }
  
  /**
   * 获取浏览器实例
   */
  async getBrowser() {
    // 如果池中有可用的浏览器，直接返回
    if (this.browsers.length > 0) {
      return this.browsers.pop();
    }
    
    // 如果未达到最大数量，创建新实例
    if (this.currentSize < this.maxSize) {
      this.currentSize++;
      return await this.createBrowser();
    }
    
    // 等待其他请求释放浏览器
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.browsers.length > 0) {
          clearInterval(checkInterval);
          resolve(this.browsers.pop());
        }
      }, 100);
    });
  }
  
  /**
   * 创建浏览器实例
   */
  async createBrowser() {
    try {
      const browser = await puppeteer.launch({
        headless: config.puppeteer.headless,
        args: config.puppeteer.args,
      });
      
      // 监听浏览器断开事件
      browser.on('disconnected', () => {
        this.currentSize = Math.max(0, this.currentSize - 1);
      });
      
      return browser;
    } catch (error) {
      this.currentSize = Math.max(0, this.currentSize - 1);
      throw new AppError(`创建浏览器实例失败: ${error.message}`, 'BROWSER_CREATE_ERROR', 500);
    }
  }
  
  /**
   * 释放浏览器实例回池
   */
  releaseBrowser(browser) {
    if (browser && browser.isConnected()) {
      this.browsers.push(browser);
    }
  }
  
  /**
   * 关闭所有浏览器实例
   */
  async closeAll() {
    const closePromises = this.browsers.map(browser => browser.close());
    await Promise.all(closePromises);
    this.browsers = [];
    this.currentSize = 0;
  }
}

// 创建全局浏览器池实例
const browserPool = new BrowserPool();

// 并发控制
let activeRequests = 0;
const maxConcurrentRequests = config.performance.maxConcurrentRequests;

/**
 * 若启用七牛自动上传，将 buffer 写入 result
 */
async function attachQiniuUpload(result) {
  if (config.qiniu.autoUpload && config.qiniu.accessKey && config.qiniu.secretKey) {
    try {
      const uploadResult = await qiniuService.uploadToQiniu(result.buffer, result.format);
      result.qiniu = uploadResult;
    } catch (error) {
      console.error('七牛云上传失败:', error.message);
      result.qiniuError = error.message;
    }
  }
  return result;
}

/**
 * 尽力关闭 / 隐藏常见遮挡层（失败忽略）
 * 重点处理 X 移动端「See this post in the app」引导层
 */
async function dismissBlockingOverlays(page) {
  const candidates = [
    '[aria-label="Close"]',
    '[aria-label="close"]',
    '[data-testid="app-bar-close"]',
    '[data-testid="SheetClose"]',
    '[data-testid="xMigrationBottomBar"] [role="button"]',
    'div[role="dialog"] [aria-label="Close"]',
    'div[role="dialog"] [aria-label="close"]',
    'button[data-testid="confirmationSheetConfirm"]',
  ];
  for (const sel of candidates) {
    try {
      const els = await page.$$(sel);
      for (const el of els) {
        await el.click({ delay: 20 }).catch(() => {});
        await el.dispose().catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  try {
    await page.keyboard.press('Escape').catch(() => {});
  } catch {
    // ignore
  }

  // Best-effort text buttons（不要点 Open X / Open app）
  try {
    await page.evaluate(() => {
      const dismissTexts = ['Not now', 'Not Now', 'Dismiss', 'No thanks', 'Maybe later', '拒绝', '关闭', '稍后再说'];
      const avoidTexts = ['Open X', 'Open app', 'Open App', 'Log in', 'Sign up'];
      const nodes = Array.from(
        document.querySelectorAll('button, div[role="button"], span[role="button"], a[role="link"]')
      );
      for (const node of nodes) {
        const t = (node.textContent || '').trim();
        if (!t || t.length > 40) continue;
        if (avoidTexts.some((x) => t === x || t.includes(x))) continue;
        if (dismissTexts.some((x) => t === x)) {
          node.click();
          break;
        }
      }
    });
  } catch {
    // ignore
  }

  // 直接隐藏仍挡在主帖上的 sheet / dialog（点击关不掉时的兜底）
  try {
    await page.evaluate(() => {
      const hide = (el) => {
        if (!el || !(el instanceof HTMLElement)) return;
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      };

      document.querySelectorAll('div[role="dialog"], div[data-testid="sheetDialog"], [data-testid="mask"]').forEach(hide);

      // 「See this post in the app」类文案所在祖先层
      const markers = ['See this post in the app', 'Open X', 'Use the app to view'];
      const walk = Array.from(document.querySelectorAll('div, section, aside'));
      for (const el of walk) {
        const text = (el.textContent || '').trim();
        if (!text || text.length > 280) continue;
        if (markers.some((m) => text.includes(m)) && text.includes('Open X')) {
          // 往上找较完整的遮罩容器
          let cur = el;
          for (let i = 0; i < 6 && cur; i++) {
            const style = window.getComputedStyle(cur);
            const fixed =
              style.position === 'fixed' ||
              style.position === 'absolute' ||
              cur.getAttribute('role') === 'dialog';
            if (fixed || (cur.clientHeight > window.innerHeight * 0.3 && cur.clientWidth > window.innerWidth * 0.5)) {
              hide(cur);
              break;
            }
            cur = cur.parentElement;
          }
        }
      }
    });
  } catch {
    // ignore
  }

  try {
    await new Promise((r) => setTimeout(r, 250));
  } catch {
    // ignore
  }
}

function buildPageScreenshotOptions(params) {
  const screenshotOptions = {
    type: params.format,
    fullPage: params.fullPage,
  };
  if (params.format.toLowerCase() === 'jpeg') {
    screenshotOptions.quality = params.quality;
  }
  if (params.options && params.options.clip) {
    screenshotOptions.clip = params.options.clip;
  }
  return screenshotOptions;
}

function attachBase64(result, params) {
  if (!params.returnBase64) return;
  const mimeType = params.format.toLowerCase() === 'jpeg' ? 'image/jpeg' : 'image/png';
  result.base64 = `data:${mimeType};base64,${result.buffer.toString('base64')}`;
}

function elementScreenshotOptions(params) {
  const elementOpts = { type: params.format };
  if (params.format.toLowerCase() === 'jpeg') {
    elementOpts.quality = params.quality;
  }
  return elementOpts;
}

/**
 * X 帖优先：官方 embed 卡片截图（长文尽力 Show more）
 * @returns {Promise<{ buffer: Buffer, source: 'embed' } | null>}
 */
async function tryXEmbedScreenshot(page, params) {
  if (!xPost.isXStatusUrl(params.url) || params.selector) {
    return null;
  }
  const status = xEmbed.parseStatusUrl(params.url);
  if (!status) return null;

  await page.setUserAgent(xPost.DESKTOP_UA);
  await page.setViewport(params.viewport);
  await page.setContent(xEmbed.buildEmbedHtml(status), {
    waitUntil: ['load', 'networkidle2'],
    timeout: params.timeout,
  });

  let handle = await xEmbed.waitForEmbedCard(page, params.timeout);
  await xEmbed.expandEmbedLongText(page);
  // 展开后重新取节点，避免尺寸过期
  const refreshed = await page.$(
    'iframe[id^="twitter-widget-"], iframe[src*="platform.twitter.com"], iframe[src*="platform.x.com"], .twitter-tweet-rendered'
  );
  if (refreshed) {
    await handle.dispose().catch(() => {});
    handle = refreshed;
  }

  const buffer = await handle.screenshot(elementScreenshotOptions(params));
  await handle.dispose().catch(() => {});
  return { buffer, source: 'embed' };
}

/**
 * 执行截图
 */
async function takeScreenshot(params) {
  // 并发控制
  if (activeRequests >= maxConcurrentRequests) {
    throw new AppError('服务器繁忙，请稍后重试', 'TOO_MANY_REQUESTS', 503);
  }
  
  activeRequests++;
  let browser = null;
  let page = null;
  
  try {
    // 获取浏览器实例
    browser = await browserPool.getBrowser();
    page = await browser.newPage();
    
    // 设置视口
    await page.setViewport(params.viewport);

    let screenshot;
    let source = 'screenshot';
    let warning;

    // X 帖：优先官方 embed（无显式 selector 时）
    try {
      const embedResult = await tryXEmbedScreenshot(page, params);
      if (embedResult) {
        const result = {
          buffer: embedResult.buffer,
          format: params.format,
          source: embedResult.source,
        };
        attachBase64(result, params);
        await attachQiniuUpload(result);
        return result;
      }
    } catch (embedError) {
      console.warn('X embed 截图失败，回退帖子页:', embedError.message);
      warning = `X embed 截图失败，已回退帖子页: ${embedError.message}`;
    }
    
    await page.setUserAgent(xPost.userAgentForUrl(params.url));

    await page.goto(params.url, {
      waitUntil: params.waitUntil,
      timeout: params.timeout,
    });

    const effectiveSelector = xPost.resolveSelector(params.url, params.selector);

    if (effectiveSelector) {
      try {
        await page.waitForSelector(effectiveSelector, { timeout: params.timeout });
        // 弹层常在主帖出现后弹出；关闭两次提高成功率
        await dismissBlockingOverlays(page);
        await dismissBlockingOverlays(page);
        const handle = await page.$(effectiveSelector);
        if (!handle) {
          throw new Error(`selector not found: ${effectiveSelector}`);
        }
        screenshot = await handle.screenshot(elementScreenshotOptions(params));
        await handle.dispose().catch(() => {});
        source = 'element';
      } catch (elementError) {
        console.warn('元素截图失败，降级整页:', elementError.message);
        const elementWarning = `元素截图失败，已降级整页: ${elementError.message}`;
        warning = warning ? `${warning}；${elementWarning}` : elementWarning;
        try {
          await dismissBlockingOverlays(page);
        } catch {
          // ignore
        }
        screenshot = await page.screenshot(buildPageScreenshotOptions(params));
        source = 'screenshot';
      }
    } else {
      screenshot = await page.screenshot(buildPageScreenshotOptions(params));
    }

    const result = {
      buffer: screenshot,
      format: params.format,
      source,
      ...(warning ? { warning } : {}),
    };

    attachBase64(result, params);
    await attachQiniuUpload(result);
    return result;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    // 处理 Puppeteer 错误
    if (error.message.includes('Navigation timeout')) {
      throw new AppError('页面加载超时', 'TIMEOUT_ERROR', 408);
    }
    
    if (error.message.includes('net::ERR')) {
      throw new AppError('无法访问目标网页', 'NETWORK_ERROR', 400);
    }
    
    throw new AppError(`截图失败: ${error.message}`, 'SCREENSHOT_ERROR', 500);
  } finally {
    // 清理资源
    if (page) {
      try {
        await page.close();
      } catch (error) {
        console.error('关闭页面失败:', error);
      }
    }
    
    // 释放浏览器实例
    if (browser) {
      browserPool.releaseBrowser(browser);
    }
    
    activeRequests--;
  }
}

/**
 * 统一入口：github 源优先 About 官网截图，否则截仓库页
 */
async function captureImage(params) {
  if (params.source === 'github') {
    const repo = githubRepo.parseGithubRepoUrl(params.url);
    if (repo) {
      try {
        const homepage = await githubRepo.fetchRepoHomepage(repo.owner, repo.repo);
        if (homepage) {
          const result = await takeScreenshot({ ...params, url: homepage });
          result.source = 'homepage';
          result.homepageUrl = homepage;
          return result;
        }
        console.log('GitHub About 未配置官网，回退到仓库页面截图');
      } catch (error) {
        console.warn('GitHub About 官网截图失败，回退到仓库页面截图:', error.message);
      }
    }
  }

  return takeScreenshot(params);
}

/**
 * 优雅关闭
 */
async function shutdown() {
  console.log('正在关闭浏览器池...');
  await browserPool.closeAll();
  console.log('浏览器池已关闭');
}

module.exports = {
  takeScreenshot,
  captureImage,
  shutdown,
};

