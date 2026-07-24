import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { getAiRuntimeConfigScript, type AiRuntimeEnv } from '../../../src/lib/ai/runtime-config';

const SCRIPT_HEADERS = {
  'Content-Type': 'text/javascript; charset=utf-8',
  'Cache-Control': 'no-store',
  Allow: 'GET,HEAD,OPTIONS',
};

function readEnv(): AiRuntimeEnv {
  return {
    AI_API_KEY: process.env.AI_API_KEY,
    AI_PROVIDER_NAME: process.env.AI_PROVIDER_NAME,
    AI_BUILTIN_ENABLED: process.env.AI_BUILTIN_ENABLED,
    AI_DEFAULT_ENABLED: process.env.AI_DEFAULT_ENABLED,
  };
}

export async function runtimeConfigHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    return { status: 204, headers: SCRIPT_HEADERS };
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return { status: 405, headers: SCRIPT_HEADERS, body: '方法不支持。' };
  }

  return {
    status: 200,
    headers: SCRIPT_HEADERS,
    body: method === 'HEAD' ? undefined : getAiRuntimeConfigScript(readEnv()),
  };
}

app.http('runtimeConfig', {
  route: 'mingyu-runtime-config.js',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: runtimeConfigHandler,
});
