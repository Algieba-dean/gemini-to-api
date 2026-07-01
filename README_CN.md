# gemini-web2api

<p align="center">
  <img src="logo.png" width="200" alt="gemini-web2api logo">
</p>

[English](README.md)

将 Google Gemini 网页端转换为 OpenAI 兼容 API. 零成本, 跨平台, 单文件.

## 特性

- **可选密钥**: `api_keys` 为空时免密, 填入密钥后按 OpenAI Bearer Key 校验
- **OpenAI 兼容**: 直接替换 `/v1/chat/completions` 和 `/v1/models`
- **工具调用**: 完整的 Function Calling 支持 (OpenAI 格式)
- **多模型**: Flash, Flash Thinking (2万字+输出), Pro, Auto, Lite
- **思考深度**: 通过 `@think=N` 后缀调节 (0=最深, 4=最浅)
- **联网搜索**: 内置互联网访问 (Gemini 原生搜索能力)
- **跨平台**: 纯 Python, 仅一个可选依赖 (`httpx` 用于流式输出)
- **流式输出**: 基于 `httpx` 的 SSE Streaming 支持
- **Codex CLI**: Responses API (`/v1/responses`) 兼容 OpenAI Codex
- **Gemini CLI**: Google 原生 API (`/v1beta/models`) 兼容 Gemini CLI

## 快速开始

```bash
pip install httpx
python gemini_web2api.py
```

服务启动在 `http://localhost:8081/v1`.

## 客户端配置

### Cherry Studio / ChatBox / 任何 OpenAI 兼容客户端

| 字段 | 值 |
|------|-----|
| Base URL | `http://localhost:8081/v1` |
| API Key | `config.json` 中的任意 `api_keys`；未配置时随便填 |
| Model | `gemini-3.5-flash-thinking` |

### curl

```bash
curl http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key" \
  -d '{"model":"gemini-3.5-flash","messages":[{"role":"user","content":"你好!"}]}'
```

### OpenAI Python SDK

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8081/v1", api_key="sk-your-key")
resp = client.chat.completions.create(
    model="gemini-3.5-flash-thinking",
    messages=[{"role": "user", "content": "解释量子计算"}]
)
print(resp.choices[0].message.content)
```

### Gemini CLI

```bash
export GEMINI_API_KEY=none
export GOOGLE_GEMINI_BASE_URL=http://localhost:8081
gemini
```

支持 Google 原生 API 端点:
- `GET /v1beta/models` — 模型列表
- `POST /v1beta/models/{model}:generateContent` — 非流式生成
- `POST /v1beta/models/{model}:streamGenerateContent` — 流式生成 (SSE)

## 可用模型

| 模型 | 说明 | 输出量 |
|------|------|--------|
| `gemini-3.5-flash` | 快速通用 | ~1.2万字 |
| `gemini-3.5-flash-thinking` | 深度思考, 最长输出 | **~2万字** |
| `gemini-3.5-flash-thinking-lite` | 自适应思考深度 | ~1.5万字 |
| `gemini-3.1-pro` | Pro (需 cookie 才能真正路由) | ~1.2万字 |
| `gemini-auto` | 自动选择模型 | 不定 |
| `gemini-flash-lite` | 轻量快速 | ~1万字 |

### 思考深度

在模型名后追加 `@think=N`:

```
gemini-3.5-flash-thinking@think=0   # 最深 (默认)
gemini-3.5-flash-thinking@think=2   # 中等
gemini-3.5-flash-thinking@think=4   # 最浅
```

## 可选: Cookie 配置 (Pro 模型)

匿名访问对所有模型有效, 但 `gemini-3.1-pro` 在无认证时会路由到 Flash. 要获得真正的 Pro 路由, 需要 **Gemini Advanced (付费订阅)** 账号的 cookie:

```bash
python gemini_web2api.py --cookie-file cookie.txt
```

### 如何获取 Cookie

1. 打开 Chrome, 访问 [gemini.google.com](https://gemini.google.com) 并登录 **Gemini Advanced** 付费账号
2. 打开开发者工具 (F12) → Application → Cookies → `https://gemini.google.com`
3. 复制以下 cookie 值: `SID`, `HSID`, `SSID`, `APISID`, `SAPISID`, `__Secure-1PSID`
4. 创建 `cookie.txt`, 格式如下:

```
SID=你的SID值; HSID=你的HSID值; SSID=你的SSID值; APISID=你的APISID值; SAPISID=你的SAPISID值; __Secure-1PSID=你的1PSID值
```

或使用 JSON 格式:
```json
{"cookie": "SID=xxx; HSID=xxx; SSID=xxx; APISID=xxx; SAPISID=xxx; __Secure-1PSID=xxx", "sapisid": "你的SAPISID值"}
```

**替代方案 (浏览器扩展)**: 使用任意 "Export Cookies" 扩展导出 `gemini.google.com` 的 cookie, 然后转换为上述单行格式.

### 登录账号路径与 XSRF Token

如果已登录的 Gemini 页面 URL 带账号序号, 例如:

```
https://gemini.google.com/u/1/app/...
```

请把 `auth_user` 设置为该序号。登录态的 Gemini Web 请求还可能需要页面里的 XSRF token。该 token 在渲染后的 Gemini 页面源码中名为 `SNlM0e`; 在 `config.json` 中填入 `xsrf_token` 后, 服务会把它作为 `at` 表单字段提交。

示例:

```json
{
  "cookie_file": "/app/cookie.txt",
  "auth_user": "1",
  "xsrf_token": "AOOh0P...",
  "gemini_bl": "boq_assistant-bard-web-server_YYYYMMDD.xx_p0"
}
```

如果登录态请求返回 HTTP 400 且错误中包含 `xsrf`, 请刷新 Gemini Web 后更新 `xsrf_token`, 并确认 `auth_user` 与浏览器 URL 中的 `/u/<序号>/` 一致.

Pro 路由需要 **Gemini Advanced** (付费订阅). 免费 Google 账号的 cookie 可以登录认证, 但会静默回退到 Flash.

## 配置文件

在同目录创建 `config.json`:

```json
{
  "port": 8081,
  "host": "0.0.0.0",
  "retry_attempts": 3,
  "retry_delay_sec": 2,
  "request_timeout_sec": 180,
  "gemini_bl": "boq_assistant-bard-web-server_20260525.09_p0",
  "auth_user": null,
  "xsrf_token": null,
  "api_keys": ["sk-your-key"],
  "cookie_file": null,
  "proxy": null,
  "log_requests": true
}
```

`api_keys` 为空数组 `[]` 时不校验密钥；填入一个或多个密钥后, `/v1/*` 接口需要 `Authorization: Bearer <key>` 或 `x-api-key: <key>`.

## Docker 部署

```bash
cp config.example.json config.json
docker build -t gemini-web2api .
docker run -d --name gemini-web2api -p 8081:8081 -v ./config.json:/app/config.json gemini-web2api
```

或使用 Docker Compose:

```bash
cp config.example.json config.json
docker compose up -d
```

如需挂载 Cookie 文件:

```bash
docker run -d --name gemini-web2api -p 8081:8081 -v ./config.json:/app/config.json -v ./cookie.txt:/app/cookie.txt gemini-web2api
```

此时 `config.json` 中设置 `"cookie_file": "/app/cookie.txt"`.

> **注意**: 如果 Docker 默认 bridge 网络下出现空回复 (`content: null`), 请切换到 host 网络: `docker run --network host ...` 或在 compose 文件中添加 `network_mode: host`. 这是 Gemini 上游拒绝来自 Docker NAT IP 段的请求导致的.

## 生产部署 (Docker + Nginx + TLS)

面向公网的加固部署: 由 Nginx 反向代理终止 TLS 并强制校验 Bearer API Key, 应用本身只监听回环地址。所有配置都通过 `.env` 文件驱动 (不硬编码域名、路径或密钥), 宿主机只需安装 Docker。完整指南见 [`DEPLOY.md`](DEPLOY.md)。

**架构**

- **应用容器** — host 网络, 绑定 `${APP_HOST}:${APP_PORT}` (默认 `127.0.0.1:8081`), 以非 root 用户运行, `api_keys=[]` (内部/回环调用免密)。
- **Nginx 容器** — host 网络, 在 80/443 终止 TLS, HTTP→HTTPS 跳转, 外部请求必须携带 `Authorization: Bearer ${API_KEY}` (否则 `401`), 并无缓冲透传 SSE 流。
- **TLS** — 任意证书均可 (Cloudflare Origin 证书或 Let's Encrypt)。

**步骤**

```bash
# 1. 安装 Docker Engine + compose 插件
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. 配置 (所有值都在 .env / config.json 中, 均已 gitignore)
cp .env.example .env
cp config.example.json config.json
#   - .env: 设置 SERVER_NAME, CERT_DIR, SSL_CERT_FILE, SSL_CERT_KEY_FILE, API_KEY
#            生成密钥:  openssl rand -hex 24
#   - config.json: 将 "host"/"port" 设为 APP_HOST/APP_PORT, 并设置 "api_keys": []

# 3. 将 TLS 证书 + 私钥放入 CERT_DIR
ls "$CERT_DIR"   # 必须包含 $SSL_CERT_FILE 和 $SSL_CERT_KEY_FILE

# 4. 构建并启动
docker compose -f docker-compose.prod.yml up -d --build

# 5. (可选) 通过 systemd 定时器启用自动更新 (默认每 30 分钟)
sudo bash scripts/install-systemd.sh 30min
```

若前置 Cloudflare (橙云代理), 请将 SSL/TLS 模式设为 **Full (strict)** 并开启 **Always Use HTTPS**。

**验证**

```bash
# 内部免密 -> 200
curl http://${APP_HOST}:${APP_PORT}/
# 外部带 Key -> 200
curl https://${SERVER_NAME}/v1/models -H "Authorization: Bearer ${API_KEY}"
# 外部无 Key -> 401
curl -i https://${SERVER_NAME}/v1/models
```

**轮换 API Key**: 修改 `.env` 中的 `API_KEY`, 然后重新渲染 Nginx:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

**自动更新**: `scripts/auto-update.sh` 仅在远端有新提交时执行 `git pull` 并重建; `scripts/install-systemd.sh` 将其接入 systemd 定时器 (日志写入 `.auto-update.log`)。

## Cloudflare Worker 部署

以 Serverless 方式将 gemini-web2api 运行在 Cloudflare Workers 上 — 免费、全球分发、始终在线。Worker 是位于 [`worker/`](worker/) 的 TypeScript/Hono 移植版。完整指南: [`worker/DEPLOY.md`](worker/DEPLOY.md)。

**前置要求**: Cloudflare 账号 + Node.js 18+。

```bash
cd worker
npm install                # 安装依赖 (node_modules 已 gitignore)

# 配置密钥/变量 (推荐加密存储敏感信息)
npx wrangler secret put API_KEYS   # 逗号分隔的密钥, 如 sk-key1,sk-key2
npx wrangler secret put COOKIE     # 可选: Gemini Advanced cookie, 用于 Pro 路由
npx wrangler secret put SAPISID    # 可选 (未填时会尝试从 COOKIE 自动提取)

# 登录并部署
npx wrangler login
npm run deploy
```

部署完成后会输出你的域名, 例如 `https://gemini-web2api.<子域名>.workers.dev`。

**API Key 鉴权**: `API_KEYS` 为空时 Worker **完全开放** (免鉴权)。一旦设置, 鉴权将同时作用于
OpenAI 兼容端点 (`/v1/*`) 与 Google 原生端点 (`/v1beta/*`)。密钥可通过以下任意方式传递:

- `Authorization: Bearer <key>` (OpenAI 风格)
- `x-api-key: <key>`
- `x-goog-api-key: <key>` (Google Gemini 风格)
- `?key=<key>` (Google Gemini 查询参数)

**本地调试**: `npm run dev` 会在 `http://localhost:8787` 启动本地服务。在 `worker/.dev.vars` (已 gitignore) 中写入 `API_KEYS=sk-test` 即可本地测试鉴权。

**验证**

```bash
# 无 Key -> 401 (在设置了 API_KEYS 时)
curl -i https://gemini-web2api.<子域名>.workers.dev/v1/models
# 带 Key -> 200
curl https://gemini-web2api.<子域名>.workers.dev/v1/models -H "Authorization: Bearer sk-your-key"
```

## 代理配置

如果无法直接访问 `gemini.google.com` (连接超时), 需要配置代理:

**方式 1: 命令行参数**
```bash
python gemini_web2api.py --proxy http://127.0.0.1:7890
```

**方式 2: config.json**
```json
{"proxy": "http://127.0.0.1:7890"}
```

**方式 3: 环境变量** (自动检测)
```bash
set HTTPS_PROXY=http://127.0.0.1:7890
python gemini_web2api.py
```

支持 Clash, V2Ray, Shadowsocks 等任何 HTTP 代理.

## 已知限制

- **不支持图片/多模态输入**: Gemini 的图片上传需要专有的 WIZ streaming RPC 协议 (ProcessFile), 无法在标准 HTTP 代理中实现. 发送图片会被忽略并返回提示.
- **Pro/Ultra 非真实路由**: 无付费订阅 cookie 时, `gemini-3.1-pro` 实际路由到 Flash 模型. "Pro" 只是 UI 偏好标签.
- **单轮对话**: 每次请求是独立对话, 多轮上下文通过在 prompt 中包含历史消息模拟.
- **频率限制**: Google 可能限制高频请求, server 会自动重试但持续高负载可能被封.

## 系统要求

- Python 3.8+
- `httpx` (`pip install httpx`) — 用于流式请求
- 需要能访问 `gemini.google.com` (部分地区需代理)

## 工作原理

逆向 Google Gemini 网页端的 StreamGenerate 协议, 将 OpenAI API 格式与 Gemini 内部 protobuf-like 格式互转. 模型选择通过请求 payload 的 `[79]` 字段控制, 映射自 Gemini 前端 JS 源码中的 `MODE_CATEGORY` 枚举.

## 致谢

- [linux.do](https://linux.do) 社区
- 开源 API 代理生态

## License

MIT
