import type { Ctx } from './types';

export type Handler = (ctx: Ctx) => Promise<Response> | Response;

interface RouteDef {
  method: string;
  pattern: string;
  parts: string[];
  handler: Handler;
}

const routes: RouteDef[] = [];

export function route(method: string, pattern: string, handler: Handler): void {
  routes.push({ method, pattern, parts: pattern.split('/').filter(Boolean), handler });
}

export function get(pattern: string, handler: Handler): void {
  route('GET', pattern, handler);
}

export function post(pattern: string, handler: Handler): void {
  route('POST', pattern, handler);
}

export function dispatch(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
  const segments = pathname.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method) continue;
    if (r.parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < r.parts.length; i++) {
      const part = r.parts[i];
      if (part.startsWith(':')) {
        try {
          params[part.slice(1)] = decodeURIComponent(segments[i]);
        } catch {
          params[part.slice(1)] = segments[i];
        }
      } else if (part !== segments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler: r.handler, params };
  }
  return null;
}
