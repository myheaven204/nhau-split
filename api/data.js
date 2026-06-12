import { kv } from '@vercel/kv';

const DATA_KEY = 'nhau-split:data:v1';
const emptyData = { people: [], sessions: [] };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const data = (await kv.get(DATA_KEY)) || emptyData;
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Không đọc được dữ liệu cloud', detail: error.message });
    }
  }

  if (req.method === 'POST') {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const providedPassword = req.headers['x-admin-password'];

    if (!adminPassword) {
      return res.status(500).json({ error: 'Chưa cấu hình ADMIN_PASSWORD trên Vercel' });
    }
    if (!providedPassword || providedPassword !== adminPassword) {
      return res.status(401).json({ error: 'Sai mật khẩu admin' });
    }

    try {
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!data || !Array.isArray(data.people) || !Array.isArray(data.sessions)) {
        return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
      }
      await kv.set(DATA_KEY, data);
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: 'Không lưu được dữ liệu cloud', detail: error.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
