-- ===========================================================================
-- FTS5 全文索引
--
-- 设计要点：
-- 1. trigram 分词器：不依赖分词词典，中英文都按子串匹配（查询词需 >= 3 字符，
--    更短的查询由应用层回退到 LIKE）；
-- 2. rowid 约定：主题 = topics.id * 2，回复 = posts.id * 2 + 1，便于触发器精确定位；
-- 3. kind / topic_id / ref_id 用 UNINDEXED 存在索引表里，查询一次即可拿到归属主题，
--    不必再靠 rowid 反推；bm25 只对 title / body 两列加权。
-- ===========================================================================

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  title,
  body,
  kind UNINDEXED,
  topic_id UNINDEXED,
  ref_id UNINDEXED,
  tokenize = 'trigram'
);

-- 主题：新增 / 内容变化 / 软删除都同步
CREATE TRIGGER IF NOT EXISTS topics_fts_ai AFTER INSERT ON topics BEGIN
  INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
  VALUES (
    new.id * 2,
    new.title,
    coalesce(new.excerpt, '') || ' ' || coalesce(new.tags, ''),
    'topic',
    new.id,
    new.id
  );
END;

-- 主题：内容变化 / 软删除 / 恢复时，整主题（含所有回复）重建索引
CREATE TRIGGER IF NOT EXISTS topics_fts_au AFTER UPDATE OF title, excerpt, tags, is_deleted ON topics BEGIN
  DELETE FROM search_index WHERE topic_id = new.id;
  INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
  SELECT
    new.id * 2,
    new.title,
    coalesce(new.excerpt, '') || ' ' || coalesce(new.tags, ''),
    'topic',
    new.id,
    new.id
  WHERE new.is_deleted = 0;
  INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
  SELECT p.id * 2 + 1, '', p.content, 'post', p.topic_id, p.id
  FROM posts p
  WHERE p.topic_id = new.id AND p.is_deleted = 0 AND new.is_deleted = 0;
END;

CREATE TRIGGER IF NOT EXISTS topics_fts_ad AFTER DELETE ON topics BEGIN
  DELETE FROM search_index WHERE topic_id = old.id;
END;

-- 回复：正文全文入索引
CREATE TRIGGER IF NOT EXISTS posts_fts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
  VALUES (new.id * 2 + 1, '', new.content, 'post', new.topic_id, new.id);
END;

CREATE TRIGGER IF NOT EXISTS posts_fts_au AFTER UPDATE OF content, is_deleted, topic_id ON posts BEGIN
  DELETE FROM search_index WHERE rowid = new.id * 2 + 1;
  INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
  SELECT new.id * 2 + 1, '', new.content, 'post', new.topic_id, new.id
  WHERE new.is_deleted = 0;
END;

CREATE TRIGGER IF NOT EXISTS posts_fts_ad AFTER DELETE ON posts BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 2 + 1;
END;

-- 回填历史数据（迁移只执行一次；先清空保证可重复执行）
DELETE FROM search_index;

INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
SELECT id * 2, title, coalesce(excerpt, '') || ' ' || coalesce(tags, ''), 'topic', id, id
FROM topics
WHERE is_deleted = 0;

INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
SELECT id * 2 + 1, '', content, 'post', topic_id, id
FROM posts
WHERE is_deleted = 0;
