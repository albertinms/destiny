import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBaziTool } from './tools/bazi.js';
import { registerZiweiTool } from './tools/ziwei.js';
import { registerBaziZiweiTool } from './tools/bazi-ziwei.js';
import { registerLiuyaoTool } from './tools/liuyao.js';
import { registerMeihuaTool } from './tools/meihua.js';
import { registerXiaoliurenTool } from './tools/xiaoliuren.js';
import { registerJinkoujueTool } from './tools/jinkoujue.js';
import { registerQimenTool } from './tools/qimen.js';
import { registerLiurenTool } from './tools/liuren.js';
import { registerTarotTool } from './tools/tarot.js';
import { registerSsgwTool } from './tools/ssgw.js';
import { registerAlmanacTool } from './tools/almanac.js';
import { registerLenormandTool } from './tools/lenormand.js';
import { registerAstrolabeTool } from './tools/astrolabe.js';
import { registerBaZhaiTool } from './tools/ba_zhai.js';
import { registerZodiacTool } from './tools/zodiac.js';
import { registerTaiyiTool } from './tools/taiyi.js';
import { registerQizhengTool } from './tools/qi_zheng.js';
import { registerXuanKongTool } from './tools/xuan_kong.js';
import { registerResidentialFengshuiTool } from './tools/residential_fengshui.js';
import { registerFoundationTools } from './tools/foundation.js';
import { registerCalendarTools } from './tools/calendar.js';
import { getToolAllowlist, type ToolsetName } from './toolsets.js';
import { compactStructured, toRelationOnly, type OutputMode } from './output-modes.js';

export const SERVER_NAME = 'mingyu-mcp-server';
export const SERVER_VERSION = '0.1.0';

export const SERVER_INSTRUCTIONS =
  '命语 MCP Server：提供真太阳时换算、八字排盘、紫微斗数、八字紫微合参、六爻、梅花易数、小六壬、金口诀、奇门遁甲、大六壬、塔罗牌、雷诺曼、灵签、黄历择日、星盘等命理占卜工具。AI 可调用基础工具和排盘工具获取结构化数据，也可调用一站式提示词工具直接获得排盘结果和结构化 AI 解读提示词。';

export interface CreateServerOptions {
  /** 'full' 注册全部工具（预设）；'mingshu' 只注册命书白名单内的工具。 */
  toolset?: ToolsetName;
  /**
   * 'full'（预设）保留完整结构，stdio 与既有行为不变；
   * 'compact' 剪除计算链与逐步证据，供有回应大小上限的远端环境使用。
   */
  outputMode?: OutputMode;
}

type ToolHandler = (...args: unknown[]) => unknown;

function isCallToolResult(
  value: unknown,
): value is { structuredContent?: unknown; content?: unknown } {
  return !!value && typeof value === 'object' && 'structuredContent' in value;
}

/** 剪枝后同步更新 `content` 的文字镜像，避免两者不一致。 */
function compactToolResult(result: unknown): unknown {
  if (!isCallToolResult(result) || result.structuredContent === undefined) {
    return result;
  }

  const structuredContent = compactStructured(toRelationOnly(result.structuredContent));
  return {
    ...result,
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  };
}

function wrapHandler(handler: ToolHandler): ToolHandler {
  return (...args: unknown[]) => {
    const outcome = handler(...args);
    if (outcome instanceof Promise) {
      return outcome.then((value) => compactToolResult(value));
    }
    return compactToolResult(outcome);
  };
}

/**
 * 以代理拦截 `registerTool`：未列入白名单者跳过注册，compact 模式则包住处理器
 * 在回传前剪枝。
 *
 * 这样做是为了满足「不得改动 mcp/src/tools/*.ts」的约束：各 register 函式
 * 内部一次注册多个工具，唯一的共同接触点就是 `server.registerTool`。
 */
function createInterceptingServer(
  server: McpServer,
  allowed: ReadonlySet<string> | null,
  outputMode: OutputMode,
): McpServer {
  const proxy = new Proxy(server, {
    get(target, property, receiver) {
      if (property === 'registerTool') {
        return (name: string, ...rest: unknown[]) => {
          if (allowed && !allowed.has(name)) {
            return undefined;
          }

          const args = [...rest];
          const lastIndex = args.length - 1;
          if (outputMode === 'compact' && typeof args[lastIndex] === 'function') {
            args[lastIndex] = wrapHandler(args[lastIndex] as ToolHandler);
          }

          return (target.registerTool as (...callArgs: unknown[]) => unknown)(name, ...args);
        };
      }

      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return proxy as McpServer;
}

/**
 * 建立一台已注册全部工具、但尚未挂载传输层的 MCP server。
 *
 * stdio 入口与 HTTP 入口共用这个工厂：stdio 进程启动时调用一次，
 * 无状态 HTTP 处理器则每次请求调用一次，避免跨请求共享连接状态。
 */
export function createMingyuServer(options: CreateServerOptions = {}): McpServer {
  const toolset = options.toolset ?? 'full';
  const outputMode = options.outputMode ?? 'full';
  const allowlist = getToolAllowlist(toolset);

  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const target =
    allowlist || outputMode === 'compact'
      ? createInterceptingServer(server, allowlist, outputMode)
      : server;

  registerBaziTool(target);
  registerZiweiTool(target);
  registerBaziZiweiTool(target);
  registerLiuyaoTool(target);
  registerMeihuaTool(target);
  registerXiaoliurenTool(target);
  registerJinkoujueTool(target);
  registerQimenTool(target);
  registerLiurenTool(target);
  registerTarotTool(target);
  registerSsgwTool(target);
  registerAlmanacTool(target);
  registerLenormandTool(target);
  registerAstrolabeTool(target);
  registerBaZhaiTool(target);
  registerZodiacTool(target);
  registerTaiyiTool(target);
  registerQizhengTool(target);
  registerXuanKongTool(target);
  registerResidentialFengshuiTool(target);
  registerFoundationTools(target);
  registerCalendarTools(target);

  return server;
}
