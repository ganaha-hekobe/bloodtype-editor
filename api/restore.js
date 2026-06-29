import { checkPin, mutatePosts, findOpenDay, scheduleAt, nowJst, BLOOD_TYPES } from './_lib.js';

// NG (rejected) の投稿を queue に復活させる。
// 空いている日に入れる (元の予定日が未来かつ空きならそこ、埋まっていれば最寄りの空き日)。
// blood-type-uranai は 4 アカ別 yaml なので blood 指定必須。
// 投稿時刻は固定 00:10 JST (scheduleAt 関数で焼き込み)。
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST のみ' });
  }
  if (!checkPin(req)) {
    return res.status(401).json({ error: 'PINが違います' });
  }
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { blood, id } = payload;
    if (!BLOOD_TYPES.includes(blood)) throw new Error(`不明な blood: ${blood}`);

    let assigned = null;
    await mutatePosts(
      blood,
      (data) => {
        const rejected = data.rejected || [];
        const idx = rejected.findIndex((p) => String(p.id) === String(id));
        if (idx === -1) throw new Error(`id ${id} が NG リスト [${blood}] に見つかりません`);
        const [post] = rejected.splice(idx, 1);
        const prefer = String(post.scheduled_at || '').slice(0, 10);
        const day = findOpenDay(data, prefer);
        if (!day) throw new Error('空いている日が見つかりません (60日先まで満杯)');
        assigned = scheduleAt(day);
        post.scheduled_at = assigned;
        post.status = 'ok';
        delete post.rejected_at;
        post.restored_at = nowJst();
        data.queue = data.queue || [];
        data.queue.push(post);
      },
      `restore(${blood}): ${id} を NG から復活`,
    );
    res.status(200).json({ ok: true, scheduled_at: assigned });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
