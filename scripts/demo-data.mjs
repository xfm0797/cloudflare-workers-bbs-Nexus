// 本地演示数据脚本：注册两个用户、发帖、回复、点赞
const BASE = 'http://127.0.0.1:8787';

class Session {
  constructor() {
    this.cookies = new Map();
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  store(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  async get(path) {
    const res = await fetch(BASE + path, { headers: { cookie: this.header() }, redirect: 'manual' });
    this.store(res);
    return { res, html: await res.text() };
  }
  async post(path, data) {
    const body = new URLSearchParams(data).toString();
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: { cookie: this.header(), 'content-type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
    });
    this.store(res);
    return res;
  }
  csrf() {
    return decodeURIComponent(this.cookies.get('bbs_csrf') || '');
  }
}

function tokenFrom(html) {
  return (html.match(/name="_csrf" value="([^"]+)"/) || [])[1] || '';
}

async function login(email, password) {
  const s = new Session();
  const { html } = await s.get('/login');
  const res = await s.post('/login', { _csrf: tokenFrom(html) || s.csrf(), email, password });
  console.log('login', email, res.status);
  return s;
}

async function register(username, email, password) {
  const s = new Session();
  const { html } = await s.get('/register');
  const res = await s.post('/register', {
    _csrf: tokenFrom(html) || s.csrf(),
    username,
    email,
    password,
    password2: password,
  });
  if (res.status !== 302) return login(email, password);
  console.log('register', username, res.status);
  return s;
}

function idOf(location) {
  const m = (location || '').match(/\/t\/(\d+)/);
  return m ? m[1] : '';
}

async function newTopic(s, { title, content, category, tags }) {
  const { html } = await s.get('/new');
  const res = await s.post('/new', {
    _csrf: tokenFrom(html),
    title,
    content,
    category_id: String(category),
    tags: tags || '',
  });
  console.log('topic', title, res.status);
  return idOf(res.headers.get('location'));
}

async function reply(s, topicId, content) {
  const { html } = await s.get(`/t/${topicId}`);
  const res = await s.post(`/t/${topicId}/reply`, { _csrf: tokenFrom(html), content });
  console.log('reply', topicId, res.status, res.headers.get('location'));
}

async function like(s, id, type = 'post') {
  const res = await fetch(BASE + '/api/like', {
    method: 'POST',
    headers: {
      cookie: s.header(),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      'x-csrf-token': s.csrf(),
    },
    body: new URLSearchParams({ type, id: String(id) }).toString(),
  });
  return res.json();
}

const admin = await login('admin@example.com', 'admin12345');
const lin = await register('lin', 'lin@example.com', 'lin12345678');
const kai = await register('kai', 'kai@example.com', 'kai12345678');

const t1 = await newTopic(lin, {
  category: 3,
  tags: 'cloudflare, edge',
  title: '用 Workers + D1 搭一个论坛，到底能省多少运维成本？',
  content: `最近把自建的论坛从一台 2C4G 的 VPS 迁到了 **Cloudflare Workers + D1**，记录一下真实感受。

### 迁移前

- 每月固定成本 ≈ ￥70（VPS + 备份）
- 需要自己配 Nginx、证书续期、数据库备份
- 国内访问延迟 40~80ms，海外用户偶尔 300ms+

### 迁移后

- 成本降到 ￥0 ~ ￥5（免费额度足够小社区）
- 没有服务器需要维护，证书自动签发
- 全球边缘渲染，首字节基本在 \`30ms\` 以内

> 边缘渲染 + 服务端直出，是这套方案体验最好的地方。

一些踩坑记录：

1. D1 的 \`batch()\` 很好用，把「插入回复 + 更新计数」放进一个批次，避免计数漂移
2. 免费版 Worker CPU 只有 10ms，PBKDF2 迭代次数要调低
3. 静态资源交给 Workers Assets，别用 Worker 兜底，能省很多调用次数

\`\`\`ts
const res = await env.DB.batch([
  env.DB.prepare('UPDATE topics SET reply_count = reply_count + 1 WHERE id = ?').bind(id),
  env.DB.prepare('UPDATE users SET post_count = post_count + 1 WHERE id = ?').bind(uid),
]);
\`\`\`

你们现在的社区都跑在什么上面？`,
});

const t2 = await newTopic(kai, {
  category: 2,
  tags: '设计, 前端',
  title: '好看的论坛界面，到底赢在哪几个细节？',
  content: `做了几年社区产品，越来越觉得「好看」不是靠堆动效，而是几个很具体的小事：

- **行高和留白**：正文 \`line-height: 1.75\` 比任何字体都重要
- **层级**：一个页面里最多两个阴影等级，多了就脏
- **暗色模式**：别用纯黑，\`#0a0d13\` 这种带蓝的深色更耐看
- **焦点状态**：键盘用户也需要看见自己在哪
- **空状态**：没有内容的时候，页面也要像「有人住」

最近在做的这套界面把侧栏做成了卡片式，小屏直接折叠到主内容下面，你觉得这个处理怎么样？

![布局示意](https://images.unsplash.com/photo-1551650975-87deedd944c3?w=900&q=60)`,
});

const t3 = await newTopic(admin, {
  category: 1,
  tags: '公告',
  title: '欢迎来到 Nexus：这里是一个新的开始',
  content: `这是一个跑在 Cloudflare 边缘网络上的社区。

### 你可以在这里做什么

- 分享你正在折腾的技术、工具和踩坑
- 提出具体的问题，通常半天内会有人回复
- 找到和你兴趣相投的人

### 几条约定

1. 友善讨论，对事不对人
2. 发帖前先搜索
3. 广告和推广请先联系管理员

有问题可以直接回复这篇帖子。`,
});

await reply(kai, t1, '我们团队也在评估，主要担心 D1 的写入并发。你们现在日活多少？');
await reply(lin, t1, '目前 300 左右，写入压力很小。真到瓶颈可以按板块分库，或者把热数据放 KV。');
await reply(admin, t2, '侧栏折叠这个思路不错，移动端首屏能直接看到内容。');
await reply(lin, t2, '暗色模式那条深有同感，纯黑看久了眼睛很累。');

await like(kai, 1, 'post');
await like(admin, 1, 'post');
await like(admin, 2, 'post');
await like(lin, 5, 'post');

// 浏览量
for (let i = 0; i < 12; i++) await admin.get(`/t/${t1}`);
for (let i = 0; i < 7; i++) await admin.get(`/t/${t2}`);

console.log('demo data ready');
