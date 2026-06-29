// ローカル検証用モックサーバー(GitHub 不要・書き込みはメモリ内のみ)
//   node dev-server.mjs → http://127.0.0.1:8990/  PIN は何でも通る
// 本番の api/ とは別物。UI の動作確認専用。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import yaml from 'js-yaml';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const text = fs.readFileSync(path.join(HERE, '..', 'posts.yaml'), 'utf-8');
const data = yaml.load(text, { schema: yaml.JSON_SCHEMA });
data.rejected = data.rejected || [];

// 本番 _lib.js のミニ版(検証用)
const jstToday = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 10);
const addDaysStr = (ds, n) => { const d = new Date(`${ds}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function findOpenDay(prefer) {
  const occ = new Set((data.queue || []).map((p) => String(p.scheduled_at).slice(0, 10)));
  const today = jstToday();
  if (prefer && prefer > today && !occ.has(prefer)) return prefer;
  for (let i = 1; i <= 60; i += 1) { const c = addDaysStr(today, i); if (!occ.has(c)) return c; }
  return null;
}
function jittered(ds) { const m = 21 * 60 + Math.floor(Math.random() * 121); return `${ds} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`; }
function purgeExpired() {
  const cutoff = Date.now() - 7 * 86400000;
  data.rejected = (data.rejected || []).filter((p) => { const t = Date.parse(`${String(p.rejected_at || '').replace(' ', 'T')}+09:00`); return Number.isNaN(t) ? true : t >= cutoff; });
}

const MIME = { '.html': 'text/html', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  const send = (code, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type });
    res.end(body);
  };
  if (req.method === 'GET') {
    const file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const fp = path.join(HERE, file);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      return send(200, fs.readFileSync(fp), MIME[path.extname(fp)] || 'text/plain');
    }
    if (file === '/api/load') {
      return send(200, JSON.stringify({
        queue: data.queue, rejected: data.rejected,
        archive: (data.archive || []).slice(-10), archiveTotal: (data.archive || []).length,
      }));
    }
    return send(404, 'not found', 'text/plain');
  }
  if (req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const p = JSON.parse(body || '{}');
    if (req.url === '/api/load') return send(200, JSON.stringify({ queue: data.queue, rejected: data.rejected, archive: [], archiveTotal: 0 }));
    if (req.url === '/api/save') {
      const post = data.queue.find((x) => String(x.id) === String(p.id));
      if (!post) return send(200, JSON.stringify({ ok: false, error: 'not found' }));
      if (p.content != null) post.content = p.content;
      if (p.tweets) post.tweets = p.tweets;
      if (p.scheduled_at) post.scheduled_at = p.scheduled_at;
      return send(200, JSON.stringify({ ok: true }));
    }
    if (req.url === '/api/review') {
      const idx = data.queue.findIndex((x) => String(x.id) === String(p.id));
      if (idx === -1) return send(200, JSON.stringify({ ok: false, error: 'not found' }));
      if (p.tweets) data.queue[idx].tweets = p.tweets;
      else if (p.content != null) data.queue[idx].content = p.content;
      if (p.verdict === 'ok') data.queue[idx].status = 'ok';
      else { const [post] = data.queue.splice(idx, 1); post.status = 'ng'; post.rejected_at = post.rejected_at || new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }); data.rejected.push(post); }
      purgeExpired();
      return send(200, JSON.stringify({ ok: true }));
    }
    if (req.url === '/api/restore') {
      purgeExpired();
      const idx = (data.rejected || []).findIndex((x) => String(x.id) === String(p.id));
      if (idx === -1) return send(200, JSON.stringify({ ok: false, error: 'not found' }));
      const [post] = data.rejected.splice(idx, 1);
      const day = findOpenDay(String(post.scheduled_at || '').slice(0, 10));
      if (!day) return send(200, JSON.stringify({ ok: false, error: 'no open day' }));
      const assigned = jittered(day);
      post.scheduled_at = assigned; post.status = 'ok'; delete post.rejected_at; post.restored_at = jstToday();
      data.queue.push(post);
      return send(200, JSON.stringify({ ok: true, scheduled_at: assigned }));
    }
    return send(404, 'not found', 'text/plain');
  }
  send(405, 'no', 'text/plain');
});

server.listen(8990, '127.0.0.1', () => console.log('mock: http://127.0.0.1:8990/'));
