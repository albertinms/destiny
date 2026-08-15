import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpRequest, type InvocationContext } from '@azure/functions';
import { mcpMingshuHandler, mcpFullHandler } from '../../api/src/functions/mcp.js';

const PROTOCOL_VERSION = '2025-06-18';

function createRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new HttpRequest({
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: { string: JSON.stringify(body) },
  });
}

const context = {} as InvocationContext;

async function readJson(response: { body?: unknown }) {
  const body = response.body;
  const text =
    typeof body === 'string'
      ? body
      : Buffer.isBuffer(body)
        ? body.toString('utf8')
        : String(body ?? '');
  return JSON.parse(text) as { result?: Record<string, unknown>; error?: unknown };
}

async function initialize(handler: typeof mcpMingshuHandler, url: string) {
  const response = await handler(
    createRequest(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'azure-endpoint-test', version: '0.0.0' },
      },
    }),
    context,
  );
  return response;
}

test('Azure MCP 端点应完成 initialize 且不发放 session id（无状态模式）', async () => {
  const response = await initialize(mcpMingshuHandler, 'https://example.test/api/mcp/mingshu');

  assert.equal(response.status, 200);
  const payload = await readJson(response);
  assert.equal(
    (payload.result as { serverInfo?: { name?: string } })?.serverInfo?.name,
    'mingyu-mcp-server',
  );

  const headers = (response.headers ?? {}) as Record<string, string>;
  const sessionHeader = Object.keys(headers).find((key) => key.toLowerCase() === 'mcp-session-id');
  assert.equal(sessionHeader, undefined, '无状态模式不应回传 mcp-session-id');
});

test('Azure MCP 命书端点应只列出 12 个工具', async () => {
  const response = await mcpMingshuHandler(
    createRequest(
      'https://example.test/api/mcp/mingshu',
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { 'mcp-protocol-version': PROTOCOL_VERSION },
    ),
    context,
  );

  assert.equal(response.status, 200);
  const payload = await readJson(response);
  const tools = (payload.result as { tools?: Array<{ name: string }> })?.tools ?? [];
  assert.equal(tools.length, 12);
  assert.ok(tools.some((tool) => tool.name === 'bazi_calculate'));
  assert.ok(!tools.some((tool) => tool.name === 'divine_liuyao'));
});

test('Azure MCP 完整端点应列出 56 个工具', async () => {
  const response = await mcpFullHandler(
    createRequest(
      'https://example.test/api/mcp',
      { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
      { 'mcp-protocol-version': PROTOCOL_VERSION },
    ),
    context,
  );

  const payload = await readJson(response);
  const tools = (payload.result as { tools?: Array<{ name: string }> })?.tools ?? [];
  assert.equal(tools.length, 56);
});

test('Azure MCP 端点应能实际执行排盘工具', async () => {
  const response = await mcpMingshuHandler(
    createRequest(
      'https://example.test/api/mcp/mingshu',
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'bazi_calculate',
          arguments: {
            gender: 'male',
            dateType: 'solar',
            year: 1990,
            month: 5,
            day: 15,
            timeIndex: 6,
          },
        },
      },
      { 'mcp-protocol-version': PROTOCOL_VERSION },
    ),
    context,
  );

  assert.equal(response.status, 200);
  const payload = await readJson(response);
  const result = payload.result as {
    isError?: boolean;
    structuredContent?: { result?: { pillars?: Record<string, { ganZhi?: string }> } };
  };

  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent?.result?.pillars?.year?.ganZhi, '庚午');
  assert.equal(result.structuredContent?.result?.pillars?.day?.ganZhi, '庚辰');
});

test('Azure MCP 端点设定金钥后：无凭证 401、错误凭证 401、正确凭证正常', async () => {
  const previous = process.env.DESTINY_MCP_KEY;
  process.env.DESTINY_MCP_KEY = 'test-key-123456';

  const listBody = { jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} };
  const url = 'https://example.test/api/mcp/mingshu';

  try {
    const missing = await mcpMingshuHandler(createRequest(url, listBody), context);
    assert.equal(missing.status, 401);
    assert.match(String(missing.body), /missing_credential/);

    const wrong = await mcpMingshuHandler(
      createRequest(url, listBody, { authorization: 'Bearer wrong-key-1234' }),
      context,
    );
    assert.equal(wrong.status, 401);
    assert.match(String(wrong.body), /invalid_credential/);

    const correct = await mcpMingshuHandler(
      createRequest(url, listBody, {
        authorization: 'Bearer test-key-123456',
        'mcp-protocol-version': PROTOCOL_VERSION,
      }),
      context,
    );
    assert.equal(correct.status, 200);
    const payload = await readJson(correct);
    assert.equal((payload.result as { tools?: unknown[] })?.tools?.length, 12);

    const viaCustomHeader = await mcpMingshuHandler(
      createRequest(url, listBody, {
        'x-destiny-mcp-key': 'test-key-123456',
        'mcp-protocol-version': PROTOCOL_VERSION,
      }),
      context,
    );
    assert.equal(viaCustomHeader.status, 200);
  } finally {
    if (previous === undefined) delete process.env.DESTINY_MCP_KEY;
    else process.env.DESTINY_MCP_KEY = previous;
  }
});

test('Azure MCP 端点不接受以 query string 传凭证', async () => {
  const previous = process.env.DESTINY_MCP_KEY;
  process.env.DESTINY_MCP_KEY = 'test-key-123456';

  try {
    const response = await mcpMingshuHandler(
      createRequest('https://example.test/api/mcp/mingshu?key=test-key-123456', {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/list',
        params: {},
      }),
      context,
    );
    assert.equal(response.status, 401);
  } finally {
    if (previous === undefined) delete process.env.DESTINY_MCP_KEY;
    else process.env.DESTINY_MCP_KEY = previous;
  }
});

test('Azure MCP 端点应回应 CORS 预检', async () => {
  const response = await mcpMingshuHandler(
    new HttpRequest({ method: 'OPTIONS', url: 'https://example.test/api/mcp/mingshu' }),
    context,
  );

  assert.equal(response.status, 204);
  const headers = (response.headers ?? {}) as Record<string, string>;
  assert.equal(headers['Access-Control-Allow-Origin'], '*');
});
