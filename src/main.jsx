import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Plus, Trash2, Users, CalendarDays, ReceiptText, Copy, UserPlus, Coins, Trophy } from 'lucide-react';
import './styles.css';

const PEOPLE_KEY = 'nhau-split.people.v1';
const SESSIONS_KEY = 'nhau-split.sessions.v1';
const DEFAULT_PEOPLE = ['Duy', 'Hải', 'Tú', 'Nam', 'Khoa'];

const today = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const id = () => crypto.randomUUID?.() || String(Date.now() + Math.random());
const money = (n) => {
  const value = Number(n || 0);
  if (!value) return '0K';
  const k = value / 1000;
  const rounded = Number.isInteger(k) ? k : Math.round(k * 10) / 10;
  return `${rounded.toLocaleString('vi-VN')}K`;
};
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

function App() {
  const [people, setPeople] = useState(() => load(PEOPLE_KEY, DEFAULT_PEOPLE));
  const [sessions, setSessions] = useState(() => load(SESSIONS_KEY, []));
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [amountText, setAmountText] = useState('');
  const [selected, setSelected] = useState([]);
  const [newPerson, setNewPerson] = useState('');
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('nhau-split-admin') === '1');
  const [adminPassword, setAdminPassword] = useState(() => sessionStorage.getItem('nhau-split-password') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [cloudStatus, setCloudStatus] = useState('local');
  const canEdit = isAdmin;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/data')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('no cloud')))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.people) && data.people.length) {
          setPeople(data.people);
          save(PEOPLE_KEY, data.people);
        }
        if (Array.isArray(data.sessions)) {
          setSessions(data.sessions);
          save(SESSIONS_KEY, data.sessions);
        }
        setCloudStatus('cloud-loaded');
      })
      .catch(() => setCloudStatus('local'));
    return () => { cancelled = true; };
  }, []);

  const totalK = Number(amountText.replace(/[^0-9]/g, '')) || 0;
  const total = totalK * 1000;
  const perPerson = selected.length ? Math.round(total / selected.length) : 0;

  const stats = useMemo(() => {
    const totalAmount = sessions.reduce((s, x) => s + x.totalAmount, 0);
    const totalCount = sessions.length;
    const totalShares = sessions.reduce((s, x) => s + x.participants.length, 0);
    return { totalAmount, totalCount, totalShares };
  }, [sessions]);

  const personTotals = useMemo(() => {
    const map = new Map(people.map((name) => [name, { name, total: 0, count: 0 }]));
    sessions.forEach((session) => {
      session.participants.forEach((name) => {
        const row = map.get(name) || { name, total: 0, count: 0 };
        row.total += session.perPerson;
        row.count += 1;
        map.set(name, row);
      });
    });
    return [...map.values()]
      .filter((person) => person.total > 0 || person.count > 0)
      .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }, [people, sessions]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const dateCompare = (b.date || '').localeCompare(a.date || '');
      if (dateCompare) return dateCompare;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [sessions]);

  const sessionsByPerson = useMemo(() => {
    const map = new Map();
    personTotals.forEach((person) => {
      map.set(person.name, sortedSessions.filter((session) => session.participants.includes(person.name)));
    });
    return map;
  }, [personTotals, sortedSessions]);

  const monthlyDrinkers = useMemo(() => {
    const colors = ['#f97316', '#facc15', '#22c55e', '#38bdf8', '#a78bfa', '#fb7185', '#14b8a6', '#e879f9'];
    const map = new Map();
    sessions.forEach((session) => {
      session.participants.forEach((name) => {
        const row = map.get(name) || { name, count: 0 };
        row.count += 1;
        map.set(name, row);
      });
    });
    const total = [...map.values()].reduce((sum, row) => sum + row.count, 0);
    let cursor = 0;
    const rows = [...map.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'))
      .map((row, index) => {
        const percent = total ? Math.round((row.count / total) * 100) : 0;
        const color = colors[index % colors.length];
        const start = cursor;
        cursor += total ? (row.count / total) * 360 : 0;
        return { ...row, percent, color, start, end: cursor };
      });
    const chart = rows.length
      ? `conic-gradient(${rows.map((row) => `${row.color} ${row.start}deg ${row.end}deg`).join(', ')})`
      : 'conic-gradient(rgba(255,255,255,.12) 0deg 360deg)';
    return { total, rows, top: rows[0], chart };
  }, [sessions]);

  const pushCloud = async (nextPeople, nextSessions, password = adminPassword) => {
    save(PEOPLE_KEY, nextPeople);
    save(SESSIONS_KEY, nextSessions);
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ people: nextPeople, sessions: nextSessions }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Không lưu được cloud');
      setCloudStatus('cloud-saved');
      return true;
    } catch (error) {
      setCloudStatus('local-only');
      console.warn(error);
      return false;
    }
  };

  const persistPeople = async (next) => { setPeople(next); await pushCloud(next, sessions); };
  const persistSessions = async (next) => { setSessions(next); await pushCloud(people, next); };

  const togglePerson = (name) => {
    setSelected((cur) => cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]);
  };

  const loginAdmin = async () => {
    if (!loginPassword.trim()) return;
    const ok = await pushCloud(people, sessions, loginPassword.trim());
    if (!ok) return alert('Sai mật khẩu admin hoặc cloud chưa cấu hình.');
    setAdminPassword(loginPassword.trim());
    sessionStorage.setItem('nhau-split-admin', '1');
    sessionStorage.setItem('nhau-split-password', loginPassword.trim());
    setIsAdmin(true);
    setLoginPassword('');
  };

  const logoutAdmin = () => {
    sessionStorage.removeItem('nhau-split-admin');
    sessionStorage.removeItem('nhau-split-password');
    setAdminPassword('');
    setIsAdmin(false);
  };

  const addPerson = () => {
    if (!canEdit) return;
    const name = newPerson.trim();
    if (!name || people.includes(name)) return;
    persistPeople([...people, name]);
    setNewPerson('');
  };

  const removePerson = (name) => {
    if (!canEdit) return;
    persistPeople(people.filter((x) => x !== name));
    setSelected(selected.filter((x) => x !== name));
  };

  const addSession = () => {
    if (!canEdit) return;
    if (!total || !selected.length) return alert('Nhập tổng tiền và tick ít nhất 1 người anh nhé.');
    const item = {
      id: id(),
      date,
      note: note.trim() || 'Buổi nhậu',
      totalAmount: total,
      participants: selected,
      perPerson,
      createdAt: new Date().toISOString(),
    };
    persistSessions([item, ...sessions]);
    setNote('');
    setAmountText('');
    setSelected([]);
    setDate(today());
  };

  const removeSession = (sessionId) => {
    if (!canEdit) return;
    persistSessions(sessions.filter((x) => x.id !== sessionId));
  };

  const copySession = async (s) => {
    const text = `${s.date} - ${s.note}\nTổng tiền: ${money(s.totalAmount)}\nNgười tham gia: ${s.participants.join(', ')}\nMỗi người: ${money(s.perPerson)}`;
    await navigator.clipboard.writeText(text);
    alert('Đã copy nội dung chia tiền.');
  };

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">🍻 Sổ chia kèo anh em</p>
          <h1>Kèo Nhậu</h1>
          <p className="sub">Ai cũng xem được. Chỉ admin mới đăng nhập để ghi kèo, sửa người và xoá nhật ký.</p>
          <div className="admin-pill">{canEdit ? '🔓 Admin đang mở quyền sửa' : '👀 Chế độ xem công khai'} · {cloudStatus}</div>
        </div>
        <div className="stats">
          <Stat icon={<ReceiptText />} label="Tổng tiền" value={money(stats.totalAmount)} />
          <Stat icon={<CalendarDays />} label="Số buổi" value={stats.totalCount} />
          <Stat icon={<Users />} label="Lượt tham gia" value={stats.totalShares} />
        </div>
      </section>

      <section className="dashboard-layout">
        <div className="left-stack">
          <div className="card form-card">
            {canEdit ? (
              <>
                <h2><Plus size={20} /> Ghi kèo mới</h2>
                <label>Ngày đi nhậu</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

                <label>Tiêu đề / nội dung kèo</label>
                <input placeholder="VD: Lẩu bò tối thứ 7, Karaoke sau trận banh..." value={note} onChange={(e) => setNote(e.target.value)} />

                <label>Tổng tiền (K)</label>
                <input inputMode="numeric" placeholder="VD: 4000 = 4.000K" value={amountText} onChange={(e) => setAmountText(e.target.value)} />

                <div className="people-head">
                  <label>Người tham gia</label>
                  <span>{selected.length} người</span>
                </div>
                <div className="people-list">
                  {people.map((name) => (
                    <button key={name} className={selected.includes(name) ? 'person active' : 'person'} onClick={() => togglePerson(name)}>
                      <span>{selected.includes(name) ? '✓' : ''}</span>{name}
                    </button>
                  ))}
                </div>

                <div className="result">
                  <span>Mỗi người</span>
                  <strong>{selected.length ? money(perPerson) : '—'}</strong>
                  <small>{selected.length ? `${money(total)} / ${selected.length} người` : 'Tick người tham gia để tính'}</small>
                </div>

                <button className="primary" onClick={addSession}>Lưu buổi nhậu</button>
                <button className="ghost" onClick={logoutAdmin}>Đăng xuất admin</button>
              </>
            ) : (
              <div className="login-card">
                <h2>🔐 Admin chỉnh sửa</h2>
                <p>Nhập mật khẩu để thêm kèo, thêm người hoặc xoá dữ liệu. Khách xem web không cần login.</p>
                <input type="password" placeholder="Mật khẩu admin" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loginAdmin()} />
                <button className="primary" onClick={loginAdmin}>Mở quyền sửa</button>
              </div>
            )}
          </div>

          <div className="card totals">
            <h2><Coins size={20} /> Tổng tiền từng người</h2>
            {!personTotals.length && <p className="empty">Chưa có dữ liệu để cộng tổng.</p>}
            {!!personTotals.length && (
              <div className="totals-list">
                {personTotals.map((person) => (
                  <div className="total-item" key={person.name}>
                    <button className="total-row" onClick={() => setExpandedPerson(expandedPerson === person.name ? null : person.name)}>
                      <div>
                        <strong>{person.name}</strong>
                        <small>{person.count} buổi tham gia · bấm để xem đã đi đâu</small>
                      </div>
                      <b>{money(person.total)}</b>
                    </button>
                    {expandedPerson === person.name && (
                      <div className="person-trips">
                        {(sessionsByPerson.get(person.name) || []).map((session) => (
                          <div className="trip-row" key={session.id}>
                            <div>
                              <strong>{session.date}</strong>
                              <span>{session.note}</span>
                            </div>
                            <b>{money(session.perPerson)}</b>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="side-stack">
          <div className="card drinking-chart">
            <h2><Trophy size={20} /> Bợm nhậu tổng sổ <em>🔥</em></h2>
            {!monthlyDrinkers.rows.length && <p className="empty">Chưa có dữ liệu.</p>}
            {!!monthlyDrinkers.rows.length && (
              <div className="leaderboard">
                <div className="champion-card">
                  <span className="crown">👑</span>
                  <div>
                    <small>Trùm kèo tổng sổ</small>
                    <strong>{monthlyDrinkers.top.name}</strong>
                    <p>🍺 {monthlyDrinkers.top.count} lượt tham gia · giữ ghế đầu bàn</p>
                  </div>
                  <b>{monthlyDrinkers.top.percent}%</b>
                </div>

                {monthlyDrinkers.rows.length > 1 && (
                  <div className="podium">
                    {monthlyDrinkers.rows.slice(1, 4).map((row, index) => (
                      <div className={`podium-card rank-${index + 2}`} key={row.name}>
                        <span>{index === 0 ? '🥈' : index === 1 ? '🥉' : '🏅'}</span>
                        <strong>{row.name}</strong>
                        <small>Top {index + 2} · {row.count} lượt</small>
                      </div>
                    ))}
                  </div>
                )}

                <p className="chart-note">Tính tổng số lần xuất hiện trong toàn bộ nhật ký kèo nhậu.</p>
                <div className="legend">
                  {monthlyDrinkers.rows.map((row, index) => (
                    <div className="legend-row" key={row.name}>
                      <span className="rank">#{index + 1}</span>
                      <strong>{row.name}</strong>
                      <small>{row.count} lượt</small>
                      <b>{row.percent}%</b>
                      <div className="bar"><i style={{ width: `${row.percent}%`, background: row.color }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="card manage-card">
              <h2><UserPlus size={20} /> Danh sách người</h2>
              <div className="add-person">
                <input placeholder="Tên bạn nhậu" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPerson()} />
                <button onClick={addPerson}>Thêm</button>
              </div>
              <div className="chips">
                {people.map((name) => (
                  <div className="chip" key={name}>{name}<button title="Xóa" onClick={() => removePerson(name)}>×</button></div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>

      <section className="card history">
        <h2><CalendarDays size={20} /> Nhật ký kèo nhậu</h2>
        {!sessions.length && <p className="empty">Chưa có buổi nhậu nào. Tạo buổi đầu đi anh.</p>}
        <div className="session-list">
          {sortedSessions.map((s) => (
            <article className="session" key={s.id}>
              <div className="session-main">
                <div>
                  <strong>{s.date} — {s.note}</strong>
                  <p>{s.participants.join(', ')}</p>
                </div>
                <div className="amounts">
                  <span>Tổng: {money(s.totalAmount)}</span>
                  <b>Mỗi người: {money(s.perPerson)}</b>
                </div>
              </div>
              <div className="session-actions">
                <button onClick={() => copySession(s)}><Copy size={16} /> Copy</button>
                {canEdit && <button className="danger" onClick={() => removeSession(s.id)}><Trash2 size={16} /> Xóa</button>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ icon, label, value }) {
  return <div className="stat"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

createRoot(document.getElementById('root')).render(<App />);
