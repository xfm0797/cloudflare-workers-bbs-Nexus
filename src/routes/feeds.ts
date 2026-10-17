import { get } from '../router';
import { getCategories, listTopics } from '../lib/db';
import { categoryName, siteTagline } from '../lib/i18n';

function xmlEscape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

get('/feed.xml', async (ctx) => {
  const { topics } = await listTopics(ctx.env, { sort: 'latest', perPage: 30 });
  const origin = ctx.url.origin;
  const items = topics
    .map(
      (t) => `    <item>
      <title>${xmlEscape(t.title)}</title>
      <link>${origin}/t/${t.id}</link>
      <guid isPermaLink="true">${origin}/t/${t.id}</guid>
      <pubDate>${new Date(t.created_at).toUTCString()}</pubDate>
      <description>${xmlEscape(t.excerpt || '')}</description>
      <author>${xmlEscape(t.author_name)}</author>
      <category>${xmlEscape(categoryName({ name: t.category_name, name_en: t.category_name_en }, ctx.locale))}</category>
    </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(ctx.siteName)}</title>
    <link>${origin}/</link>
    <atom:link href="${origin}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${xmlEscape(siteTagline(ctx))}</description>
    <language>${ctx.locale}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
});

get('/sitemap.xml', async (ctx) => {
  const origin = ctx.url.origin;
  const [categories, latest] = await Promise.all([
    getCategories(ctx.env),
    listTopics(ctx.env, { sort: 'latest', perPage: 200 }),
  ]);

  const urls = [
    `<url><loc>${origin}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${origin}/categories</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`,
    ...categories.map(
      (c) => `<url><loc>${origin}/c/${c.slug}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`,
    ),
    ...latest.topics.map(
      (t) =>
        `<url><loc>${origin}/t/${t.id}</loc><lastmod>${new Date(t.last_post_at).toISOString()}</lastmod><priority>0.8</priority></url>`,
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' },
  });
});

get('/robots.txt', (ctx) => {
  // 明确拒绝的 AI 训练 / 商业采集爬虫（应用层同样会直接 403，这里是双保险）
  const blockedBots = [
    'GPTBot',
    'ChatGPT-User',
    'OAI-SearchBot',
    'CCBot',
    'ClaudeBot',
    'anthropic-ai',
    'Google-Extended',
    'Bytespider',
    'Amazonbot',
    'Applebot-Extended',
    'meta-externalagent',
    'PerplexityBot',
    'Diffbot',
    'omgili',
    'Timpibot',
    'ImagesiftBot',
    'cohere-ai',
    'AhrefsBot',
    'SemrushBot',
    'MJ12bot',
    'DotBot',
    'DataForSeoBot',
    'BLEXBot',
    'SeznamBot',
    'PetalBot',
    'YisouSpider',
    'Scrapy',
  ];
  const blocked = blockedBots.map((bot) => `User-agent: ${bot}\nDisallow: /\n`).join('\n');

  const body = `# 搜索引擎
User-agent: *
Allow: /
Disallow: /admin
Disallow: /settings
Disallow: /api/
Disallow: /search
Disallow: /new
Disallow: /notifications
Disallow: /bookmarks
Disallow: /login
Disallow: /register

# AI 训练 / 商业采集爬虫
${blocked}
Sitemap: ${ctx.url.origin}/sitemap.xml
`;
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });
});
