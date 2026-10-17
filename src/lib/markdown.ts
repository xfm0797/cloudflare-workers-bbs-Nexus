import { escapeHtml } from './utils';

/**
 * 轻量 Markdown 渲染器（安全优先）
 * 支持：标题 / 加粗 / 斜体 / 删除线 / 行内代码 / 代码块 / 链接 / 图片 / 引用 / 有序无序列表 / 分割线 / @提及 / 自动链接
 * 策略：先整体 HTML 转义，再生成标签，杜绝 XSS；仅允许 http(s) 与站内链接。
 */

function safeUrl(raw: string): string {
  const url = raw.replace(/&amp;/g, '&').replace(/[\s"'<>`]/g, '');
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url;
  return '#';
}

function inline(text: string): string {
  let s = text;

  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    return `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy" decoding="async" />`;
  });

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const href = safeUrl(url);
    const external = /^https?:\/\//i.test(href);
    return `<a href="${href}"${external ? ' target="_blank" rel="nofollow noopener noreferrer"' : ''}>${label}</a>`;
  });

  // 自动链接（避免匹配已有 href 内的地址）
  s = s.replace(/(?<!["'=])(https?:\/\/[^\s<>"'）)]+)/g, '<a href="$1" target="_blank" rel="nofollow noopener noreferrer">$1</a>');

  // @提及
  s = s.replace(/(^|[\s(（,，])@([\p{L}\p{N}_]{2,20})/gu, '$1<a class="mention" href="/u/$2">@$2</a>');

  s = s.replace(/\n/g, '<br />');
  return s;
}

export function renderMarkdown(input: string): string {
  if (!input) return '';
  let text = input.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').slice(0, 60000);

  const codeBlocks: string[] = [];
  text = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const idx = codeBlocks.push(`<pre class="code-block" data-lang="${escapeHtml(lang.trim())}"><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`) - 1;
    return `\n@@CB${idx}@@\n`;
  });

  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const idx = inlineCodes.push(`<code class="inline-code">${escapeHtml(code)}</code>`) - 1;
    return `@@IC${idx}@@`;
  });

  const escaped = escapeHtml(text);
  const lines = escaped.split('\n');
  const out: string[] = [];

  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join('\n'))}</p>`);
      paragraph = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${inline(quote.join('\n'))}</blockquote>`);
      quote = [];
    }
  };
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${list.items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      list = null;
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    const cb = line.match(/^@@CB(\d+)@@$/);
    if (cb) {
      flushAll();
      out.push(codeBlocks[Number(cb[1])] ?? '');
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length + 1; // h2 ~ h5
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(?:---+|\*\*\*+|___+)$/.test(line.trim())) {
      flushAll();
      out.push('<hr />');
      continue;
    }

    const quoted = line.match(/^&gt;\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      continue;
    }

    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      flushParagraph();
      flushQuote();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      flushParagraph();
      flushQuote();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }

    flushQuote();
    flushList();
    paragraph.push(line);
  }
  flushAll();

  let html = out.join('\n');
  html = html.replace(/@@IC(\d+)@@/g, (_m, i: string) => inlineCodes[Number(i)] ?? '');
  return html;
}

/** 从 Markdown 中提取 @提及 的用户名 */
export function extractMentions(input: string): string[] {
  const set = new Set<string>();
  const re = /(?:^|[\s(（,，])@([\p{L}\p{N}_]{2,20})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) set.add(m[1]);
  return [...set].slice(0, 10);
}
