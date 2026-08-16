import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMingyuServer } from '../../mcp/src/create-server.js';

/**
 * 回应大小是硬限制，不是效能调校：超过 claude.ai 上限就是坏掉。
 * 这组测试防止日后改动又把回应撑爆。
 */
const HARD_LIMIT = 150_000;

const PERSON_A = {
  gender: 'male' as const,
  dateType: 'solar' as const,
  year: 1990,
  month: 5,
  day: 15,
  timeIndex: 6,
};

const PERSON_B = {
  gender: 'female' as const,
  dateType: 'solar' as const,
  year: 1992,
  month: 9,
  day: 3,
  timeIndex: 4,
};

const ASTRO_A = {
  year: 1990,
  month: 5,
  day: 15,
  hour: 11,
  minute: 30,
  latitude: 25.033,
  longitude: 121.5654,
  timezone: 8,
};

const ASTRO_B = {
  year: 1992,
  month: 9,
  day: 3,
  hour: 7,
  minute: 10,
  latitude: 25.033,
  longitude: 121.5654,
  timezone: 8,
};

async function callCompact(name: string, args: Record<string, unknown>) {
  const server = createMingyuServer({ toolset: 'mingshu', outputMode: 'compact' });
  const client = new Client({ name: 'size-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      structuredContent?: unknown;
    };
    assert.notEqual(result.isError, true, `${name} 调用失败`);
    return {
      chars: JSON.stringify(result.structuredContent ?? {}).length,
      structuredContent: result.structuredContent as Record<string, unknown>,
    };
  } finally {
    await client.close();
    await server.close();
  }
}

test('compact 模式下命书工具回应不得超过 claude.ai 上限', async () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['bazi_calculate', PERSON_A],
    ['ziwei_calculate', { ...PERSON_A, year: '1990', month: '5', day: '15' }],
    ['bazi_compatibility', { person1: PERSON_A, person2: PERSON_B }],
    ['astrolabe_synastry', { person1: ASTRO_A, person2: ASTRO_B }],
  ];

  for (const [name, args] of cases) {
    const { chars } = await callCompact(name, args);
    assert.ok(chars < HARD_LIMIT, `${name} 回应 ${chars} 字元，已超过 ${HARD_LIMIT}`);
  }
});

test('compact 模式的双盘工具应为 relation-only，且关系资料完整保留', async () => {
  const { structuredContent } = await callCompact('bazi_compatibility', {
    person1: PERSON_A,
    person2: PERSON_B,
  });

  const result = structuredContent.result as {
    charts: { person1: Record<string, unknown> };
    compatibility: Record<string, unknown>;
  };

  // 嵌入盘已换成识别摘要
  assert.equal(result.charts.person1.relationOnly, true);
  assert.ok(result.charts.person1.pillars, '识别摘要仍须保留四柱以对应本人');
  assert.equal(result.charts.person1.luckInfo, undefined, '识别摘要不应包含大运');

  // 关系资料一项都不能少
  for (const key of [
    'dayMasterRelation',
    'spousePalaceRelations',
    'crossPillarRelations',
    'crossBranchCombinations',
    'tenGodMappings',
    'usefulGodCoverage',
    'limitations',
  ]) {
    assert.ok(key in result.compatibility, `关系资料缺少 ${key}`);
  }
});

test('full 模式必须保留完整嵌入盘与证据链，不得被 compact 影响', async () => {
  const server = createMingyuServer({ toolset: 'mingshu', outputMode: 'full' });
  const client = new Client({ name: 'size-test-full', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const result = (await client.callTool({
      name: 'bazi_compatibility',
      arguments: { person1: PERSON_A, person2: PERSON_B },
    })) as { structuredContent?: { result?: Record<string, unknown> } };

    const payload = result.structuredContent?.result as {
      charts: { person1: Record<string, unknown> };
      compatibility: Record<string, unknown>;
    };

    assert.equal(payload.charts.person1.relationOnly, undefined);
    assert.ok(payload.charts.person1.luckInfo, 'full 模式应保留大运');
    assert.ok(payload.compatibility.calculationSteps, 'full 模式应保留计算链');
    assert.ok(payload.compatibility.evidence, 'full 模式应保留证据包');
  } finally {
    await client.close();
    await server.close();
  }
});
