import { checkPin, mutatePosts, BLOOD_TYPES } from './_lib.js';

// 指定 entry を queue から削除し、直後に GitHub Actions の generate.yml を
// workflow_dispatch で trigger する。generate.py の analyze_window が missing
// を検出して 1 件だけ再生成する (空き日を残さない)。
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST のみ' });
  if (!checkPin(req)) return res.status(401).json({ error: 'PINが違います' });
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { blood, id } = payload;
    if (!BLOOD_TYPES.includes(blood)) throw new Error(`不明な blood: ${blood}`);
    if (!id) throw new Error('id が必要です');

    await mutatePosts(
      blood,
      (data) => {
        const queue = data.queue || [];
        const idx = queue.findIndex((p) => String(p.id) === String(id));
        if (idx === -1) throw new Error(`id ${id} が queue [${blood}] に見つかりません`);
        queue.splice(idx, 1);
      },
      `regenerate(${blood}): ${id} 削除 → generate.yml で補充予定`,
    );

    const token = process.env.GITHUB_TRIGGER_TOKEN;
    if (!token) {
      return res.status(200).json({
        ok: true,
        warning: '削除は成功、GITHUB_TRIGGER_TOKEN 未設定で今夜 23:00 の cron 補充を待ちます',
      });
    }
    const owner = process.env.GH_OWNER || 'ganaha-hekobe';
    const repo = process.env.GH_REPO || 'bloodtype-today';
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/generate.yml/dispatches`;
    const ghRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'bloodtype-editor',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (!ghRes.ok) {
      const text = await ghRes.text().catch(() => '');
      return res.status(200).json({
        ok: true,
        warning: `削除は成功、generate trigger 失敗 (${ghRes.status}): ${text.slice(0, 200)}`,
      });
    }
    return res.status(200).json({ ok: true, triggered: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
