/**
 * 回应精简。
 *
 * claude.ai / Desktop 的工具结果上限约 150,000 字元，超过就是坏掉、不是变慢。
 * `compact` 保留命书实际用得到的结构化事实（四柱、十神、藏干、宫位主星、四化、
 * 相位角度、神煞命中位置），移除巢状计算链与逐步推导证据——那些是给机器核验用
 * 的，不是给撰写者读的。`full` 必须保留，不移除既有能力。
 */

export const OUTPUT_MODES = ['full', 'compact'] as const;

export type OutputMode = (typeof OUTPUT_MODES)[number];

/** 整块移除：逐步推导证据与计算链，体积大且不供撰写使用。 */
const DROPPED_BLOCK_KEYS = new Set([
  'evidenceAnalysis',
  'evidence_analysis',
  'patternAnalysis',
  'pattern_analysis',
  'evidence_pool',
  'evidence',
  'calculationSteps',
  'calculationChain',
  'counterEvidence',
  'counterEvidenceFacts',
  'counterEvidenceCount',
  'limitationFacts',
  'summaryFact',
  'methodology',
  'warningFacts',
  'warningSummaryFact',
]);

/** 逐项移除：每个事实上重复附带的溯源栏位。顶层 `limitations` 汇总仍保留。 */
const DROPPED_FIELD_KEYS = new Set([
  'promptText',
  'calculation',
  'calculationStepKey',
  'calculationStepKeys',
  'dependsOnStepKeys',
  'ownerFactKeys',
  'ownerStepKeys',
  'factKeys',
  'stable_key',
  'sources',
  'source',
  'limitation',
]);

function shouldDrop(key: string): boolean {
  return DROPPED_BLOCK_KEYS.has(key) || DROPPED_FIELD_KEYS.has(key);
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 双盘识别摘要：只保留「这是谁的盘」所需的最小事实，供关系资料对应回本人。
 *
 * 完整命盘不在这里重复——命书分存架构下，每个人的盘已经各自取过一次并落地，
 * 合盘回应再嵌一份是冗余，不是资讯量。
 */
function summarizeChart(chart: unknown): unknown {
  if (!isRecord(chart)) return chart;

  const summary: UnknownRecord = { relationOnly: true };

  // 八字盘
  if (isRecord(chart.pillars)) {
    for (const key of [
      'name',
      'gender',
      'solarDate',
      'lunarDate',
      'pillars',
      'dayMaster',
      'zodiac',
    ]) {
      if (chart[key] !== undefined) summary[key] = chart[key];
    }
    return summary;
  }

  // 紫微盘（buildSerializableZiweiResult 的输出）
  if (isRecord(chart.basicInfo)) {
    summary.basicInfo = chart.basicInfo;
    if (chart.scopeNames !== undefined) summary.scopeNames = chart.scopeNames;
    return summary;
  }

  // 西洋星盘
  if (isRecord(chart.birth)) {
    summary.birth = chart.birth;
    if (isRecord(chart.summary)) summary.summary = chart.summary;
    return summary;
  }

  return chart;
}

/** 双盘工具一律以 `charts: { person1, person2 }` 承载嵌入命盘。 */
function isEmbeddedCharts(value: unknown): value is UnknownRecord {
  return isRecord(value) && ('person1' in value || 'person2' in value);
}

/**
 * relation-only：把双盘回应里重复嵌入的两份完整命盘换成识别摘要，只留关系资料。
 * 仅在 compact 模式生效；full 模式保留完整嵌入盘，不移除既有能力。
 */
export function toRelationOnly(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toRelationOnly(item));
  }

  if (!isRecord(value)) return value;

  const result: UnknownRecord = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'charts' && isEmbeddedCharts(item)) {
      const charts: UnknownRecord = {};
      for (const [person, chart] of Object.entries(item)) {
        charts[person] = summarizeChart(chart);
      }
      result[key] = charts;
      continue;
    }
    result[key] = toRelationOnly(item);
  }
  return result;
}

/** 深层剪枝；不修改原物件。 */
export function compactStructured(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => compactStructured(item));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (shouldDrop(key)) continue;
      result[key] = compactStructured(item);
    }
    return result;
  }

  return value;
}
