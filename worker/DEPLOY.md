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
