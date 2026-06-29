import { checkPin, mutatePosts, nowJst, cleanText, BLOOD_TYPES } from './_lib.js';

// スワイプレビューの結果を反映する。
//   verdict: 'ok' → queue に残したまま status: ok (投稿される)
//   verdict: 'ng' → queue から rejected へ移動 (投稿されない、generate.py が
//                    同テーマ回避 + 補充の材料に)
//   content が同梱されていたら、判定と同時に本文編集も反映 (その場編集)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST のみ' });
  }
  if (!checkPin(req)) {
    return res.status(401).json({ error: 'PINが違います' });
  }
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { blood, id, verdict } = payload;
    if (!BLOOD_TYPES.includes(blood)) throw new Error(`不明な blood: ${blood}`);
    if (verdict !== 'ok' && verdict !== 'ng') throw new Error(`不明な verdict: ${verdict}`);

    await mutatePosts(
      blood,
      (data) => {
        const queue = data.queue || [];
        const idx = queue.findIndex((p) => String(p.id) === String(id));
        if (idx === -1) throw new Error(`id ${id} が queue [${blood}] に見つかりません`);
        if (typeof payload.content === 'string') {
          queue[idx].content = cleanText(payload.content);
        }
        if (verdict === 'ok') {
          queue[idx].status = 'ok';
          queue[idx].reviewed_at = nowJst();
        } else {
          const [post] = queue.splice(idx, 1);
          post.status = 'ng';
          post.rejected_at = nowJst();
          data.rejected = data.rejected || [];
          data.rejected.push(post);
        }
      },
      `review(${blood}): ${id} を ${verdict === 'ok' ? '良い' : 'NG'} 判定`,
    );
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
