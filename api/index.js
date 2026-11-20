const origin = 'https://thcs.toanmath.com';
const periods = ['giua-hk1', 'hk1', 'giua-hk2', 'hk2'];
const patterns = [
  [/ước chung lớn nhất|ƯCLN/iu, 'gcd'],
  [/bội chung nhỏ nhất|\bBCNN\b/iu, 'lcm'],
  [/diện tích hình chữ nhật/iu, 'area'],
  [/tỉ số phần trăm|giảm giá|phần trăm/iu, 'percent'],
  [/xác suất thực nghiệm/iu, 'probability'],
  [/quy đồng|cộng hai phân số/iu, 'fraction']
];
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, (_, n) => {
  const point = Number(n);
  return point <= 0x10ffff ? String.fromCodePoint(point) : '';
}).replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const articlePath = /^\/20\d{2}\/\d{2}\/[a-z0-9-]+\.html$/;
export function parseList(html) {
  const matches = html.matchAll(/<h3 class="entry-title mh-posts-grid-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g);
  return Array.from(matches).flatMap(([, link, title]) => {
    const url = new URL(link, origin);
    const name = text(title);
    if (url.origin !== origin || !articlePath.test(url.pathname) || !/\bToán 6\b/i.test(name)) return [];
    return [{ path: url.pathname, title: name, month: url.pathname.slice(1, 8) }];
  }).slice(0, 12);
}
export function parsePatterns(html) {
  const content = html.match(/<div class="entry-content[^"]*"[^>]*>([\s\S]*?)<\/article>/i)?.[1] || '';
  const description = text(content.split(/<iframe|<embed|<object|<script/i)[0]);
  return patterns.filter(([expression]) => expression.test(description)).map(([, id]) => id);
}
async function source(path) {
  const response = await fetch(origin + path, {signal: AbortSignal.timeout(7000), cf: { cacheEverything: true, cacheTtl: 1800 }});
  if (!response.ok) throw new Error('Source unavailable');
  return response.text();
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/dang-nhap') return loginPage(env,url);
    if (url.pathname === '/auth/local') return localLogin(request,env,url);
    if (['/auth/google','/auth/callback','/auth/logout'].includes(url.pathname)) return authRoute(request,env,url);
    if (url.pathname === '/lop-hoc' || url.pathname === '/api/class' || url.pathname.startsWith('/api/class/')) {
      try { return await classroom(request, env, url); }
      catch { return classJson({error:'Chưa truy cập được dữ liệu lớp học.'},500); }
    }
    try {
      if (url.pathname === '/api/original-pdf') return await originalPdf(request,url);
      if (url.pathname === '/api/exams') {
        const period = url.searchParams.get('period');
        if (!periods.includes(period)) return new Response('Invalid period', {status: 400});
        const items = parseList(await source('/de-thi-' + period + '-toan-6'));
        if (!items.length) throw new Error('No entries found');
        return Response.json({items, checkedAt: new Date().toISOString()});
      }
      if (url.pathname === '/api/patterns') {
        const path = url.searchParams.get('path') || '';
        if (!articlePath.test(path) || !path.includes('toan-6')) return new Response('Invalid source', {status: 400});
        return Response.json({patterns: parsePatterns(await source(path))});
      }
    } catch {
      return Response.json({error: 'Nguồn đề tạm thời chưa phản hồi.'}, {status: 502});
    }
    if (url.pathname !== '/') return new Response('Not found', {status: 404});
    return new Response(PAGE, {headers: {'content-type': 'text/html; charset=utf-8'}});
  }
};


