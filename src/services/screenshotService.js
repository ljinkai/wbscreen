/**
 * 截图服务
 */
const puppeteer = require('puppeteer');
const config = require('../config/default');
const { AppError } = require('../utils/errorHandler');
const qiniuService = require('./qiniuService');
const githubRepo = require('./githubRepo');
const xPost = require('./xPost');

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
 * 尽力关闭常见遮挡层（失败忽略）
 */
async function dismissBlockingOverlays(page) {
  const candidates = [
    '[aria-label="Close"]',
    '[data-testid="xMigrationBottomBar"] [role="button"]',
    'div[role="dialog"] [aria-label="Close"]',
    'button[data-testid="confirmationSheetConfirm"]',
  ];
  for (const sel of candidates) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click({ delay: 20 }).catch(() => {});
        await el.dispose().catch(() => {});
      }
    } catch {
      // ignore
    }
  }
  // Best-effort text buttons
  try {
    await page.evaluate(() => {
      const texts = ['Not now', 'Close', 'Dismiss', '拒绝', '关闭'];
      const nodes = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
      for (const node of nodes) {
        const t = (node.textContent || '').trim();
        if (texts.some((x) => t === x || t.includes(x))) {
          node.click();
          break;
        }
      }
    });
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
    
    await page.setUserAgent(xPost.userAgentForUrl(params.url));

    await page.goto(params.url, {
      waitUntil: params.waitUntil,
      timeout: params.timeout,
    });

    const effectiveSelector = xPost.resolveSelector(params.url, params.selector);
    let screenshot;
    let source = 'screenshot';
    let warning;

    if (effectiveSelector) {
      try {
        await dismissBlockingOverlays(page);
        await page.waitForSelector(effectiveSelector, { timeout: params.timeout });
        const handle = await page.$(effectiveSelector);
        if (!handle) {
          throw new Error(`selector not found: ${effectiveSelector}`);
        }
        const elementOpts = { type: params.format };
        if (params.format.toLowerCase() === 'jpeg') {
          elementOpts.quality = params.quality;
        }
        screenshot = await handle.screenshot(elementOpts);
        await handle.dispose().catch(() => {});
        source = 'element';
      } catch (elementError) {
        console.warn('元素截图失败，降级整页:', elementError.message);
        warning = `元素截图失败，已降级整页: ${elementError.message}`;
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

