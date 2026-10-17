import type { Env } from '../env';

/**
 * 外部图床（Sanyue ImgHub / CloudFlare-ImgBed 系）集成
 *
 * 对接的是社区常见的 `/upload` 接口：
 *   POST {base}/upload?authCode=xxx&returnFormat=full
 *   form-data: file=<binary>
 *   响应:     [{ "src": "/file/xxxx.jpg" }]
 *
 * 认证码只存在于 Worker 的 secret 中，浏览器永远不会拿到它；
 * 前端只与本站的 /api/upload 通信，图片由 Worker 转发上传。
 */

export interface ImgbedConfig {
  /** 图床根地址，不带结尾斜杠 */
  base: string;
  /** 上传认证码（图床后台设置的 authCode） */
  authCode: string;
  /** 可选：上传渠道，如 telegram / cfr2 / s3 */
  channel?: string;
  /** 可选：上传目录，如 img/bbs */
  folder?: string;
  /** 单张图片上限（字节） */
  maxBytes: number;
  /** 单张图片上限（MB，用于提示文案） */
  maxMb: number;
}

export const DEFAULT_MAX_MB = 8;

export type ImgbedResult = { ok: true; url: string } | { ok: false; error: string; status?: number };

/** 读取图床配置；未配置 URL 或认证码时返回 null（前端据此隐藏上传入口） */
export function imgbedConfig(env: Env): ImgbedConfig | null {
  const base = (env.IMGBED_URL || '').trim();
  const authCode = (env.IMGBED_AUTH_CODE || '').trim();
  if (!base || !authCode) return null;

  const normalized = (/^https?:\/\//i.test(base) ? base : `https://${base}`).replace(/\/+$/, '');
  const parsedMb = Number.parseInt((env.IMGBED_MAX_MB || '').trim(), 10);
  const maxMb = Number.isFinite(parsedMb) && parsedMb > 0 ? Math.min(parsedMb, 25) : DEFAULT_MAX_MB;

  return {
    base: normalized,
    authCode,
    channel: (env.IMGBED_CHANNEL || '').trim() || undefined,
    folder: (env.IMGBED_FOLDER || '').trim() || undefined,
    maxMb,
    maxBytes: maxMb * 1024 * 1024,
  };
}

export function imgbedEnabled(env: Env): boolean {
  return imgbedConfig(env) !== null;
}

/** 从各种可能的响应结构里找出图片地址 */
function pickSrc(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') return payload.trim() || null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = pickSrc(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['src', 'url', 'link', 'path']) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    for (const key of ['data', 'result', 'files', 'file']) {
      const found = pickSrc(obj[key]);
      if (found) return found;
    }
  }
  return null;
}

/** 相对路径补全成绝对地址；非 http(s) 视为失败 */
function absolute(base: string, src: string): string | null {
  if (src.startsWith('//')) return `https:${src}`;
  if (/^https?:\/\//i.test(src)) return src;
  try {
    const url = new URL(src.startsWith('/') ? src : `/${src}`, `${base}/`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function sanitizeName(name: string, mime: string): string {
  const fallbackExt = (mime.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  const cleaned = (name || '').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(-80);
  if (cleaned && /\.[a-z0-9]{1,5}$/i.test(cleaned)) return cleaned;
  return `${cleaned || 'image'}-${Date.now().toString(36)}.${fallbackExt}`;
}

/**
 * 上传单个文件到图床。
 * 失败时返回语义化 error，便于前端提示：
 *   auth / too_large / bad_type / upstream / timeout / network
 */
export async function uploadToImgbed(config: ImgbedConfig, file: File): Promise<ImgbedResult> {
  const url = new URL(`${config.base}/upload`);
  url.searchParams.set('authCode', config.authCode);
  url.searchParams.set('returnFormat', 'full');
  if (config.channel) url.searchParams.set('uploadChannel', config.channel);
  if (config.folder) url.searchParams.set('uploadFolder', config.folder);

  const body = new FormData();
  const name = sanitizeName(file.name || '', file.type || '');
  body.append('file', file, name);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'POST',
      body,
      headers: { accept: 'application/json' },
      signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(25_000) : undefined,
    });
  } catch (err) {
    const name = (err as { name?: string })?.name || '';
    return { ok: false, error: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network', status: 504 };
  }

  const text = await res.text();

  if (res.status === 401 || res.status === 403) return { ok: false, error: 'auth', status: 502 };
  if (!res.ok) {
    console.error('imgbed_http_error', res.status, text.slice(0, 300));
    return { ok: false, error: 'upstream', status: 502 };
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text.trim();
  }

  const src = pickSrc(payload);
  if (!src) {
    console.error('imgbed_bad_payload', text.slice(0, 300));
    return { ok: false, error: 'upstream', status: 502 };
  }

  const absoluteUrl = absolute(config.base, src);
  if (!absoluteUrl) return { ok: false, error: 'upstream', status: 502 };

  return { ok: true, url: absoluteUrl };
}
