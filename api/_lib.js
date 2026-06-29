import crypto from 'node:crypto';
import yaml from 'js-yaml';

const OWNER = process.env.GH_OWNER || 'ganaha-hekobe';
const REPO = process.env.GH_REPO || 'bloodtype-today';
const BRANCH = 'main';

export const BLOOD_TYPES = ['a', 'b', 'o', 'ab'];

// posts-{blood}.yaml のファイル名
export function postsFile(blood) {
  return `posts-${blood}.yaml`;
}

export function checkPin(req) {
  const pin = String(req.headers['x-pin'] || '');
  const expected = process.env.EDIT_PIN || '';
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(pin).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bloodtype-editor',
  };
}

export async function ghFetchFile(blood) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${postsFile(blood)}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub 読み込み失敗 [${blood}] (${res.status})`);
  const j = await res.json();
  const text = Buffer.from(j.content, 'base64').toString('utf-8');
  return { text, sha: j.sha };
}

export async function ghPutFile(blood, text, sha, message) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${postsFile(blood)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(text, 'utf-8').toString('base64'),
      sha,
      branch: BRANCH,
    }),
  });
  if (res.status === 409) return { conflict: true };
  if (!res.ok) throw new Error(`GitHub 書き込み失敗 [${blood}] (${res.status})`);
  return { conflict: false };
}

// ファイル先頭のコメントブロック (ヘッダ) を保存時に復元する
export function headerComment(text) {
  const lines = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') lines.push(line);
    else break;
  }
  return lines.length ? lines.join('\n') + '\n' : '';
}

// 編集テキストの正規化: CRLF/nbsp 除去、行末スペース除去、末尾改行除去
export function cleanText(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

export function loadYaml(text) {
  return yaml.load(text, { schema: yaml.JSON_SCHEMA }) || {};
}

export const RETENTION_DAYS = 7;

// rejected の保持期間 (7日) を過ぎたものを物理削除する。書き込みのたびに sweep。
export function purgeExpiredRejected(data, retentionDays = RETENTION_DAYS) {
  const rejected = data.rejected || [];
  if (!rejected.length) return 0;
  const cutoff = Date.now() - retentionDays * 86400000;
  const kept = rejected.filter((p) => {
    const t = Date.parse(`${String(p.rejected_at || '').replace(' ', 'T')}+09:00`);
    return Number.isNaN(t) ? true : t >= cutoff;
  });
  data.rejected = kept;
  return rejected.length - kept.length;
}

/**
 * 全 4 yaml を並列 fetch。
 * Returns: { a: {data, sha, text}, b: {...}, o: {...}, ab: {...} }
 */
export async function ghFetchAll() {
  const results = await Promise.all(
    BLOOD_TYPES.map(async (blood) => {
      const { text, sha } = await ghFetchFile(blood);
      const data = loadYaml(text);
      return [blood, { data, sha, text }];
    }),
  );
  return Object.fromEntries(results);
}

/**
 * 1 つの blood の yaml を read → mutate → write。
 * cron の commit-back と競合したら 1 回だけ再試行。
 * 書き込みのたびに期限切れ rejected を sweep する。
 */
export async function mutatePosts(blood, mutator, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, sha } = await ghFetchFile(blood);
    const data = loadYaml(text);
    purgeExpiredRejected(data);
    mutator(data);
    const body = headerComment(text) + yaml.dump(data, { lineWidth: -1, noRefs: true });
    const result = await ghPutFile(blood, body, sha, message);
    if (!result.conflict) return;
  }
  throw new Error(`保存が競合しました [${blood}]。再読込してやり直してください`);
}

export function nowJst() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

export function jstTodayStr() {
  return nowJst().slice(0, 10);
}

// 'YYYY-MM-DD' に n 日加算
export function addDaysStr(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 復活先の空いている日を返す
export function findOpenDay(data, preferDateStr) {
  const occupied = new Set(
    (data.queue || []).map((p) => String(p.scheduled_at).slice(0, 10)),
  );
  const today = jstTodayStr();
  if (preferDateStr && preferDateStr > today && !occupied.has(preferDateStr)) {
    return preferDateStr;
  }
  for (let i = 1; i <= 60; i += 1) {
    const cand = addDaysStr(today, i);
    if (!occupied.has(cand)) return cand;
  }
  return null;
}

// 投稿時刻 (4 アカ共通の固定値、blood-type-uranai は 00:10 JST)
export const POST_TIME = '00:10:00';
export function scheduleAt(dateStr) {
  return `${dateStr} ${POST_TIME}`;
}
