/**
 * MCP 存取资格解析。
 *
 * 第一波（本次实作）：`EnvKeyResolver`——未设 `DESTINY_MCP_KEY` 即 authless，
 * 设了就比对固定金钥。第二波（订阅系统就绪后）只需换成向订阅系统查询的实作，
 * transport 与 tool 层都不必改动。
 */

export interface Entitlement {
  valid: boolean;
  /** 谁：第一波固定值，第二波为伙伴 ID */
  subjectId: string;
  /** 方案代号，供工具分级用 */
  plan?: string;
  allowedToolset?: 'full' | 'mingshu';
  /** ISO 8601 */
  expiresAt?: string;
  /** valid=false 时的原因，回给用户端 */
  reason?: string;
}

export interface EntitlementResolver {
  resolve(credential: string | null): Promise<Entitlement>;
}

/** 资格快取上限：订阅会过期，不得长期快取。 */
export const ENTITLEMENT_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export const ANONYMOUS_SUBJECT_ID = 'anonymous';
export const SELF_HOSTED_SUBJECT_ID = 'self';

export class EnvKeyResolver implements EntitlementResolver {
  constructor(private readonly expectedKey: string | undefined) {}

  async resolve(credential: string | null): Promise<Entitlement> {
    const expected = this.expectedKey?.trim();

    // 未设金钥：authless，开发与自用模式
    if (!expected) {
      return { valid: true, subjectId: ANONYMOUS_SUBJECT_ID, allowedToolset: 'full' };
    }

    if (!credential) {
      return {
        valid: false,
        subjectId: ANONYMOUS_SUBJECT_ID,
        reason: 'missing_credential',
      };
    }

    if (!timingSafeEquals(credential, expected)) {
      return {
        valid: false,
        subjectId: ANONYMOUS_SUBJECT_ID,
        reason: 'invalid_credential',
      };
    }

    return { valid: true, subjectId: SELF_HOSTED_SUBJECT_ID, allowedToolset: 'full' };
  }
}

/** 长度不同直接判否；长度相同时走定时安全比较，避免以回应时间推敲金钥。 */
function timingSafeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * 从请求头读取凭证。
 *
 * **不接受 query string 传凭证**：MCP 授权规范明文禁止，且 URL 会被记入
 * 伺服器日志、代理与浏览纪录。
 */
export function readCredentialFromHeaders(headers: Headers): string | null {
  const authorization = headers.get('authorization');
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match?.[1]) return match[1].trim();
  }

  const custom = headers.get('x-destiny-mcp-key');
  if (custom?.trim()) return custom.trim();

  return null;
}

/** 身分无效回 401，资格无效（例如订阅过期）回 403——两者语意不同。 */
export function statusForEntitlement(entitlement: Entitlement): 401 | 403 {
  return entitlement.reason === 'missing_credential' || entitlement.reason === 'invalid_credential'
    ? 401
    : 403;
}
