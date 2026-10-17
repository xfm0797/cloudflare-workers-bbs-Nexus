-- 初始板块。可重复执行（INSERT OR IGNORE）。
INSERT OR IGNORE INTO categories (slug, name, name_en, description, description_en, icon, color, position, admin_only, created_at)
VALUES
  ('announcements', '站点公告', 'Announcements', '产品更新、规则与重要通知', 'Updates, rules and important notices', 'megaphone', '#f97316', 1, 1, unixepoch() * 1000),
  ('general', '综合讨论', 'General', '什么都聊，从日常到脑洞', 'Anything and everything', 'chat', '#6366f1', 2, 0, unixepoch() * 1000),
  ('tech', '技术分享', 'Technology', '编程、架构、工具与踩坑记录', 'Code, architecture, tools and war stories', 'code', '#0ea5e9', 3, 0, unixepoch() * 1000),
  ('help', '问答求助', 'Help & Support', '遇到问题？在这里发问', 'Stuck? Ask here', 'lifebuoy', '#10b981', 4, 0, unixepoch() * 1000),
  ('resources', '资源分享', 'Resources', '教程、素材、书单与工具箱', 'Tutorials, assets and toolkits', 'box', '#a855f7', 5, 0, unixepoch() * 1000),
  ('lounge', '灌水闲聊', "Off-topic", '轻松一点，随便聊聊', 'Relax and chat about nothing', 'coffee', '#ec4899', 6, 0, unixepoch() * 1000);
