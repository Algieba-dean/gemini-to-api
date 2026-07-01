# gemini-web2api Cloudflare Worker 部署指南

本指南将指引您如何将 `gemini-web2api` 部署至 Cloudflare Workers。转换后的版本使用 TypeScript 与 Hono 框架构建，支持 Serverless 运行，具备极高的可用性，且完全免费。

---

## 准备工作

1. **注册 Cloudflare 账号**：如果还没有账号，请前往 [Cloudflare 官网](https://dash.cloudflare.com/) 注册。
2. **本地环境**：确保本地已安装 Node.js (推荐 v18+)。

---

## 部署步骤

### 第一步：进入项目目录并安装依赖

打开终端，进入项目中的 `worker` 目录并安装依赖：

```bash
cd worker
npm install
```

### 第二步：配置环境变量

在 `worker/wrangler.toml` 中，我们已经定义了以下变量。您可以根据需要进行配置：

* `API_KEYS`：用于保护您的 API 接口。可以设置为空（无鉴权），也可以设置用逗号分隔的密钥列表（例如 `"sk-key1,sk-key2"`）。鉴权同时作用于 OpenAI 兼容端点（`/v1/*`）与 Google 原生端点（`/v1beta/*`）。客户端可通过以下任意一种方式传递密钥：
  * `Authorization: Bearer <key>`（OpenAI 风格）
  * `x-api-key: <key>`
  * `x-goog-api-key: <key>`（Google Gemini 风格）
  * `?key=<key>`（Google Gemini 查询参数）
* `COOKIE`：（可选）您的 Google Gemini Web 端 Cookie。匿名模式已默认支持 Flash 模型，若要路由到真实的 Gemini Pro 模型，则必须提供付费版（Gemini Advanced）的 Cookie。
* `SAPISID`：（可选）如果设置了 `COOKIE`，Worker 会尝试自动提取。您也可以在此显式配置。

> [!TIP]
> **关于安全性**：对于敏感的 `COOKIE` 和 `SAPISID`，推荐使用 Cloudflare Workers Secrets 加密存储，而不是直接写在 `wrangler.toml` 中。

#### 使用 Secret 存储敏感数据（推荐）
在部署完成后（或通过命令行），运行以下命令在 Cloudflare 端添加加密密钥：

```bash
npx wrangler secret put COOKIE
npx wrangler secret put SAPISID
npx wrangler secret put API_KEYS
```

---

### 第三步：登录 Cloudflare 并部署

1. **登录 Cloudflare**：
   运行以下命令，会自动打开浏览器授权登录：
   ```bash
   npx wrangler login
   ```

2. **一键部署**：
   运行部署脚本，Wrangler 会自动将代码编译、打包并上传部署至 Cloudflare：
   ```bash
   npm run deploy
   ```

   部署成功后，控制台会输出您的 Worker 专属访问域名，例如：
   `https://gemini-web2api.<your-subdomain>.workers.dev`

---

## 方式二：Git 自动部署（Cloudflare Workers Builds，推荐用于持续部署）

除了本地 `npm run deploy` 手动部署，Cloudflare 支持**连接 GitHub 仓库自动构建部署**（Workers Builds）。连接后，每次 `git push` 到生产分支（如 `main`）都会**自动触发构建 + 部署**，无需本地操作。

### 1. 连接仓库

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**。
2. 打开你的 Worker（`gemini-web2api`）→ **Settings** → **Build**（构建）→ **Connect**，授权并选择你的 GitHub 仓库与生产分支（`main`）。

### 2. 构建配置

由于本仓库是「大仓库 + `worker/` 子目录」结构，`wrangler.toml` 位于 `worker/` 下，因此构建/部署命令都需要先 `cd worker`：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| **根目录 (Root directory)** | `/` | 仓库根目录 |
| **构建命令 (Build command)** | `cd worker && npm install` | 安装依赖 |
| **部署命令 (Deploy command)** | `cd worker && npx wrangler deploy` | 生产分支：构建并部署 |
| **版本命令 (Version command)** | `cd worker && npx wrangler versions upload` | 非生产分支：仅上传预览版本（**务必带 `cd worker`**，否则从根目录找不到 `wrangler.toml` 会失败） |

> **提示**：也可以把「根目录」直接设为 `worker`，这样三条命令都可以去掉 `cd worker &&` 前缀。二选一即可，务必保持一致。

### 3. ⚠️ 关键：机密（Secrets）不要写进 `wrangler.toml` 的 `[vars]`

自动部署意味着**每次 push 都会执行一次 `wrangler deploy`**。而 `wrangler deploy` 会用 `wrangler.toml` 中 `[vars]` 的值覆盖同名变量——**如果把 `API_KEYS` 留在 `[vars]` 里（哪怕是空字符串），每次自动部署都会把你在网页端设置的加密机密清空！**

因此本项目的 `wrangler.toml` 已**只保留非敏感的 `GEMINI_BL`**，而 `API_KEYS` / `COOKIE` / `SAPISID` 一律作为**加密 Secret** 管理：

```toml
[vars]
GEMINI_BL = "boq_assistant-bard-web-server_20260525.09_p0"
# API_KEYS / COOKIE / SAPISID 不在此处，改用 Secret
```

Secret 一旦设置会**跨部署持久保留**，不会被 CI 的 `wrangler deploy` 覆盖（前提是它们不出现在 `[vars]`）。

### 4. 设置外部访问 Token（`API_KEYS`）

CI 的 `wrangler deploy` **不会**帮你创建机密，需要在网页端设置一次（永久保留）：

1. **Workers & Pages** → 你的 Worker → **Settings** → **Variables and Secrets（变量与机密）**。
2. 若已存在 `API_KEYS`（Text 类型、空值，来自旧部署）：点 **Edit** → 填入 token → 点 **Encrypt（加密）** 转为 Secret → **Save/Deploy**。
3. 若不存在：点 **Add** → 类型选 **Secret** → 名称 `API_KEYS` → 值填 token（多个用逗号分隔，如 `sk-a,sk-b`）→ 保存。

> 生成强 token：`openssl rand -hex 24`。设置后即时生效，配合最新代码会同时保护 `/v1/*` 与 `/v1beta/*`。

### 5. 验证自动部署与鉴权

push 后等 CI 构建完成，然后：

```bash
# 无 Key → 401（鉴权已开启）
curl -i https://<your-domain>/v1/models
# /v1beta 无 Key → 401（说明含 v1beta 保护的最新代码已部署）
curl -i https://<your-domain>/v1beta/models
# 带正确 Key → 200
curl https://<your-domain>/v1/models -H "Authorization: Bearer sk-your-key"
```

`/v1beta/models` 返回 **401** 是「最新代码已通过 CI 部署成功」的标志。

---

## 客户端配置

部署完成后，您便可以像使用官方 OpenAI 接口一样，将客户端的 API Base URL 指向您的 Cloudflare Worker 域名。

### 1. 常用客户端设置 (如 Cherry Studio / ChatBox)

| 配置项 | 配置值 |
|---|---|
| **API Base URL** | `https://gemini-web2api.<your-subdomain>.workers.dev/v1` |
| **API Key** | 您在 `API_KEYS` 中配置的任意一个密钥（如果未配置，可填任意字符） |
| **模型名称** | `gemini-3.5-flash-thinking`（推荐） 或 `gemini-3.5-flash` |

### 2. cURL 测试请求

```bash
curl https://gemini-web2api.<your-subdomain>.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key" \
  -d '{
    "model": "gemini-3.5-flash",
    "messages": [{"role": "user", "content": "你好，用五个词回复我。"}]
  }'
```

### 3. 支持的端点映射

* **OpenAI 兼容端点**：
  * `POST /v1/chat/completions` (支持非流式 & 流式)
  * `GET /v1/models` (列出所有可用模型)
  * `POST /v1/responses` (Codex CLI 格式兼容接口)
* **Google Native API 端点 (支持 Gemini CLI)**：
  * `GET /v1beta/models`
  * `POST /v1beta/models/{model}:generateContent`
  * `POST /v1beta/models/{model}:streamGenerateContent`
* **根目录服务健康检查**：
  * `GET /`

---

## 本地调试

如果您想在本地模拟 Cloudflare Worker 的运行状态，可以直接运行：

```bash
npm run dev
```

服务会默认启动在 `http://localhost:8787`。
