import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMingyuServer } from '../../../mcp/src/create-server';
import type { ToolsetName } from '../../../mcp/src/toolsets';
import {
  EnvKeyResolver,
  readCredentialFromHeaders,
  statusForEntitlement,
  type EntitlementResolver,
} from '../../../mcp/src/auth/entitlement';
import { toAzureResponse } from './http-bridge';

/**
 * MCP 远端端点（Streamable HTTP）。
 *
 * Azure Functions 是无状态的：同一个连接的多次请求可能落在不同实例，
 * 因此这里一律使用 stateless 模式（`sessionIdGenerator: undefined`），
 * 每个请求新建 server 与 transport，不依赖 `mcp-session-id`。
 *
 * 同时启用 `enableJsonResponse`，让 tools/call 直接以 application/json 回覆，
 * 避免依赖 SSE 长连接——无服务器环境对长连接与冷启动的组合并不友善。
 */

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

/**
 * 每次请求都重新解析资格，不做跨请求快取——订阅会过期，只在发放当下检查一次
 * 会让停止订阅的伙伴继续用下去。
 */
function createResolver(): EntitlementResolver {
  return new EnvKeyResolver(process.env.DESTINY_MCP_KEY);
}

/** 从 JSON-RPC 请求体取出方法与工具名，仅供用量记录，解析失败不影响请求。 */
function describeInvocation(bodyText: string): string {
  try {
    const payload = JSON.parse(bodyText) as {
      method?: string;
      params?: { name?: string };
    };
    if (!payload?.method) return 'unknown';
    return payload.method === 'tools/call' && payload.params?.name
      ? `tools/call:${payload.params.name}`
      : payload.method;
  } catch {
    return 'unparsable';
  }
}

function jsonRpcError(status: 401 | 403, reason: string): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      error: { code: status === 401 ? -32001 : -32003, message: reason },
      id: null,
    }),
  };
}

async function handleMcpRequest(
  req: HttpRequest,
  toolset: ToolsetName,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (req.method === 'OPTIONS') {
    return { status: 204, headers: CORS_HEADERS };
  }

  const entitlement = await createResolver().resolve(readCredentialFromHeaders(req.headers));
  if (!entitlement.valid) {
    return jsonRpcError(statusForEntitlement(entitlement), entitlement.reason ?? 'forbidden');
  }

  const bodyText = req.method === 'GET' || req.method === 'DELETE' ? '' : await req.text();

  // 用量记录：第一波只写 log，但这是日后做用量计费与配额的唯一依据。
  context.log?.(
    `[mcp] subject=${entitlement.subjectId} toolset=${toolset} invocation=${describeInvocation(bodyText)}`,
  );

  const server = createMingyuServer({ toolset });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    // 请求体已被读走一次，这里用读到的文本重建标准 Request 交给 transport。
    const webRequest = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      ...(bodyText ? { body: bodyText } : {}),
    });
    const response = await transport.handleRequest(webRequest);
    const azureResponse = await toAzureResponse(response);
    return {
      ...azureResponse,
      headers: { ...azureResponse.headers, ...CORS_HEADERS },
    };
  } finally {
    await transport.close();
    await server.close();
  }
}

export async function mcpFullHandler(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  return handleMcpRequest(req, 'full', context);
}

export async function mcpMingshuHandler(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  return handleMcpRequest(req, 'mingshu', context);
}

app.http('mcpFull', {
  route: 'mcp',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: mcpFullHandler,
});

app.http('mcpMingshu', {
  route: 'mcp/mingshu',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: mcpMingshuHandler,
});
