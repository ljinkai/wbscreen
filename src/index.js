/**
 * 入口文件
 */
// 首先加载环境变量
require('dotenv').config();

const express = require('express');
const config = require('./config/default');
const screenshotRoutes = require('./routes/screenshot');
const { errorResponse, notFoundHandler } = require('./utils/errorHandler');
const screenshotService = require('./services/screenshotService');

const app = express();

// 中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// 路由
app.use('/api', screenshotRoutes);

// 根路径
app.get('/', (req, res) => {
  res.json({
    name: 'Web Screenshot Service',
    version: '1.0.0',
    endpoints: {
      screenshot: 'POST /api/screenshot',
      health: 'GET /api/health',
    },
  });
});

// 404 处理
app.use(notFoundHandler);

// 错误处理
app.use(errorResponse);

// 启动服务器
const server = app.listen(config.port, () => {
  console.log(`服务器运行在 http://localhost:${config.port}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`最大并发请求数: ${config.performance.maxConcurrentRequests}`);
  console.log(`浏览器池大小: ${config.performance.browserPoolSize}`);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到 SIGTERM 信号，开始优雅关闭...');
  server.close(async () => {
    await screenshotService.shutdown();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('收到 SIGINT 信号，开始优雅关闭...');
  server.close(async () => {
    await screenshotService.shutdown();
    process.exit(0);
  });
});

// 未捕获的异常处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

module.exports = app;

