# 自定义适配器脚本接口文档

本文档定义「供应商自定义脚本」的编写规则。脚本运行在网关主进程的常驻沙箱中，把任意供应商 API 翻译成 OpenAI 兼容格式。**函数名即识别协议**：脚本只要按约定的名字导出这些函数，软件就能识别并驱动它。

- 完整可运行范例：`scripts/commandcode-adapter.js`
- 编辑器内置模板：新建「自定义脚本」供应商时自动填充（`src/lib/providers.ts` 的 `DEFAULT_SCRIPT`）

---

## 1. 脚本是什么

脚本**不是**反向代理本身。真正的反代是软件自带的本地网关（主进程 HTTP 服务，暴露 `/v1/chat/completions`、`/v1/responses`）。脚本只是被网关按函数名约定调用的格式翻译器：

- 请求方向：OpenAI 格式 → 供应商格式（`prepareRequest`）
- 响应方向：供应商格式 → OpenAI 格式（`createStreamParser` / `parseResponse`）
- 模型列表：供应商格式 → `[{ id }]`（`listModels`）

## 2. 运行环境与执行语义（重要）

脚本运行在**主进程**的 `vm` 沙箱中（不是浏览器、不是渲染进程）。每条规则都影响你能写什么：

| 规则 | 说明 |
|---|---|
| 语言 | 纯 JavaScript（ES2015+），不能用 `require` / `import` / Node API |
| 可用全局 | `env`、`http`、`console`、`setTimeout`、`clearTimeout`、标准 JS 内建（`JSON`/`Math`/`Date`/`Map`…） |
| 模块级状态 | **跨请求持久**。顶层 `const`/`let`/`Map` 缓存（会话、节流、token）在同一个供应商实例内长期存活 |
| 重新编译时机 | 脚本内容、Base URL、API Key 任一变更 → 该供应商的沙箱重建，旧状态全部丢弃 |
| 超时兜底 | 编译 5s、异步调用 30s、上游流 300s |
| 安全 | `vm` 不是硬沙箱，脚本等同本机代码权限；**不要把密钥硬编码进脚本**（密钥应填在供应商配置里） |

> 这是本软件与普通「反代脚本」最大的不同：状态真的持久。脚本里维护的会话/初始化缓存会在请求之间存活，这正是反代脚本该有的行为。

## 3. 固定 API 契约

脚本用 `export` 写（像 ESM），但运行时 `export` 关键字会被剥掉，真正起作用的是**函数名**。按名字导出以下内容：

### `meta`（可选）
```js
export const meta = {
  defaultBaseUrl: 'https://api.example.com/v1', // 为空时自动填充 Base URL 输入框（用户可覆盖）
  description: '我的适配器',
}
```

### `prepareRequest`（必写）
每次聊天 / 网关请求都会调用。可以做预检（调用 `http` 维护会话、初始化），然后返回要发给上游的请求规格。
```js
// openaiReq = OpenAI chat completions 请求体
// 常见字段：model, messages, max_tokens, temperature, tools,
//           tool_choice, parallel_tool_calls, reasoning_effort, stream
export async function prepareRequest(openaiReq, env, http) {
  return {
    url: env.baseUrl + '/chat/completions',   // 必填
    method: 'POST',                            // 必填
    headers: { 'Authorization': 'Bearer ' + env.apiKey },
    body: openaiReq,                           // 发给上游的请求体（JSON 对象）
  }
}
```
返回结构：`{ url: string, method: string, headers: object, body: object }`，缺 `url`/`method` 会报错。

### `createStreamParser`（流式必写）
每次流式请求调用**一次**，返回一个带状态的逐行解析器。闭包里的变量（如 `chunkIndex`、工具调用序号）在**同一条流内**持久。

```js
// 返回 { delta } 或 { delta, finishReason, usage } 或 null（跳过该行）
export function createStreamParser(model, completionId, created) {
  var chunkIndex = 0
  return {
    parseLine: function (line) {
      // line = 上游 NDJSON 的一行（已按 \n 切分）
      return {
        delta: { content: '...' },
        finishReason: 'stop',   // 可选：stop / length / tool_calls
        usage: { prompt_tokens, completion_tokens, total_tokens }, // 可选，最后一行给
      }
    },
  }
}
```

`delta` 是 OpenAI `chat.completion.chunk` 的 delta 对象：

| 字段 | 说明 |
|---|---|
| `role` | 只在第一行给 `'assistant'` |
| `content` | 文本增量 |
| `tool_calls` | 工具调用增量，形如 `[{ index, id, type:'function', function:{ name, arguments } }]` |
| `reasoning_content` | 思考内容（扩展字段，客户端会渲染成可折叠的思考块） |

### `parseResponse`（非流式必写）
上游返回整包响应时调用（非流式请求）。返回 OpenAI `chat.completion` 结构：
```js
export function parseResponse(rawBody, model, completionId, created) {
  // rawBody = 上游整段响应文本（可能是 NDJSON 或 JSON）
  return {
    id: completionId,
    object: 'chat.completion',
    created: created,
    model: model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: '...' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}
```
如果上游即使非流式也返回 NDJSON，可以复用 `createStreamParser` 逐行聚合（参考范例 `commandcode-adapter.js` 的 `parseResponse`）。

### `listModels`（拉模型/测试连接）
```js
export async function listModels(env, http) {
  var r = await http.get(env.baseUrl + '/models', {
    'Authorization': 'Bearer ' + env.apiKey,
  })
  if (!r.ok) return []
  return r.body.data.map(function (m) { return { id: m.id } }) // 可带 ownedBy
}
```
返回 `[{ id, ownedBy? }]`。

## 4. 注入对象

### `env`
```js
env = { baseUrl: string, apiKey: string }
```
来自供应商配置。

### `http`
```js
http.get(url, headers)                 // -> Promise<{ ok, status, body, text }>
http.post(url, headers, body)          // -> Promise<{ ok, status, body, text }>
```
- 都是异步函数，必须 `await`
- `body`：上游返回的 JSON 解析结果，解析失败为 `null`
- `text`：原始响应文本
- 可以 fire-and-forget（不 await 的失败不会崩溃进程）

## 5. 调用时机速查

| 场景 | 调用的脚本函数 |
|---|---|
| 聊天页发消息 | `prepareRequest` → `createStreamParser`（逐行解析后推送） |
| 网关 `/v1/chat/completions`（流式） | `prepareRequest` → `createStreamParser` 逐行 |
| 网关 `/v1/chat/completions`（非流式） | `prepareRequest` → `parseResponse` |
| 网关 `/v1/responses` | `prepareRequest`（收到的是 chat 转换后的请求体）→ 流式/非流式同上，再由网关翻译回 Responses 格式 |
| 拉取模型 / 测试连接 | `listModels` |
| 编辑器「预览请求」按钮 | `prepareRequest`（带样例请求，**不真的调用上游**） |
| 编辑器保存校验 | 编译检查 + 顶层运行检查（不调用函数） |

## 6. 最小可用脚本

```js
export const meta = {
  defaultBaseUrl: '',
  description: 'OpenAI 兼容直通',
}

export async function prepareRequest(openaiReq, env, http) {
  return {
    url: env.baseUrl + '/chat/completions',
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.apiKey },
    body: openaiReq,
  }
}

export function createStreamParser(model, completionId, created) {
  var first = true
  return {
    parseLine: function (line) {
      var trimmed = line.trim()
      if (!trimmed || trimmed === '[DONE]' || !trimmed.startsWith('{')) return null
      var c = JSON.parse(trimmed)
      var delta = first
        ? { role: 'assistant', content: c.choices[0].delta.content }
        : { content: c.choices[0].delta.content }
      first = false
      return { delta: delta }
    },
  }
}

export function parseResponse(rawBody, model, completionId, created) {
  var c = JSON.parse(rawBody)
  return c // 已经是 OpenAI chat.completion 结构
}

export async function listModels(env, http) {
  var r = await http.get(env.baseUrl + '/models', {
    'Authorization': 'Bearer ' + env.apiKey,
  })
  if (!r.ok) return []
  return r.body.data.map(function (m) { return { id: m.id } })
}
```

## 7. 常见坑

- **别假设状态每次都重置**：模块级状态现在是持久的。想清状态就改一下脚本内容（触发重编译）。
- **返回结构必须对**：`prepareRequest` 缺 `url`/`method`、`parseLine` 返回结构不对、`parseResponse` 不是完整 `chat.completion`，都会在运行时报错（错误会直接显示在聊天页或编辑器里）。
- **流式上游建议 `stream: true`**：大多数供应商的流式响应是 NDJSON 每行一个事件，`createStreamParser` 就是为它设计的。
- **不要在顶层跑耗时逻辑**：脚本在请求时编译，顶层代码会阻塞该请求；耗时初始化放 `prepareRequest` 里用 `http` 做。
- **错误可见性**：脚本抛错会以「Adapter script error: …」的形式出现在网关响应 / 聊天页 / 预览按钮的报错里；编辑器的「保存校验」能提前帮你抓到语法和顶层错误。
