export const API_VERSION = 'v1';

export type PublicApiRuntime = {
  service: string;
  origin: string;
};

export const DEFAULT_PUBLIC_API_RUNTIME: PublicApiRuntime = {
  service: 'mingyu',
  origin: 'http://localhost:3000',
};

export const PUBLIC_API_ENDPOINTS = [
  'GET /api/v1/health',
  'GET /api/v1/manifest',
  'GET /api/v1/openapi.json',
  'GET /api/v1/foundation/capabilities',
  'GET /.well-known/aov-mingyu-api.json',
  'POST /api/v1/calendar/true-solar-time',
  'POST /api/v1/calendar/true-solar-birth',
  'POST /api/v1/calendar/astronomical-time',
  'POST /api/v1/calendar/moon-phase',
  'POST /api/v1/calendar/solar-term',
  'POST /api/v1/foundation/ganzhi',
  'POST /api/v1/foundation/wuxing',
  'POST /api/v1/foundation/direction',
  'POST /api/v1/foundation/shensha',
  'POST /api/v1/bazi/calculate',
  'POST /api/v1/bazi/prompt',
  'POST /api/v1/bazi/compatibility',
  'POST /api/v1/bazi/compatibility/prompt',
  'POST /api/v1/ziwei/calculate',
  'POST /api/v1/ziwei/prompt',
  'POST /api/v1/ziwei/compatibility',
  'POST /api/v1/ziwei/compatibility/prompt',
  'POST /api/v1/bazi-ziwei/prompt',
  'POST /api/v1/divination/liuyao',
  'POST /api/v1/divination/liuyao/prompt',
  'POST /api/v1/divination/meihua',
  'POST /api/v1/divination/meihua/prompt',
  'POST /api/v1/divination/xiaoliuren',
  'POST /api/v1/divination/xiaoliuren/prompt',
  'POST /api/v1/divination/qimen',
  'POST /api/v1/divination/qimen/prompt',
  'POST /api/v1/divination/liuren',
  'POST /api/v1/divination/liuren/prompt',
  'POST /api/v1/divination/tarot',
  'POST /api/v1/divination/tarot/prompt',
  'POST /api/v1/divination/ssgw',
  'POST /api/v1/divination/ssgw/prompt',
  'POST /api/v1/divination/almanac',
  'POST /api/v1/divination/almanac/prompt',
  'POST /api/v1/divination/lenormand',
  'POST /api/v1/divination/lenormand/prompt',
  'POST /api/v1/divination/astrolabe',
  'POST /api/v1/divination/astrolabe/prompt',
  'POST /api/v1/metaphysics/bazhai/calculate',
  'POST /api/v1/metaphysics/bazhai/prompt',
  'POST /api/v1/metaphysics/zodiac/calculate',
  'POST /api/v1/metaphysics/zodiac/prompt',
  'POST /api/v1/metaphysics/taiyi/calculate',
  'POST /api/v1/metaphysics/taiyi/prompt',
  'POST /api/v1/metaphysics/qizheng/calculate',
  'POST /api/v1/metaphysics/qizheng/prompt',
  'POST /api/v1/metaphysics/xuankong/calculate',
  'POST /api/v1/metaphysics/xuankong/prompt',
  'POST /api/v1/metaphysics/residential/calculate',
  'POST /api/v1/metaphysics/residential/prompt',
  'POST /api/v1/ai/analyze',
  'POST /api/v1/ai/models',
] as const;

/** 仅接受常规主机名与可选端口，避免把代理头里的异常值拼进对外公布的地址。 */
const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;

/** 代理头可能是 `a, b, c` 形式的链路，取最靠近客户端的第一段。 */
function readFirstForwardedValue(request: Request, header: string): string | null {
  const raw = request.headers.get(header);
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  return first ? first : null;
}

function readForwardedHost(request: Request): string | null {
  const candidates = [
    readFirstForwardedValue(request, 'x-forwarded-host'),
    readFirstForwardedValue(request, 'host'),
  ];
  return candidates.find((host): host is string => !!host && HOST_PATTERN.test(host)) ?? null;
}

function readForwardedProtocol(request: Request, fallback: string): string {
  const proto = readFirstForwardedValue(request, 'x-forwarded-proto');
  if (proto && /^https?$/i.test(proto)) {
    return `${proto.toLowerCase()}:`;
  }
  return fallback;
}

/**
 * 环境变量兜底：仅在请求头没有可用主机名时使用。
 * Cloudflare Workers 没有 process，这里做存在性判断而不是直接读取。
 */
function readConfiguredOrigin(): string | null {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const raw = env?.PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.origin.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * 解析对外公布的自身地址。
 *
 * Azure Functions 收到的 `request.url` 是 Function App 自身的 `*.azurewebsites.net`，
 * 自定义域名只出现在 `X-Forwarded-Host`，因此优先采用代理头；Cloudflare 与 Docker
 * 两条部署路径的 Host 头与 `request.url` 同源，行为不变。
 */
export function getPublicApiRuntime(request: Request): PublicApiRuntime {
  const url = new URL(request.url);

  // 显式配置优先：部署环境若无法提供可信的转发头，这是唯一能确定对外域名的来源。
  const configuredOrigin = readConfiguredOrigin();
  if (configuredOrigin) {
    return {
      service: new URL(configuredOrigin).host,
      origin: configuredOrigin,
    };
  }

  const forwardedHost = readForwardedHost(request);
  if (forwardedHost) {
    const protocol = readForwardedProtocol(request, url.protocol);
    return {
      service: forwardedHost,
      origin: `${protocol}//${forwardedHost}`,
    };
  }

  const origin = url.origin.replace(/\/+$/, '');

  return {
    service: url.host || DEFAULT_PUBLIC_API_RUNTIME.service,
    origin: origin || DEFAULT_PUBLIC_API_RUNTIME.origin,
  };
}

export function getPublicApiManifest(runtime: PublicApiRuntime = DEFAULT_PUBLIC_API_RUNTIME) {
  const baseUrl = `${runtime.origin}/api/${API_VERSION}`;

  return {
    name: 'AOV 命理与占卜公开 API',
    service: runtime.service,
    version: API_VERSION,
    baseUrl,
    openapiUrl: `${baseUrl}/openapi.json`,
    skillUrl: `${runtime.origin}/skills/aov-mingyu-api/SKILL.md`,
    endpoints: [...PUBLIC_API_ENDPOINTS],
  };
}

export function getPublicApiManifestForRequest(request: Request) {
  return getPublicApiManifest(getPublicApiRuntime(request));
}
