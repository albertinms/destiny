/**
 * 工具集白名单。
 *
 * 'full'    —— 注册全部工具，stdio 与既有部署行为不变。
 * 'mingshu' —— 只保留「本心命书」需要的本命型排盘工具；占卜、择日、阳宅风水、
 *              太乙神数等非本命型盘不属于命书职责范围，一律排除。
 */

export const MINGSHU_TOOLS = [
  'bazi_calculate', // 八字四柱、十神、藏干、大运、流年
  'ziwei_calculate', // 紫微十二宫、星曜、四化
  'bazi_ziwei_prompt', // 八字紫微合参
  'divine_astrolabe', // 西洋星盘（需出生地经纬度）
  'bazi_compatibility', // 八字合婚
  'ziwei_compatibility', // 紫微双盘
  'astrolabe_synastry', // 西占双盘
  'metaphysics_qizheng', // 七政四余（补充视角）
  'metaphysics_zodiac', // 生肖流年
  'foundation_shensha', // 神煞结构化佐证
  'foundation_ganzhi', // 六十甲子
  'foundation_wuxing', // 五行统计
] as const;

export type MingshuToolName = (typeof MINGSHU_TOOLS)[number];

export const TOOLSET_NAMES = ['full', 'mingshu'] as const;

export type ToolsetName = (typeof TOOLSET_NAMES)[number];

export function isToolsetName(value: unknown): value is ToolsetName {
  return typeof value === 'string' && (TOOLSET_NAMES as readonly string[]).includes(value);
}

/**
 * 取得工具集对应的允许清单；'full' 回传 null 表示不做筛选。
 */
export function getToolAllowlist(toolset: ToolsetName): ReadonlySet<string> | null {
  if (toolset === 'mingshu') {
    return new Set<string>(MINGSHU_TOOLS);
  }
  return null;
}
