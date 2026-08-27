# GitHub README Image Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `source=github`, extract the first useful README image, upload to Qiniu; otherwise fall back to Puppeteer screenshot.

**Architecture:** Pure HTTP module fetches/parses README; screenshot route branches on `source` before calling Puppeteer; reuse existing Qiniu upload and response formatting.

**Tech Stack:** Node.js 22, Express, native `fetch`, built-in `node:test`

---

## File map

| File | Role |
|------|------|
| `src/services/githubReadmeImage.js` | Parse repo URL, fetch README, extract/filter/download image |
| `src/utils/validator.js` | Accept optional `source` |
| `src/services/screenshotService.js` or route | Orchestrate github-first then screenshot |
| `src/config/default.js` | Optional `GITHUB_TOKEN` |
| `src/services/githubReadmeImage.test.js` | Unit tests for parse/filter |
| `doc/API.md` | Document `source` and response field |

### Task 1: README image helpers (TDD)

**Files:**
- Create: `src/services/githubReadmeImage.js`
- Create: `src/services/githubReadmeImage.test.js`

- [ ] **Step 1:** Add `"test": "node --test"` to package.json
- [ ] **Step 2:** Write failing tests for `parseGithubRepoUrl`, `extractImageUrlsFromReadme`, `pickBestReadmeImage`, `resolveImageUrl`
- [ ] **Step 3:** Implement helpers until tests pass
- [ ] **Step 4:** Implement `fetchReadmeImageBuffer(url)` using GitHub API + download (mockable internals)

### Task 2: Wire into screenshot API

**Files:**
- Modify: `src/utils/validator.js`
- Modify: `src/config/default.js`
- Modify: `src/routes/screenshot.js` and/or `src/services/screenshotService.js`

- [ ] **Step 1:** Validate `source` as optional enum (`undefined` | `github`)
- [ ] **Step 2:** When `source===github`, try README path; on success build same result shape (`buffer`, `format`, `qiniu`, `source: 'readme'`)
- [ ] **Step 3:** On failure, existing screenshot with `source: 'screenshot'`
- [ ] **Step 4:** Include `source` in JSON responses

### Task 3: API docs

**Files:**
- Modify: `doc/API.md`

- [ ] Document `source`, flow, and response `source` field with curl example
