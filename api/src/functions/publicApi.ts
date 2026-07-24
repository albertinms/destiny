import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { handlePublicApiRequest } from '../../../src/lib/public-api/handler';
import type { AiEnv } from '../../../src/lib/ai/proxy';
import { toWebRequest, toAzureResponse } from './http-bridge';

app.setup({ enableHttpStream: true });

function readEnv(): AiEnv {
  return {
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
    AI_PROVIDER_NAME: process.env.AI_PROVIDER_NAME,
    AI_BUILTIN_ENABLED: process.env.AI_BUILTIN_ENABLED,
    AI_DEFAULT_ENABLED: process.env.AI_DEFAULT_ENABLED,
  };
}

export async function publicApiHandler(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const rawPath = req.params.path ?? '';
  const segments = rawPath.split('/').filter(Boolean);

  const request = toWebRequest(req);
  const response = await handlePublicApiRequest(request, segments, readEnv());
  return toAzureResponse(response);
}

app.http('publicApi', {
  route: 'v1/{*path}',
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: publicApiHandler,
});

// 补充精确匹配 /api/v1（无尾随路径），确保 catch-all 路由不覆盖该场景。
app.http('publicApiRoot', {
  route: 'v1',
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: publicApiHandler,
});
