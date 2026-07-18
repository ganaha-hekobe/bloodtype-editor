import { checkPin, mutatePosts, nowJst, cleanText, BLOOD_TYPES } from './_lib.js';

// 編集室の判定/予約反映 endpoint。
//   verdict: 'ok'       → queue に残したまま status: ok (旧:bot 投稿される)
//   verdict: 'ng'       → queue から rejected へ移動 (投稿されない)
//   verdict: 'reserved' → ★queue から archive へ移動★ (★凹兵衛さんが X 純正予約投稿済★を mark、
//                          以降この entry は editor の queue view に表示されない)
//   verdict: 'unreserve' → ★archive から queue へ戻す★ (誤操作復旧用)
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
    const validVerdicts = ['ok', 'ng', 'reserved', 'unreserve', 'rewrite_request', 'unrewrite_request'];
    if (!validVerdicts.includes(verdict)) throw new Error(`不明な verdict: ${verdict}`);

    await mutatePosts(
      blood,
      (data) => {
        if (verdict === 'unreserve') {
          const archive = data.archive || [];
          const idx = archive.findIndex((p) => String(p.id) === String(id));
          if (idx === -1) throw new Error(`id ${id} が archive [${blood}] に見つかりません`);
          const [post] = archive.splice(idx, 1);
          delete post.reserved_at;
          data.queue = data.queue || [];
          data.queue.push(post);
          // scheduled_at 順に並び替え
          data.queue.sort((a, b) => String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || '')));
          return;
        }
        const queue = data.queue || [];
        const idx = queue.findIndex((p) => String(p.id) === String(id));
        if (idx === -1) throw new Error(`id ${id} が queue [${blood}] に見つかりません`);
        if (typeof payload.content === 'string') {
          queue[idx].content = cleanText(payload.content);
        }
        if (verdict === 'ok') {
          queue[idx].status = 'ok';
          queue[idx].reviewed_at = nowJst();
        } else if (verdict === 'ng') {
          const [post] = queue.splice(idx, 1);
          post.status = 'ng';
          post.rejected_at = nowJst();
          data.rejected = data.rejected || [];
          data.rejected.push(post);
        } else if (verdict === 'reserved') {
          const [post] = queue.splice(idx, 1);
          post.reserved_at = nowJst();
          data.archive = data.archive || [];
          data.archive.push(post);
        } else if (verdict === 'rewrite_request') {
          // ★書き直し依頼: queue に残したまま flag 立て★ (朝ブリーフィングで私が回収)
          queue[idx].rewrite_requested = true;
          queue[idx].rewrite_requested_at = nowJst();
        } else if (verdict === 'unrewrite_request') {
          delete queue[idx].rewrite_requested;
          delete queue[idx].rewrite_requested_at;
        }
      },
      `review(${blood}): ${id} → ${verdict}`,
    );
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
