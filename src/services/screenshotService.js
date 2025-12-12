/**
 * 截图服务
 */
const puppeteer = require('puppeteer');
const config = require('../config/default');
const { AppError } = require('../utils/errorHandler');
const qiniuService = require('./qiniuService');

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
    
    // 设置用户代理（避免被识别为爬虫）
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    // 访问页面
    await page.goto(params.url, {
      waitUntil: params.waitUntil,
      timeout: params.timeout,
    });
    
    // 构建截图选项
    const screenshotOptions = {
      type: params.format,
      fullPage: params.fullPage,
    };
    
    // JPEG 格式需要设置质量
    if (params.format.toLowerCase() === 'jpeg') {
      screenshotOptions.quality = params.quality;
    }
    
    // 如果有裁剪选项，添加到配置中
    if (params.options && params.options.clip) {
      screenshotOptions.clip = params.options.clip;
    }
    
    // 执行截图
    const screenshot = await page.screenshot(screenshotOptions);
    
    const result = {
      buffer: screenshot,
      format: params.format,
    };
    
    // 如果需要返回 base64，进行转换
    if (params.returnBase64) {
      const base64 = screenshot.toString('base64');
      const mimeType = params.format.toLowerCase() === 'jpeg' ? 'image/jpeg' : 'image/png';
      result.base64 = `data:${mimeType};base64,${base64}`;
    }
    
    // 如果启用了七牛云自动上传，上传图片
    if (config.qiniu.autoUpload && config.qiniu.accessKey && config.qiniu.secretKey) {
      try {
        const uploadResult = await qiniuService.uploadToQiniu(screenshot, params.format);
        result.qiniu = uploadResult;
      } catch (error) {
        // 上传失败不影响截图结果，只记录错误
        console.error('七牛云上传失败:', error.message);
        result.qiniuError = error.message;
      }
    }
    
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
 * 优雅关闭
 */
async function shutdown() {
  console.log('正在关闭浏览器池...');
  await browserPool.closeAll();
  console.log('浏览器池已关闭');
}

module.exports = {
  takeScreenshot,
  shutdown,
};

