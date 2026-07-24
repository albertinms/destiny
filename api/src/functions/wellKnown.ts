import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { getPublicApiManifestForRequest } from '../../../src/lib/public-api/metadata';
import { toWebRequest } from './http-bridge';

const WELL_KNOWN_API_FILE = 'aov-mingyu-api.json';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function wellKnownHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const fileName = req.params.fileName ?? '';

  if (fileName !== WELL_KNOWN_API_FILE) {
    return { status: 404, headers: JSON_HEADERS, body: 'Not Found' };
  }

  const method = req.method.toUpperCase();
  if (method === 'OPTIONS') {
    return { status: 204, headers: JSON_HEADERS };
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return {
      status: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  const request = toWebRequest(req);
  return {
    status: 200,
    headers: JSON_HEADERS,
    body: method === 'HEAD' ? undefined : JSON.stringify(getPublicApiManifestForRequest(request)),
  };
}

app.http('wellKnown', {
  route: '.well-known/{fileName}',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wellKnownHandler,
});
