/**
 * GitHub 仓库元数据（About 官网等）
 */
const config = require('../config/default');

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
 * About 里的官网可能不带协议，补全为 https
 * @param {string} homepage
 * @returns {string | null}
 */
function normalizeHomepageUrl(homepage) {
  if (!homepage || typeof homepage !== 'string') return null;
  const trimmed = homepage.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function githubApiHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'wbscreen-github-repo',
  };
  if (config.github?.token) {
    headers.Authorization = `Bearer ${config.github.token}`;
  }
  return headers;
}

/**
 * 拉取 About 中配置的官网（GitHub API homepage 字段）
 * @returns {Promise<string | null>}
 */
async function fetchRepoHomepage(owner, repo) {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(endpoint, { headers: githubApiHeaders() });
  if (!res.ok) return null;

  const data = await res.json();
  return normalizeHomepageUrl(data.homepage);
}

module.exports = {
  parseGithubRepoUrl,
  normalizeHomepageUrl,
  fetchRepoHomepage,
};
