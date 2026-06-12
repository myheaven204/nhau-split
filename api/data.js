const OWNER = process.env.GITHUB_OWNER || 'myheaven204';
const REPO = process.env.GITHUB_REPO || 'nhau-split';
const BRANCH = process.env.GITHUB_BRANCH || 'master';
const FILE_PATH = process.env.GITHUB_DATA_PATH || 'data/db.json';
const emptyData = { people: [], sessions: [] };

const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;

function jsonHeaders(extra = {}) {
  return {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };
}

function encodeBase64(value) {
  return Buffer.from(JSON.stringify(value, null, 2), 'utf8').toString('base64');
}

function decodeBase64(value) {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

async function getFile(token) {
  const res = await fetch(`${apiUrl}?ref=${BRANCH}`, {
    headers: jsonHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  if (res.status === 404) return { data: emptyData, sha: null };
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const payload = await res.json();
  return { data: decodeBase64(payload.content), sha: payload.sha };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const { data } = await getFile(process.env.GITHUB_TOKEN);
      return res.status(200).json(data || emptyData);
    } catch (error) {
      return res.status(500).json({ error: 'Không đọc được dữ liệu GitHub', detail: error.message });
    }
  }

  if (req.method === 'POST') {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const githubToken = process.env.GITHUB_TOKEN;
    const providedPassword = req.headers['x-admin-password'];

    if (!adminPassword) return res.status(500).json({ error: 'Chưa cấu hình ADMIN_PASSWORD trên Vercel' });
    if (!githubToken) return res.status(500).json({ error: 'Chưa cấu hình GITHUB_TOKEN trên Vercel' });
    if (!providedPassword || providedPassword !== adminPassword) return res.status(401).json({ error: 'Sai mật khẩu admin' });

    try {
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!data || !Array.isArray(data.people) || !Array.isArray(data.sessions)) {
        return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
      }

      const { sha } = await getFile(githubToken);
      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: jsonHeaders({ Authorization: `Bearer ${githubToken}`, 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message: 'Update Nhau Split data',
          content: encodeBase64(data),
          sha: sha || undefined,
          branch: BRANCH,
        }),
      });
      if (!putRes.ok) throw new Error(`GitHub write failed: ${putRes.status} ${await putRes.text()}`);
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: 'Không lưu được dữ liệu GitHub', detail: error.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
