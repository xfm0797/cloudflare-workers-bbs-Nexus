// 重建全文索引
//
// 迁移 0003 已经回填历史数据，日常写入由 topics/posts 触发器维护；
// 这个脚本用于：手工批量导入数据后、触发器被误删后、或怀疑索引不一致时重建。
//
// 用法：
//   npm run search:reindex            # 本地
//   npm run search:reindex -- --remote # 线上

import { execFileSync } from 'node:child_process';

const remote = process.argv.includes('--remote');

const SQL = `DELETE FROM search_index;
INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
SELECT id * 2, title, coalesce(excerpt, '') || ' ' || coalesce(tags, ''), 'topic', id, id
FROM topics WHERE is_deleted = 0;
INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
SELECT id * 2 + 1, '', content, 'post', topic_id, id
FROM posts WHERE is_deleted = 0;`;

console.log(`重建全文索引（${remote ? '线上 remote' : '本地 local'}）…`);
execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'cf-bbs', remote ? '--remote' : '--local', '--yes', '--command', SQL],
  { stdio: 'inherit', shell: true },
);
console.log('完成。');
