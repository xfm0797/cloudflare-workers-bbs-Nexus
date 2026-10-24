import type { Env } from './env';
import type { Category, Post, Topic, User } from './lib/types';

export type Locale = 'zh-CN' | 'en-US';

export interface Ctx {
  req: Request;
  env: Env;
  exec: ExecutionContext;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
  form: FormData | null;
  user: User | null;
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  csrf: string;
  siteName: string;
  settings: Record<string, string>;
  unread: number;
  unreadDm?: number;
  flash?: { type: 'ok' | 'error'; text: string } | null;
  html: (body: string, status?: number, init?: ResponseInit) => Response;
  redirect: (path: string, msg?: string, type?: 'ok' | 'error') => Response;
  json: (data: unknown, status?: number) => Response;
}

export interface TopicRow extends Topic {
  category_slug: string;
  category_name: string;
  category_name_en: string | null;
  category_color: string | null;
  author_username: string;
  author_name: string;
  author_avatar: string | null;
  last_poster_username?: string | null;
  last_poster_name?: string | null;
  last_poster_avatar?: string | null;
  /** 搜索结果里命中的片段（已转义，含 <mark> 高亮） */
  search_snippet?: string;
}

export interface PostRow extends Post {
  author_username: string;
  author_name: string;
  author_avatar: string | null;
  author_role: string;
  author_post_count: number;
  author_created_at: number;
  author_bio?: string | null;
  reply_to_username?: string | null;
  liked?: number;
}

export type { Category, Post, Topic, User };
