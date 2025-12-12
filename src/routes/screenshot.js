/**
 * 截图路由
 */
const express = require('express');
const router = express.Router();
const screenshotService = require('../services/screenshotService');
const { validateScreenshotParams } = require('../utils/validator');
const { AppError } = require('../utils/errorHandler');

/**
 * POST /api/screenshot
 * 截图接口
 */
router.post('/screenshot', async (req, res, next) => {
  try {
    // 验证参数
    const params = validateScreenshotParams(req.body);
    
    // 执行截图
    const result = await screenshotService.takeScreenshot(params);
    
    const config = require('../config/default');
    const hasQiniuUpload = result.qiniu && config.qiniu.autoUpload;
    const hasQiniuConfig = config.qiniu.accessKey && config.qiniu.secretKey;
    
    // 如果明确要求返回二进制图片，返回二进制
    if (params.returnBinary) {
      const contentType = result.format === 'jpeg' ? 'image/jpeg' : 'image/png';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', result.buffer.length);
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(result.buffer);
    }
    
    // 如果上传到七牛云，返回 JSON 格式（包含 URL）- 默认行为
    if (hasQiniuUpload) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      return res.json({
        success: true,
        format: result.format,
        url: result.qiniu.url,
        key: result.qiniu.key,
        hash: result.qiniu.hash,
        ...(params.returnBase64 && { base64: result.base64 }),
      });
    }
    
    // 如果配置了七牛云但上传失败，返回错误信息（但仍返回 JSON）
    if (hasQiniuConfig && result.qiniuError) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      return res.json({
        success: true,
        format: result.format,
        warning: '七牛云上传失败，返回 base64',
        base64: result.base64 || (() => {
          const base64 = result.buffer.toString('base64');
          const mimeType = result.format === 'jpeg' ? 'image/jpeg' : 'image/png';
          return `data:${mimeType};base64,${base64}`;
        })(),
        error: result.qiniuError,
      });
    }
    
    // 如果需要返回 base64，返回 JSON 格式
    if (params.returnBase64) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      return res.json({
        success: true,
        format: result.format,
        base64: result.base64,
      });
    }
    
    // 如果配置了七牛云但未启用自动上传，默认返回 JSON（包含 base64）
    if (hasQiniuConfig) {
      const base64 = result.buffer.toString('base64');
      const mimeType = result.format === 'jpeg' ? 'image/jpeg' : 'image/png';
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      return res.json({
        success: true,
        format: result.format,
        base64: `data:${mimeType};base64,${base64}`,
        note: '七牛云自动上传未启用，返回 base64 编码',
      });
    }
    
    // 默认返回 JSON 格式（包含 base64），而不是二进制图片
    const base64 = result.buffer.toString('base64');
    const mimeType = result.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    return res.json({
      success: true,
      format: result.format,
      base64: `data:${mimeType};base64,${base64}`,
      note: '未配置七牛云，返回 base64 编码。如需二进制图片，请设置 returnBinary: true',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/health
 * 健康检查接口
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;

