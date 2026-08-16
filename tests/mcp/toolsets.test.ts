import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMingyuServer } from '../../mcp/src/create-server.js';
import { MINGSHU_TOOLS } from '../../mcp/src/toolsets.js';

async function listToolNames(toolset?: 'full' | 'mingshu') {
  const server = createMingyuServer(toolset ? { toolset } : undefined);
  const client = new Client({ name: 'toolset-test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
    await server.close();
  }
}

test('MCP 预设工具集应注册全部 56 个工具', async () => {
  const names = await listToolNames();

  assert.equal(names.length, 56);
  assert.ok(names.includes('divine_liuyao'), '预设工具集应包含占卜类工具');
  assert.ok(names.includes('bazi_calculate'));
});

test('MCP 命书工具集应恰好注册白名单内的 12 个工具', async () => {
  const names = await listToolNames('mingshu');

  assert.equal(names.length, MINGSHU_TOOLS.length);
  assert.deepEqual(names, [...MINGSHU_TOOLS].sort());
});

test('MCP 命书工具集应排除占卜、择日与阳宅风水工具', async () => {
  const names = await listToolNames('mingshu');

  for (const excluded of [
    'divine_liuyao',
    'divine_meihua',
    'divine_qimen',
    'divine_tarot',
    'divine_almanac',
    'metaphysics_bazhai',
    'metaphysics_xuankong',
    'metaphysics_taiyi',
  ]) {
    assert.ok(!names.includes(excluded), `${excluded} 不应出现在命书工具集`);
  }
});

test('MCP 命书工具集保留的工具仍可正常调用', async () => {
  const server = createMingyuServer({ toolset: 'mingshu' });
  const client = new Client({ name: 'toolset-call-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const result = (await client.callTool({
      name: 'foundation_ganzhi',
      arguments: { ganZhi: '甲子' },
    })) as { isError?: boolean; structuredContent?: unknown };

    assert.notEqual(result.isError, true);
    assert.ok(result.structuredContent, '应返回结构化内容');
  } finally {
    await client.close();
    await server.close();
  }
});
