import type { Env } from '../env';
import type { TopicRow } from '../types';
import { all, first, getTopicsByIds } from './db';
import { escapeHtml } from './utils';

/**
 * 全文搜索
 *
 * 首选 FTS5（migrations/0003_search_fts.sql 的 search_index，trigram 分词）。
 * trigram 要求查询词 >= 3 个字符，中文两字词、单字查询会自动回退到 LIKE，
 * 索引异常（例如迁移未执行）时同样回退，保证搜索永远有结果而不是 500。
 */

export interface SearchResult {
  topics: TopicRow[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  /** fts = 相关度排序；like = 兜底模糊匹配 */
  mode: 'fts' | 'like';
  tookMs: number;
}

const MARK_START = '\u0001';
const MARK_END = '\u0002';
const FTS_ROW_LIMIT = 500;

export function buildMatchQuery(query: string): string | null {
  const terms = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!terms.length) return null;
  // trigram 分词器无法处理短于 3 字符的词，交给 LIKE 兜底
  if (terms.some((t) => Array.from(t).length < 3)) return null;
  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' ');
}

/** 把 FTS 的 snippet 转成安全 HTML：先转义，再把标记换成 <mark> */
export function formatSnippet(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return escapeHtml(cleaned).split(MARK_START).join('<mark>').split(MARK_END).join('</mark>');
}

function emptyResult(page: number, perPage: number, mode: 'fts' | 'like', tookMs: number): SearchResult {
  return { topics: [], total: 0, page, perPage, totalPages: 1, mode, tookMs };
}

export async function searchTopics(
  env: Env,
  rawQuery: string,
  opts: { page?: number; perPage?: number } = {},
): Promise<SearchResult> {
  const query = (rawQuery || '').trim().slice(0, 80);
  const page = Math.max(1, opts.page || 1);
  const perPage = Math.min(Math.max(opts.perPage || 20, 1), 50);
  const started = Date.now();

  if (!query) return emptyResult(page, perPage, 'fts', 0);

  const match = buildMatchQuery(query);
  if (match) {
    try {
      const rows = await all<{ topic_id: number; score: number; snip: string }>(
        env,
        `SELECT topic_id,
                bm25(search_index, 8.0, 1.0) AS score,
                snippet(search_index, 1, ?, ?, '…', 18) AS snip
           FROM search_index
          WHERE search_index MATCH ?
            AND topic_id IN (SELECT id FROM topics WHERE is_deleted = 0)
          ORDER BY score ASC
          LIMIT ?`,
        MARK_START,
        MARK_END,
        match,
        FTS_ROW_LIMIT,
      );

      if (rows.length) {
        // 同一主题的多条回复命中只保留得分最高的一条
        const best = new Map<number, { score: number; snip: string }>();
        for (const row of rows) {
          const topicId = Number(row.topic_id);
          if (!topicId) continue;
          const current = best.get(topicId);
          if (!current || row.score < current.score) best.set(topicId, { score: row.score, snip: row.snip });
        }

        const ids = [...best.entries()].sort((a, b) => a[1].score - b[1].score).map(([id]) => id);
        const topics = await getTopicsByIds(env, ids);

        const countRow = await first<{ n: number }>(
          env,
          `SELECT COUNT(DISTINCT topic_id) AS n FROM search_index
            WHERE search_index MATCH ?
              AND topic_id IN (SELECT id FROM topics WHERE is_deleted = 0)`,
          match,
        );
        const total = countRow?.n ?? topics.length;
        const slice = topics.slice((page - 1) * perPage, page * perPage);

        return {
          // 命中在标题上时 snippet 会给出一段无高亮的正文开头，这类片段直接丢弃，
          // 交给标题高亮 + 摘要展示更清楚
          topics: slice.map((t) => {
            const raw = best.get(t.id)?.snip || '';
            return { ...t, search_snippet: raw.includes(MARK_START) ? formatSnippet(raw) : '' };
          }),
          total,
          page,
          perPage,
          totalPages: Math.max(1, Math.ceil(total / perPage)),
          mode: 'fts',
          tookMs: Date.now() - started,
        };
      }
    } catch (err) {
      console.error('fts_search_failed', err);
    }
  }

  return likeSearch(env, query, page, perPage, started);
}

async function likeSearch(
  env: Env,
  query: string,
  page: number,
  perPage: number,
  started: number,
): Promise<SearchResult> {
  // 多词时按 AND 组合，词内对标题/摘要/标签/正文做 OR
  const terms = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);
  const clause = `(t.title LIKE ? ESCAPE '\\' OR t.excerpt LIKE ? ESCAPE '\\'
        OR t.tags LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')`;
  const where = `FROM topics t
      LEFT JOIN posts p ON p.topic_id = t.id AND p.is_deleted = 0
     WHERE t.is_deleted = 0
       AND ${terms.map(() => clause).join(' AND ')}`;
  const params = terms.flatMap((term) => {
    const pattern = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    return [pattern, pattern, pattern, pattern];
  });

  const [rows, countRow] = await Promise.all([
    all<{ id: number }>(
      env,
      `SELECT t.id AS id, MAX(t.last_post_at) AS ts ${where} GROUP BY t.id ORDER BY ts DESC LIMIT ? OFFSET ?`,
      ...params,
      perPage,
      (page - 1) * perPage,
    ),
    first<{ n: number }>(env, `SELECT COUNT(DISTINCT t.id) AS n ${where}`, ...params),
  ]);

  const ids = rows.map((r) => Number(r.id));
  const topics = await getTopicsByIds(env, ids);
  const total = countRow?.n ?? topics.length;

  return {
    topics,
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    mode: 'like',
    tookMs: Date.now() - started,
  };
}
