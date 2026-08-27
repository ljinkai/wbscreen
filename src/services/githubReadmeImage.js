/**
 * 从 GitHub README 提取可用产品图（不开浏览器）
 */
const config = require('../config/default');

const BADGE_PATTERNS = [
  /shields\.io/i,
  /badge/i,
  /travis-ci\.(org|com)/i,
  /codecov\.io/i,
  /circleci\.com/i,
  /coveralls\.io/i,
  /david-dm\.org/i,
  /snyk\.io/i,
  /sombrero\.io/i,
  /liberapay\.com/i,
  /buymeacoffee\.com/i,
  /github\.com\/.*\/actions\/workflows\/.*\/badge\.svg/i,
  /camo\.githubusercontent\.com\/.*badge/i,
];

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i;

/**
 * @param {string} url
 * @returns {{ owner: string, repo: string } | null}
 */
function parseGithubRepoUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!['github.com', 'www.github.com'].includes(parsed.hostname)) {
    return null;
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  let repo = parts[1].replace(/\.git$/i, '');
  if (!owner || !repo) return null;
  return { owner, repo };
}

/**
 * @param {string} markdown
 * @returns {string[]}
 */
function extractImageUrlsFromReadme(markdown) {
  if (!markdown) return [];
  const urls = [];
  const combined =
    /!\[[^\]]*]\(\s*<?([^)\s>]+)>?\s*(?:["'][^"']*["'])?\s*\)|<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = combined.exec(markdown)) !== null) {
    urls.push((m[1] || m[2]).trim());
  }
  return urls;
}

/**
 * @param {string} imageUrl
 */
function isBadgeImageUrl(imageUrl) {
  if (!imageUrl) return true;
  if (IMAGE_EXT_RE.test(imageUrl) && /\.svg(\?|#|$)/i.test(imageUrl)) {
    // SVG in README is almost always a badge
    return true;
  }
  return BADGE_PATTERNS.some((re) => re.test(imageUrl));
}

/**
 * @param {string} imageUrl
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 */
function resolveImageUrl(imageUrl, owner, repo, branch) {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl.startsWith('//')) return `https:${imageUrl}`;

  let path = imageUrl.replace(/^\.\//, '');
  if (path.startsWith('/')) {
    // /owner/repo/assets/... style absolute-from-site paths — try raw under repo root
    const siteParts = path.split('/').filter(Boolean);
    if (siteParts[0] === owner && siteParts[1] === repo) {
      // /owner/repo/blob/branch/path or /owner/repo/raw/branch/path
      const blobIdx = siteParts.findIndex((p) => p === 'blob' || p === 'raw');
      if (blobIdx >= 0 && siteParts[blobIdx + 1]) {
        path = siteParts.slice(blobIdx + 2).join('/');
      } else {
        path = siteParts.slice(2).join('/');
      }
    } else {
      path = path.slice(1);
    }
  }

  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

/**
 * @param {string[]} urls
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @returns {string | null}
 */
function pickBestReadmeImage(urls, owner, repo, branch) {
  for (const raw of urls) {
    if (isBadgeImageUrl(raw)) continue;
    const absolute = resolveImageUrl(raw, owner, repo, branch);
    if (!absolute) continue;
    if (isBadgeImageUrl(absolute)) continue;
    // Prefer raster images
    if (/\.svg(\?|#|$)/i.test(absolute)) continue;
    return absolute;
  }
  return null;
}

/**
 * @param {string} contentType
 * @param {string} url
 * @returns {'png'|'jpeg'|'gif'|'webp'}
 */
function detectImageFormat(contentType, url) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpeg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('webp')) return 'webp';

  const m = String(url || '').toLowerCase().match(/\.(png|jpe?g|gif|webp)(\?|#|$)/);
  if (!m) return 'png';
  if (m[1] === 'jpg' || m[1] === 'jpeg') return 'jpeg';
  return m[1];
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github.raw',
    'User-Agent': 'wbscreen-readme-image',
  };
  if (config.github && config.github.token) {
    headers.Authorization = `Bearer ${config.github.token}`;
  }
  return headers;
}

/**
 * 拉取 README 原文与 default_branch
 * @returns {Promise<{ content: string, branch: string } | null>}
 */
async function fetchReadme(owner, repo) {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/readme`;
  const res = await fetch(endpoint, { headers: githubHeaders() });
  if (!res.ok) {
    return null;
  }
  const content = await res.text();
  // default_branch often available via Link or separate call; use repo API lightly
  let branch = 'main';
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'wbscreen-readme-image',
        ...(config.github?.token ? { Authorization: `Bearer ${config.github.token}` } : {}),
      },
    });
    if (repoRes.ok) {
      const data = await repoRes.json();
      if (data.default_branch) branch = data.default_branch;
    }
  } catch {
    // keep main
  }
  return { content, branch };
}

/**
 * @param {string} imageUrl
 * @returns {Promise<{ buffer: Buffer, format: string, imageUrl: string } | null>}
 */
async function downloadImage(imageUrl) {
  const res = await fetch(imageUrl, {
    headers: { 'User-Agent': 'wbscreen-readme-image' },
    redirect: 'follow',
  });
  if (!res.ok) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
    return null;
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length < 100) return null; // too small, likely badge/spacer
  const format = detectImageFormat(contentType, imageUrl);
  return { buffer, format, imageUrl };
}

/**
 * 尝试从 GitHub README 获取最佳图片 buffer
 * @param {string} pageUrl
 * @returns {Promise<{ buffer: Buffer, format: string, imageUrl: string } | null>}
 */
async function fetchBestReadmeImage(pageUrl) {
  const repo = parseGithubRepoUrl(pageUrl);
  if (!repo) return null;

  const readme = await fetchReadme(repo.owner, repo.repo);
  if (!readme || !readme.content) return null;

  const urls = extractImageUrlsFromReadme(readme.content);
  const best = pickBestReadmeImage(urls, repo.owner, repo.repo, readme.branch);
  if (!best) return null;

  return downloadImage(best);
}

module.exports = {
  parseGithubRepoUrl,
  extractImageUrlsFromReadme,
  isBadgeImageUrl,
  resolveImageUrl,
  pickBestReadmeImage,
  detectImageFormat,
  fetchReadme,
  downloadImage,
  fetchBestReadmeImage,
};
