// Minimal i18n: flat dictionaries for zh/en + a typed translate helper.
// `t` keys are constrained to the English dictionary so typos fail the build.
import { useLocaleStore } from '@/lib/store/locale'

export type Locale = 'zh' | 'en'

type Vars = Record<string, string | number>

const en = {
  // Navigation / shell
  'nav.chat': 'Chat',
  'nav.models': 'Models',
  'nav.gateway': 'Gateway',
  'nav.logs': 'Call Logs',
  'nav.settings': 'Settings',
  'nav.explorer': 'Explorer',
  'nav.ready': 'Ready',
  'nav.toggleSidebar': 'Toggle Sidebar',

  // Chat sidebar
  'sidebar.conversations': 'Conversations',
  'sidebar.noConversations': 'No conversations yet.',
  'sidebar.newConversation': 'New conversation',
  'sidebar.yesterday': 'Yesterday',
  'sidebar.deleteConversation': 'Delete conversation',

  // Providers sidebar
  'sidebar.providers': 'Providers',
  'sidebar.default': 'Default',
  'sidebar.custom': 'Custom',
  'sidebar.noCustomProviders': 'No custom providers yet.',
  'sidebar.removeProvider': 'Remove {name}',

  // Gateway sidebar
  'gateway.configuration': 'Configuration',

  // Call logs
  'logs.empty': 'No calls yet.',
  'logs.clear': 'Clear',
  'logs.selectPrompt': 'Select a call to view details',
  'logs.overview': 'Overview',
  'logs.request': 'Request',
  'logs.response': 'Response',
  'logs.headers': 'Headers',
  'logs.body': 'Body',
  'logs.kind': 'Type',
  'logs.timestamp': 'Time',
  'logs.method': 'Method',
  'logs.path': 'Path',
  'logs.status': 'Status',
  'logs.duration': 'Duration',
  'logs.model': 'Model',
  'logs.tokens': 'Tokens',
  'logs.ip': 'IP',
  'logs.stream': 'Stream',
  'logs.truncated': 'Truncated (first 200k chars shown)',

  // Common
  'common.add': 'Add',
  'common.cancel': 'Cancel',
  'common.close': 'Close',

  // Settings
  'settings.title': 'Settings',
  'settings.subtitle': 'Appearance',
  'settings.theme': 'Theme',
  'settings.themeDesc': 'Choose light, dark, or follow the system color scheme.',
  'settings.light': 'Light',
  'settings.dark': 'Dark',
  'settings.system': 'System',
  'settings.accent': 'Accent color',
  'settings.accentDesc':
    'Sets the primary color used for highlights, focus rings, and selections.',
  'settings.custom': 'Custom',
  'settings.language': 'Language',
  'settings.languageDesc': 'Choose the interface language.',
  'settings.about': 'About',

  // Chat page
  'chat.model': 'Model',
  'chat.selectModel': 'Select a model',
  'chat.noModels': 'No models available. Configure providers first.',
  'chat.new': 'New',
  'chat.startMessage': 'Send a message to start chatting.',
  'chat.createFirst': 'Create a new conversation to begin.',
  'chat.newConversation': 'New conversation',
  'chat.thinking': 'Thinking',
  'chat.expand': 'expand',
  'chat.collapse': 'collapse',
  'chat.sendPlaceholder': 'Send a message…',
  'chat.send': 'Send',
  'chat.you': 'You',
  'chat.assistant': 'Assistant',
  'chat.errorPrefix': '**Error**: {message}',

  // Gateway page
  'gateway.pageTitle': 'Gateway Configuration',
  'gateway.pageSubtitle': 'Local LLM API server',
  'gateway.running': 'Running',
  'gateway.stopped': 'Stopped',
  'gateway.starting': 'Starting…',
  'gateway.start': 'Start',
  'gateway.stop': 'Stop',
  'gateway.listenPort': 'Listen port',
  'gateway.bindAddress': 'Bind address',
  'gateway.apiKey': 'API Key (optional)',
  'gateway.apiKeyPlaceholder': 'leave empty for no auth',
  'gateway.hideKey': 'Hide key',
  'gateway.showKey': 'Show key',
  'gateway.clientsSend': 'Clients send this as',
  'gateway.endpoint': 'Endpoint',
  'gateway.readyForClients':
    'Ready for OpenAI-compatible client connections.',
  'gateway.startHint': 'Start the gateway to accept connections.',
  'gateway.localhostOnly': '127.0.0.1 (localhost only)',
  'gateway.lanAccessible': '0.0.0.0 (LAN accessible)',

  // Models page
  'models.subtitle': 'Models & routing',
  'models.statusConnected': 'Connected',
  'models.statusNotTested': 'Not tested',
  'models.statusTesting': 'Testing…',
  'models.statusFailed': 'Failed',
  'models.testing': 'Testing…',
  'models.testConnection': 'Test connection',
  'models.connectedFound': 'Connected · {count} models found',
  'models.enabled': 'Enabled',
  'models.baseUrl': 'Base URL',
  'models.apiKey': 'API key',
  'models.apiKeyPlaceholder': 'leave empty if none',
  'models.hideKey': 'Hide key',
  'models.showKey': 'Show key',
  'models.format': 'Format',
  'models.adapterScript': 'Adapter script',
  'models.adapterScriptPlaceholder':
    '// Export: prepareRequest, createStreamParser, parseResponse, listModels',
  'models.scriptValid': 'Script OK',
  'models.scriptError': 'Script error: {message}',
  'models.previewRequest': 'Preview request',
  'models.previewHint':
    'Runs prepareRequest with a sample request — no upstream call.',
  'models.models': 'Models',
  'models.on': 'On',
  'models.alias': 'Alias',
  'models.model': 'Model',
  'models.fallback': 'Fallback',
  'models.context': 'Context',
  'models.price': 'Price (in/out)',
  'models.noModelsYet': 'No models yet. Click "Add model" to register one.',
  'models.toggleModel': 'Toggle {name}',
  'models.deleteModel': 'Delete {name}',
  'models.exposedVia': 'Exposed via the local gateway as',

  // Adapter types
  'adapter.openaiCompatible': 'OpenAI-compatible',
  'adapter.openaiCompatibleHint':
    '/v1/chat/completions - OpenAI, Ollama, OpenRouter, Groq, DeepSeek…',
  'adapter.anthropic': 'Anthropic (native)',
  'adapter.anthropicHint': '/messages - needs request/stream translation',
  'adapter.gemini': 'Google Gemini (native)',
  'adapter.geminiHint':
    '/generateContent - needs request/stream translation',
  'adapter.customScript': 'Custom script',
  'adapter.customScriptHint':
    'JS transform script - convert any API to OpenAI format (gateway required)',

  // Add model dialog
  'addModel.button': 'Add model',
  'addModel.desc':
    'Register a model from the provider, or type a custom ID.',
  'addModel.fetch': 'Fetch models',
  'addModel.loaded': '{count} models loaded',
  'addModel.searchPlaceholder': 'Search models...',
  'addModel.noMatch': 'No matching models',
  'addModel.modelId': 'Model ID',
  'addModel.modelIdPlaceholder': 'e.g. gpt-4o',
  'addModel.alias': 'Alias',
  'addModel.aliasPlaceholder': 'defaults to model id',

  // Add provider dialog
  'addProvider.title': 'Add custom provider',
  'addProvider.desc':
    'Register an upstream provider the gateway will route to.',
  'addProvider.name': 'Name',
  'addProvider.namePlaceholder': 'e.g. OpenRouter',
  'addProvider.format': 'Format',
  'addProvider.baseUrl': 'Base URL',
  'addProvider.optional': '(optional, auto-fills from script)',
  'addProvider.apiKey': 'API key',
  'addProvider.apiKeyPlaceholder': 'sk-…',
  'addProvider.submit': 'Add provider',
} as const

export type MessageKey = keyof typeof en

const zh: Record<MessageKey, string> = {
  'nav.chat': '聊天',
  'nav.models': '模型',
  'nav.gateway': '网关',
  'nav.logs': '功能日志',
  'nav.settings': '设置',
  'nav.explorer': '资源管理器',
  'nav.ready': '就绪',
  'nav.toggleSidebar': '切换侧边栏',

  'sidebar.conversations': '对话',
  'sidebar.noConversations': '还没有对话。',
  'sidebar.newConversation': '新对话',
  'sidebar.yesterday': '昨天',
  'sidebar.deleteConversation': '删除对话',

  'sidebar.providers': '供应商',
  'sidebar.default': '默认',
  'sidebar.custom': '自定义',
  'sidebar.noCustomProviders': '还没有自定义供应商。',
  'sidebar.removeProvider': '移除 {name}',

  'gateway.configuration': '配置',

  'logs.empty': '暂无调用记录',
  'logs.clear': '清空',
  'logs.selectPrompt': '点击左侧记录查看详情',
  'logs.overview': '概要',
  'logs.request': '请求',
  'logs.response': '响应',
  'logs.headers': '头部',
  'logs.body': '正文',
  'logs.kind': '类型',
  'logs.timestamp': '时间',
  'logs.method': '方法',
  'logs.path': '路径',
  'logs.status': '状态',
  'logs.duration': '耗时',
  'logs.model': '模型',
  'logs.tokens': 'Token',
  'logs.ip': 'IP',
  'logs.stream': '流式',
  'logs.truncated': '已截断（仅显示前 20 万字符）',

  'common.add': '添加',
  'common.cancel': '取消',
  'common.close': '关闭',

  'settings.title': '设置',
  'settings.subtitle': '外观',
  'settings.theme': '主题',
  'settings.themeDesc': '选择浅色、深色或跟随系统配色方案。',
  'settings.light': '浅色',
  'settings.dark': '深色',
  'settings.system': '系统',
  'settings.accent': '强调色',
  'settings.accentDesc': '设置用于高亮、焦点和选中的主色。',
  'settings.custom': '自定义',
  'settings.language': '语言',
  'settings.languageDesc': '选择界面显示语言。',
  'settings.about': '关于',

  'chat.model': '模型',
  'chat.selectModel': '选择一个模型',
  'chat.noModels': '暂无可用模型，请先配置供应商。',
  'chat.new': '新建',
  'chat.startMessage': '发送消息开始聊天。',
  'chat.createFirst': '创建新对话开始。',
  'chat.newConversation': '新对话',
  'chat.thinking': '思考中',
  'chat.expand': '展开',
  'chat.collapse': '收起',
  'chat.sendPlaceholder': '发送消息…',
  'chat.send': '发送',
  'chat.you': '你',
  'chat.assistant': '助手',
  'chat.errorPrefix': '**错误**：{message}',

  'gateway.pageTitle': '网关配置',
  'gateway.pageSubtitle': '本地 LLM API 服务',
  'gateway.running': '运行中',
  'gateway.stopped': '已停止',
  'gateway.starting': '启动中…',
  'gateway.start': '启动',
  'gateway.stop': '停止',
  'gateway.listenPort': '监听端口',
  'gateway.bindAddress': '绑定地址',
  'gateway.apiKey': 'API Key（可选）',
  'gateway.apiKeyPlaceholder': '留空表示无需鉴权',
  'gateway.hideKey': '隐藏密钥',
  'gateway.showKey': '显示密钥',
  'gateway.clientsSend': '客户端以此发送',
  'gateway.endpoint': '端点',
  'gateway.readyForClients': '已就绪，可接受 OpenAI 兼容客户端连接。',
  'gateway.startHint': '启动网关以接受连接。',
  'gateway.localhostOnly': '127.0.0.1（仅本机）',
  'gateway.lanAccessible': '0.0.0.0（局域网可访问）',

  'models.subtitle': '模型与路由',
  'models.statusConnected': '已连接',
  'models.statusNotTested': '未测试',
  'models.statusTesting': '测试中…',
  'models.statusFailed': '失败',
  'models.testing': '测试中…',
  'models.testConnection': '测试连接',
  'models.connectedFound': '已连接 · 找到 {count} 个模型',
  'models.enabled': '已启用',
  'models.baseUrl': '基础 URL',
  'models.apiKey': 'API Key',
  'models.apiKeyPlaceholder': '没有则留空',
  'models.hideKey': '隐藏密钥',
  'models.showKey': '显示密钥',
  'models.format': '格式',
  'models.adapterScript': '适配器脚本',
  'models.adapterScriptPlaceholder':
    '// 导出: prepareRequest, createStreamParser, parseResponse, listModels',
  'models.scriptValid': '脚本有效',
  'models.scriptError': '脚本错误：{message}',
  'models.previewRequest': '预览请求',
  'models.previewHint': '用样例请求运行 prepareRequest——不会真的调用上游。',
  'models.models': '模型',
  'models.on': '开',
  'models.alias': '别名',
  'models.model': '模型',
  'models.fallback': '回退',
  'models.context': '上下文',
  'models.price': '价格（入/出）',
  'models.noModelsYet': '还没有模型，点击“添加模型”注册一个。',
  'models.toggleModel': '切换 {name}',
  'models.deleteModel': '删除 {name}',
  'models.exposedVia': '通过本地网关暴露为',

  'adapter.openaiCompatible': 'OpenAI 兼容',
  'adapter.openaiCompatibleHint':
    '/v1/chat/completions - OpenAI、Ollama、OpenRouter、Groq、DeepSeek…',
  'adapter.anthropic': 'Anthropic（原生）',
  'adapter.anthropicHint': '/messages - 需要请求/流翻译',
  'adapter.gemini': 'Google Gemini（原生）',
  'adapter.geminiHint': '/generateContent - 需要请求/流翻译',
  'adapter.customScript': '自定义脚本',
  'adapter.customScriptHint': 'JS 转换脚本 - 将任意 API 转为 OpenAI 格式（需网关）',

  'addModel.button': '添加模型',
  'addModel.desc': '从供应商注册模型，或输入自定义 ID。',
  'addModel.fetch': '拉取模型',
  'addModel.loaded': '已加载 {count} 个模型',
  'addModel.searchPlaceholder': '搜索模型…',
  'addModel.noMatch': '没有匹配的模型',
  'addModel.modelId': '模型 ID',
  'addModel.modelIdPlaceholder': '例如 gpt-4o',
  'addModel.alias': '别名',
  'addModel.aliasPlaceholder': '默认为模型 ID',

  'addProvider.title': '添加自定义供应商',
  'addProvider.desc': '注册网关将要路由到的上游供应商。',
  'addProvider.name': '名称',
  'addProvider.namePlaceholder': '例如 OpenRouter',
  'addProvider.format': '格式',
  'addProvider.baseUrl': '基础 URL',
  'addProvider.optional': '（可选，从脚本自动填充）',
  'addProvider.apiKey': 'API Key',
  'addProvider.apiKeyPlaceholder': 'sk-…',
  'addProvider.submit': '添加供应商',
}

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, zh }

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Vars,
): string {
  const template = MESSAGES[locale]?.[key] ?? en[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  )
}

export function useI18n(): {
  locale: Locale
  t: (key: MessageKey, vars?: Vars) => string
} {
  const locale = useLocaleStore((s) => s.locale)
  return {
    locale,
    t: (key, vars) => translate(locale, key, vars),
  }
}
