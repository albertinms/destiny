/**
 * 在 Azure Functions v4 编程模型的 HttpRequest/HttpResponseInit 与标准 Web
 * Request/Response 之间转换，让 src/lib 下与 Cloudflare Pages Functions 共用的
 * 业务逻辑无需改动即可在 Azure Functions 中复用。
 */
import type { HttpRequest, HttpResponseInit } from '@azure/functions';

export function toWebRequest(req: HttpRequest): Request {
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers: req.headers,
  };
  if (hasBody && req.body) {
    init.body = req.body as unknown as ReadableStream<Uint8Array>;
    init.duplex = 'half';
  }
  return new Request(req.url, init);
}

export async function toAzureResponse(response: Response): Promise<HttpResponseInit> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  if (!response.body) {
    return { status: response.status, headers };
  }

  // SSE（text/event-stream）走真正的流式响应；其余响应体积小，直接缓冲更稳妥、
  // 不依赖 Azure Functions 的 enableHttpStream 预览特性。
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    return { status: response.status, headers, body: response.body };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers, body: buffer };
}
