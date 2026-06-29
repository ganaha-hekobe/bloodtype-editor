import { checkPin, ghFetchAll, BLOOD_TYPES } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!checkPin(req)) {
    return res.status(401).json({ error: 'PINが違います' });
  }

  try {
    const all = await ghFetchAll();
    const payload = {};
    for (const blood of BLOOD_TYPES) {
      payload[blood] = {
        queue: all[blood].data.queue || [],
        archive: all[blood].data.archive || [],
        rejected: all[blood].data.rejected || [],
        sha: all[blood].sha,
      };
    }
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
