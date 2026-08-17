# Mail Audit Site

一个面向 Microsoft 邮箱的轻量邮件检查工具。它根据邮箱中的指定邮件，展示 ChatGPT Desktop referral reward 的 Credits 数值，并标记疑似 `OpenAI API - Access Deactivated` 邮件；不会访问 ChatGPT 或 OpenAI 账号接口。

> 仅用于你拥有或已获得明确授权的邮箱。请遵守 Microsoft、OpenAI 及所在地区的服务条款和法律。
> 已部署地址https://zh.kpro.eu.cc/

## 功能

- 批量导入四段格式账号：`邮箱----密码----client_id----refresh_token`
- 通过 Microsoft OAuth 读取邮箱，优先使用 Microsoft Graph，必要时回退到 OAuth IMAP
- 识别标题为 `Your ChatGPT Desktop referral reward is ready` 的奖励邮件，并提取正文中 `credits` 前的数字
- 识别含 `OpenAI API` 与 `Access Deactivated/Deactivation` 的邮件，作为封禁邮件信号
- 结果按全部、已封禁、未发现、失败筛选，每页显示 100 条
- 可打开本次读取到的邮件列表，自由选择邮件并以纯文本查看正文
- 提供 `GET /healthz` 健康检查和 `POST /api/check` 查询接口

“已封禁”是邮件内容匹配结果，不是对账号状态的权威判定；未发现也不代表账号一定正常。

## 输入格式

每行一个邮箱：

```text
name@outlook.com----password-placeholder----client_id----refresh_token
```

密码段仅为兼容既有四段格式，程序不会使用它进行登录，也不会保存它。`refresh_token` 中即使带有 `----`，也会被作为第四段的一部分处理。

## 本地运行

要求：Node.js 20 或更高版本、Python 3（仅在 IMAP 回退时使用）。项目没有 npm 第三方依赖。

```bash
node server.mjs
```

默认监听 `0.0.0.0:4399`。可通过环境变量调整：

```bash
HOST=127.0.0.1 PORT=4399 node server.mjs
```

Windows PowerShell 示例：

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '4399'
node server.mjs
```

打开 `http://127.0.0.1:4399/`，或检查：

```bash
curl http://127.0.0.1:4399/healthz
```

## Docker 部署

Docker Compose 默认将服务限制在本机回环地址，便于交给 Nginx、Caddy 等反向代理对外提供 HTTPS：

```bash
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:4399/healthz
```

停止服务：

```bash
docker compose down
```

容器以非 root 用户运行，使用只读文件系统、`tmpfs` 和 `no-new-privileges`。`deploy/nginx.conf.example` 提供了不含真实域名或证书路径的反向代理示例；部署前请替换域名、补充 HTTPS 配置，并先执行 `nginx -t`。

## API

### `POST /api/check`

请求体：

```json
{
  "input": "name@outlook.com----password-placeholder----client_id----refresh_token"
}
```

单次最多处理 100 个去重后的邮箱，服务端并发检查 4 个。响应中包含邮件匹配结果，以及本次读取到的、已裁剪的纯文本邮件内容。

### `GET /healthz`

成功时返回：

```json
{"ok":true}
```

## 隐私与安全

- 不要把真实邮箱、密码、`client_id`、`refresh_token`、Docker `.env` 或私钥提交到 GitHub。
- 输入凭据只在当前请求处理过程中使用；服务不包含数据库、文件落盘或凭据日志逻辑。浏览器在查询完成后会清空输入框，结果仅保留在当前标签页内存中。
- Microsoft 可能在刷新令牌时签发新的 refresh token。本项目不会持久化或返回该令牌；请自行保管原始凭据并按需要重新授权。
- 邮件正文会被转换为纯文本显示，脚本和 HTML 标签会被移除；接口响应仍可能含有邮件敏感内容。
- 对公网部署时，请在反向代理层配置 HTTPS 和访问控制（例如 SSO、IP 白名单或 Basic Auth），并限制 `4399` 端口不直接暴露到公网。
- 若凭据曾出现在聊天记录、截图、提交记录或公开仓库中，应立即在相应提供商处撤销并重新授权。

## 测试

```bash
npm run check
```

该命令会执行语法检查、四段格式与邮件解析测试，以及邮件服务回退流程测试。

## 发布到 GitHub

请只在这个项目目录中初始化 Git 仓库，不要在包含服务器备份、私钥或其他项目的上层目录执行 `git add .`。

```bash
git init -b main
git add .
git status
git commit -m "Initial release"
git remote add origin https://github.com/YOUR_NAME/YOUR_REPOSITORY.git
git push -u origin main
```

推送前再次确认 `git status` 与 `git diff --cached` 中没有真实邮箱、`refresh_token`、私钥、证书或部署备份。若 GitHub 创建仓库时已经自动生成 README，请先合并或删除其中一个 README，避免首次推送冲突。

## 项目结构

```text
server.mjs             HTTP 服务、静态页面和接口边界
mail-service.mjs       Microsoft OAuth、Graph 和 IMAP 邮件读取
mail-parser.mjs        四段格式解析、奖励/封禁邮件识别、响应裁剪
microsoft-imap.py      OAuth IMAP 回退读取器
public/                前端页面
deploy/                Nginx 与证书续期示例
test/                  单元与安全序列化测试
```
