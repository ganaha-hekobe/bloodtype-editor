import { checkPin, mutatePosts, BLOOD_TYPES, cleanText } from './_lib.js';

/**
 * リクエストボディ:
 * {
 *   "a": { "id": "bt-A-2026-06-30", "content": "新本文..." },
 *   "b": { ... },
 *   ...
 * }
 * 変更があった blood のみ含む (部分更新可)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST のみ' });
  }
  if (!checkPin(req)) {
    return res.status(401).json({ error: 'PINが違います' });
  }

  const updates = req.body || {};
  const targetBloods = Object.keys(updates).filter((b) => BLOOD_TYPES.includes(b));
  if (!targetBloods.length) {
    return res.status(400).json({ error: 'No updates provided' });
  }

  const saved = [];
  const errors = [];
  await Promise.all(
    targetBloods.map(async (blood) => {
      try {
        const { id, content } = updates[blood];
        if (!id || typeof content !== 'string') {
          throw new Error('id and content required');
        }
        const newContent = cleanText(content);
        await mutatePosts(
          blood,
          (data) => {
            const post = (data.queue || []).find((p) => String(p.id) === String(id));
            if (!post) throw new Error(`entry not found in queue: ${id}`);
            post.content = newContent;
          },
          `edit(${blood}): ${id} 本文修正`,
        );
        saved.push(blood);
      } catch (err) {
        errors.push({ blood, error: String(err.message || err) });
      }
    }),
  );

  if (errors.length) {
    return res.status(207).json({ saved, errors });
  }
  return res.status(200).json({ saved });
}
