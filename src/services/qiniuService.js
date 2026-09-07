/**
 * 七牛云上传服务
 */
const qiniu = require('qiniu');
const config = require('../config/default');
const { AppError } = require('../utils/errorHandler');
const crypto = require('crypto');

/** 串行上传，降低 urllib「callback twice / socket hang up」概率 */
let uploadChain = Promise.resolve();

/**
 * 解析存储区域（与控制台 bucket 区域一致）
 */
function resolveQiniuZone() {
  const raw = (config.qiniu.zone || 'Zone_z0').trim();
  const map = {
    Zone_z0: qiniu.zone.Zone_z0,
    z0: qiniu.zone.Zone_z0,
    Zone_cn_east_2: qiniu.zone.Zone_cn_east_2,
    cn_east_2: qiniu.zone.Zone_cn_east_2,
    Zone_z1: qiniu.zone.Zone_z1,
    z1: qiniu.zone.Zone_z1,
    Zone_z2: qiniu.zone.Zone_z2,
    z2: qiniu.zone.Zone_z2,
    Zone_na0: qiniu.zone.Zone_na0,
    na0: qiniu.zone.Zone_na0,
    Zone_as0: qiniu.zone.Zone_as0,
    as0: qiniu.zone.Zone_as0,
  };
  return map[raw] || qiniu.zone.Zone_z0;
}

/**
 * @param {{ useCdnDomain?: boolean }} [opts]
 */
function buildQiniuConfig(opts = {}) {
  const qiniuConfig = new qiniu.conf.Config();
  qiniuConfig.zone = resolveQiniuZone();
  qiniuConfig.useHttpsDomain = true;
  // CDN 上传域名（upload*.qiniup.com）比源站 up*.qiniup.com 更适合跨境
  qiniuConfig.useCdnDomain =
    opts.useCdnDomain !== undefined
      ? opts.useCdnDomain
      : config.qiniu.useCdnDomain !== false;
  qiniuConfig.RPC_TIMEOUT = config.qiniu.uploadTimeout || 120000;
  return qiniuConfig;
}

/**
 * 生成上传 Token
 */
function generateUploadToken() {
  const accessKey = config.qiniu.accessKey;
  const secretKey = config.qiniu.secretKey;

  if (!accessKey || !secretKey) {
    throw new AppError('七牛云配置不完整', 'QINIU_CONFIG_ERROR', 500);
  }

  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const deadline = Math.round(new Date().getTime() / 1000) + 3600;

  const options = {
    scope: config.qiniu.bucket,
    deadline,
  };

  const putPolicy = new qiniu.rs.PutPolicy(options);
  return putPolicy.uploadToken(mac);
}

/**
 * 生成唯一文件名
 */
function generateFileName(format) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const normalized = (format || 'png').toLowerCase();
  const extension =
    normalized === 'jpeg' || normalized === 'jpg'
      ? 'jpg'
      : normalized === 'gif'
        ? 'gif'
        : normalized === 'webp'
          ? 'webp'
          : 'png';
  return `screenshots/${timestamp}_${random}.${extension}`;
}

function normalizeDomain(domain) {
  if (!domain || typeof domain !== 'string') return '';
  const trimmed = domain.trim();
  // 去掉误写入环境变量的注释片段
  const withoutComment = trimmed.split(/\s+#/)[0].trim();
  return withoutComment.replace(/\/+$/, '');
}

function buildPublicUrl(key) {
  const domain = normalizeDomain(config.qiniu.domain);
  if (domain) {
    return domain.endsWith('/') ? `${domain}${key}` : `${domain}/${key}`;
  }
  return `https://${config.qiniu.bucket}.qiniucdn.com/${key}`;
}

function errorMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.errors && Array.isArray(err.errors)) {
    return err.errors.map((e) => e?.message || String(e)).join('; ');
  }
  return String(err);
}

function isRetryableUploadError(err) {
  const msg = errorMessage(err);
  const code = err?.code || err?.errno || '';
  return /socket hang up|ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|Response timeout|callback twice|AggregateError/i.test(
    `${msg} ${code}`
  );
}

/**
 * 单次 put（Promise 只 settle 一次，避免 urllib 双回调）
 */
function putOnce(uploadToken, key, buffer, qiniuConfig) {
  const formUploader = new qiniu.form_up.FormUploader(qiniuConfig);
  const putExtra = new qiniu.form_up.PutExtra();

  return new Promise((resolve, reject) => {
    let settled = false;
    formUploader.put(uploadToken, key, buffer, putExtra, (err, body, info) => {
      if (settled) return;
      if (err) {
        settled = true;
        reject(err);
        return;
      }
      if (info && info.statusCode === 200 && body && body.key) {
        settled = true;
        resolve({
          key: body.key,
          url: buildPublicUrl(body.key),
          hash: body.hash,
        });
        return;
      }
      settled = true;
      reject(new Error(`上传失败: ${info?.statusCode ?? 'unknown'}`));
    });
  });
}

/**
 * 先走 CDN 上传域名，再回退源站；每次失败可重试
 */
async function putWithRetry(uploadToken, key, buffer) {
  const retries = Math.max(1, config.qiniu.uploadRetries || 3);
  const strategies = [
    { useCdnDomain: true, label: 'CDN(upload*.qiniup.com)' },
    { useCdnDomain: false, label: '源站(up*.qiniup.com)' },
  ];

  // 若配置强制关闭 CDN，只走源站
  const plan =
    config.qiniu.useCdnDomain === false
      ? [{ useCdnDomain: false, label: '源站(up*.qiniup.com)' }]
      : strategies;

  let lastError;
  for (const strategy of plan) {
    const qiniuConfig = buildQiniuConfig({ useCdnDomain: strategy.useCdnDomain });
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await putOnce(uploadToken, key, buffer, qiniuConfig);
      } catch (err) {
        lastError = err;
        const msg = errorMessage(err);
        console.warn(
          `七牛上传失败 [${strategy.label}] 第${attempt}/${retries}次:`,
          msg
        );
        if (!isRetryableUploadError(err) || attempt === retries) {
          break;
        }
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }

  throw lastError || new Error('七牛上传失败');
}

/**
 * 上传文件到七牛云
 */
async function uploadToQiniu(buffer, format) {
  const run = async () => {
    try {
      const uploadToken = generateUploadToken();
      const key = generateFileName(format);
      return await putWithRetry(uploadToken, key, buffer);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        `上传到七牛云失败: ${errorMessage(error)}`,
        'QINIU_UPLOAD_ERROR',
        500
      );
    }
  };

  const next = uploadChain.then(run, run);
  uploadChain = next.catch(() => {});
  return next;
}

module.exports = {
  uploadToQiniu,
  generateUploadToken,
  resolveQiniuZone,
  buildPublicUrl,
  buildQiniuConfig,
};
