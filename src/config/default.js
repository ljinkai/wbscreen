/**
 * 默认配置
 */
module.exports = {
  // 服务器配置
  port: process.env.PORT || 3000,
  
  // Puppeteer 配置
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    args: process.env.PUPPETEER_ARGS 
      ? process.env.PUPPETEER_ARGS.split(',')
      : ['--no-sandbox', '--disable-setuid-sandbox'],
  },
  
  // 性能配置
  performance: {
    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 5,
    browserPoolSize: parseInt(process.env.BROWSER_POOL_SIZE) || 3,
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  },
  
  // 默认截图配置
  screenshot: {
    width: 1920,
    height: 1080,
    fullPage: false,
    format: 'png',
    quality: 90,
    waitUntil: 'networkidle0',
    timeout: 30000,
  },
  
  // 安全配置
  security: {
    // URL 白名单（空数组表示不限制）
    allowedDomains: process.env.ALLOWED_DOMAINS 
      ? process.env.ALLOWED_DOMAINS.split(',')
      : [],
  },
  
  // 七牛云配置
  qiniu: {
    accessKey: process.env.QINIU_ACCESS_KEY || '',
    secretKey: process.env.QINIU_SECRET_KEY || '',
    bucket: process.env.QINIU_BUCKET || 'static',
    domain: process.env.QINIU_DOMAIN || '', // 自定义域名，如 https://cdn.example.com
    zone: process.env.QINIU_ZONE || 'Zone_z0', // 存储区域
    autoUpload: process.env.QINIU_AUTO_UPLOAD !== 'false', // 是否自动上传
  },
};

