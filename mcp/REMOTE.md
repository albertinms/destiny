# 远端 MCP（Streamable HTTP）

`mcp/` 原本只有 stdio 传输，只能在使用者自己电脑上以本机程序启动。本文件说明补上的
HTTP 传输层：端点、工具集、认证、环境变数、回应大小与已知限制。

## 端点

| 端点 | 工具集 | 用途 |
|---|---|---|
| `POST https://api.destiny.tathata.live/mcp` | `full`（56 个工具） | 完整命理占卜工具 |
| `POST https://api.destiny.tathata.live/mcp/mingshu` | `mingshu`（12 个工具） | 本心命书专用，只含本命型排盘 |

两个端点都接受 `POST` / `GET` / `DELETE` / `OPTIONS`，`authLevel: anonymous`。
Azure Static Web Apps 的路由改写定义在 `public/staticwebapp.config.json`
（`/mcp` → `/api/mcp`、`/mcp/mingshu` → `/api/mcp/mingshu`）。

### Claude Code

```bash
claude mcp add --transport http destiny https://api.destiny.tathata.live/mcp/mingshu
```

### plugin 的 `.mcp.json`

```json
{
  "mcpServers": {
    "destiny": {
      "type": "http",
      "url": "https://api.destiny.tathata.live/mcp/mingshu"
    }
  }
}
```

## 工具集

`mingshu` 白名单定义在 `mcp/src/toolsets.ts`：

`bazi_calculate`、`ziwei_calculate`、`bazi_ziwei_prompt`、`divine_astrolabe`、
`bazi_compatibility`、`ziwei_compatibility`、`astrolabe_synastry`、
`metaphysics_qizheng`、`metaphysics_zodiac`、`foundation_shensha`、
`foundation_ganzhi`、`foundation_wuxing`

排除占卜类（六爻／梅花／奇门／大六壬／金口诀／小六壬／塔罗／雷诺曼／灵签）、择日
（黄历）、阳宅风水（八宅／玄空／住宅）与太乙神数——皆非本命型盘。

筛选做在 `createMingyuServer()` 的注册代理层，**未改动任何 `mcp/src/tools/*.ts`**。

## 无状态模式（重要）

Azure Functions 是无服务器的：同一连接的多次请求可能落在不同实例。因此传输层一律使用
**stateless 模式**（`sessionIdGenerator: undefined`），每个请求新建 server 与 transport，
不发放也不依赖 `mcp-session-id`；同时启用 `enableJsonResponse`，`tools/call` 直接以
`application/json` 回覆，不依赖 SSE 长连接。

## 认证

介面在 `mcp/src/auth/entitlement.ts`：`EntitlementResolver` 为抽象，第一波实作为
`EnvKeyResolver`。日后接上订阅系统时只换实作，transport 与 tool 层不动。

| 环境变数 | 行为 |
|---|---|
| 未设 `DESTINY_MCP_KEY` | authless，一律放行（开发与自用） |
| 已设 `DESTINY_MCP_KEY` | 比对请求头，符合才放行 |

凭证接受两种请求头，**不接受 query string**（MCP 授权规范明文禁止，且 URL 会被记入
伺服器日志、代理与浏览纪录）：

```
Authorization: Bearer <key>
X-Destiny-MCP-Key: <key>
```

- 身分无效（缺凭证／凭证错误）回 **401**；资格无效（例如订阅过期）回 **403**。两者语意不同。
- 每次请求都重新解析资格，**不做跨请求快取**——订阅会过期，只在发放当下检查一次会让
  停止订阅的伙伴继续用下去。快取上限常数 `ENTITLEMENT_CACHE_MAX_AGE_MS` 为 5 分钟。
- 每次呼叫都会记录 `subjectId` 与工具名称。第一波只是写 log，但这是日后做用量计费与
  配额的唯一依据。

## 环境变数

| 变数 | 用途 |
|---|---|
| `PUBLIC_BASE_URL` | 对外公布的自身地址，例如 `https://api.destiny.tathata.live`。manifest 与 openapi 的 `servers[].url` 依此产生 |
| `DESTINY_MCP_KEY` | MCP 端点金钥；不设即 authless |

`PUBLIC_BASE_URL` 优先于请求头。未设时依序采用 `X-Forwarded-Host` → `Host` →
`request.url` 的 origin。Azure Functions 收到的 `request.url` 是 Function App 自身的
`*.azurewebsites.net`，自定义域名只出现在转发头，因此这个顺序是必要的。

## 回应大小

claude.ai / Desktop 的工具结果上限约 **150,000 字元**，Claude Code 为 25,000 tokens
（`MAX_MCP_OUTPUT_TOKENS` 可调）。超过上限在 claude.ai 就是坏掉，不是变慢。

HTTP 端点一律使用 `outputMode: 'compact'`；stdio 维持 `full`，行为不变。

`compact` 做两件事：

1. **剪除计算链与逐步证据**——`calculationSteps`、`calculationChain`、`counterEvidence*`、
   `summaryFact`、`limitationFacts`、`evidence`、`promptText`、`methodology`，以及逐项重复的
   `sources` / `limitation` / `stable_key`。顶层 `limitations` 汇总**保留**。
2. **双盘工具改为 relation-only**——`charts.person1/person2` 换成识别摘要
   （八字留四柱与日主、紫微留 `basicInfo`、星盘留 `birth`），带 `relationOnly: true` 标记。
   完整命盘各自呼叫 `*_calculate` 取得；命书分存架构下每个人的盘本来就已各自落地，
   合盘再嵌一份是冗余。

实测（代表性输入，字元数）：

| 工具 | full | compact |
|---|---|---|
| astrolabe_synastry | 368,136 | 36,661 |
| ziwei_compatibility | 250,501 | 8,109 |
| bazi_compatibility | 221,101 | 10,558 |
| bazi_ziwei_prompt | 197,707 | 80,514 |
| divine_astrolabe | 136,168 | 17,854 |
| metaphysics_qizheng | 113,420 | 23,953 |
| ziwei_calculate | 106,386 | 18,108 |
| bazi_calculate | 88,480 | 59,566 |
| metaphysics_zodiac | 15,091 | 912 |
| foundation_shensha | 9,942 | 1,940 |
| foundation_wuxing | 9,545 | 2,353 |
| foundation_ganzhi | 6,007 | 1,001 |

量测脚本：

```bash
pnpm exec tsx --tsconfig tsconfig.app.json scripts/measure-mcp-response-size.ts [--compact]
```

## 已知限制

- **`bazi_calculate` 与 `bazi_ziwei_prompt` 仍高于 50,000 字元的余裕目标**（59,566 / 80,514），
  但远低于 150,000 硬上限。体积的 89% 是大运（37,013）与流年（16,021）；命盘本体只有数百
  字元。要再压只能砍岁运资料，那是流年主题的原料，因此保留，待细粒度查询工具
  （`bazi_luck_cycle` / `bazi_liunian`）就位后再以「要哪段取哪段」解决。
- **`full` 模式的回应会超过 claude.ai 上限**，仅供 stdio 与自行处理分页的呼叫端使用。
- 无状态模式不支援 SSE 续传与 `resumptionToken`；`GET /mcp` 不提供长连接。
- Anthropic 出口 IP 为 `160.79.104.0/21`，若日后要做来源限制可据此设定。
- Claude.ai / Desktop 的工具呼叫 timeout 为 300 秒。

## 相关测试

| 档案 | 覆盖 |
|---|---|
| `tests/mcp/toolsets.test.ts` | full=56、mingshu=12、排除项、保留工具可呼叫 |
| `tests/mcp/azure-endpoint.test.ts` | initialize 不发 session id、两个端点的工具数、实际排盘、金钥 401、拒绝 query string 传凭证、CORS 预检 |
| `tests/mcp/response-size.test.ts` | compact 不得超硬上限、双盘 relation-only 且关系资料齐全、full 模式必须保留完整嵌入盘与证据链 |
| `tests/mcp/structured-output.test.ts` | 既有 37 个端到端测试（会真的 spawn stdio server） |
