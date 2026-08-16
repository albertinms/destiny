/**
 * 量测命书工具集（mingshu）12 个工具的回应大小。
 *
 * 上限基准：claude.ai / Desktop 约 150,000 字元；目标压到 50,000 以内留余裕。
 * 用法：pnpm exec tsx --tsconfig tsconfig.app.json scripts/measure-mcp-response-size.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMingyuServer } from '../mcp/src/create-server.js';
import { MINGSHU_TOOLS } from '../mcp/src/toolsets.js';

const HARD_LIMIT = 150_000;
const TARGET = 50_000;

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

const ZIWEI_A = {
  gender: 'male' as const,
  dateType: 'solar' as const,
  year: '1990',
  month: '5',
  day: '15',
  timeIndex: 6,
};

const ZIWEI_B = {
  gender: 'female' as const,
  dateType: 'solar' as const,
  year: '1992',
  month: '9',
  day: '3',
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

const CASES: Record<string, Record<string, unknown>> = {
  bazi_calculate: PERSON_A,
  ziwei_calculate: ZIWEI_A,
  bazi_ziwei_prompt: { ...PERSON_A, question: '整体命局如何' },
  divine_astrolabe: ASTRO_A,
  bazi_compatibility: { person1: PERSON_A, person2: PERSON_B },
  ziwei_compatibility: { person1: ZIWEI_A, person2: ZIWEI_B },
  astrolabe_synastry: { person1: ASTRO_A, person2: ASTRO_B },
  metaphysics_qizheng: { year: 1990, month: 5, day: 15, hour: 11 },
  metaphysics_zodiac: { zodiac: '马', year: 2026 },
  foundation_shensha: {
    yearGanZhi: '庚午',
    monthGanZhi: '辛巳',
    dayGanZhi: '庚辰',
    hourGanZhi: '壬午',
  },
  foundation_ganzhi: { ganZhi: '庚午' },
  foundation_wuxing: { items: ['庚', '午', '辛', '巳', '庚', '辰', '壬', '午'] },
};

async function main() {
  const mode = process.argv.includes('--compact') ? 'compact' : 'full';
  const server = createMingyuServer({ toolset: 'mingshu', outputMode: mode });
  const client = new Client({ name: 'response-size-meter', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const rows: Array<{ tool: string; chars: number; status: string }> = [];

  for (const tool of MINGSHU_TOOLS) {
    const args = CASES[tool];
    if (!args) {
      rows.push({ tool, chars: 0, status: '未量测（缺代表性输入）' });
      continue;
    }

    try {
      const result = (await client.callTool({ name: tool, arguments: args })) as {
        isError?: boolean;
        content?: unknown;
        structuredContent?: unknown;
      };

      if (result.isError) {
        const text = JSON.stringify(result.content ?? '');
        rows.push({ tool, chars: text.length, status: `调用失败：${text.slice(0, 120)}` });
        continue;
      }

      const chars = JSON.stringify(result.structuredContent ?? result.content ?? {}).length;
      const status = chars > HARD_LIMIT ? '超过硬上限' : chars > TARGET ? '超过目标' : '通过';
      rows.push({ tool, chars, status });
    } catch (error) {
      rows.push({ tool, chars: 0, status: `异常：${String(error).slice(0, 120)}` });
    }
  }

  rows.sort((left, right) => right.chars - left.chars);

  const width = Math.max(...rows.map((row) => row.tool.length));
  console.log(`模式：${mode}`);
  console.log(`${'工具'.padEnd(width)}  ${'字元数'.padStart(10)}  状态`);
  console.log('-'.repeat(width + 30));
  for (const row of rows) {
    console.log(
      `${row.tool.padEnd(width)}  ${row.chars.toLocaleString().padStart(10)}  ${row.status}`,
    );
  }

  const over = rows.filter((row) => row.chars > TARGET);
  console.log(
    `\n合计 ${rows.length} 个工具，超过目标 ${TARGET.toLocaleString()} 字元者 ${over.length} 个，` +
      `超过硬上限 ${HARD_LIMIT.toLocaleString()} 字元者 ${rows.filter((row) => row.chars > HARD_LIMIT).length} 个。`,
  );

  await client.close();
  await server.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
