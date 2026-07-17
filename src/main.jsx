import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Plus, Trash2, Users, CalendarDays, ReceiptText, Copy, UserPlus, Coins, Trophy } from 'lucide-react';
import seedData from '../data/db.json';
import './styles.css';

const PEOPLE_KEY = 'nhau-split.people.v1';
const SESSIONS_KEY = 'nhau-split.sessions.v1';
const PAID_KEY = 'nhau-split.paid.v1';
const SETTLEMENTS_KEY = 'nhau-split.settlements.v1';
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
const parseAmount = (value) => {
  const digits = Number(String(value || '').replace(/[^0-9]/g, '')) || 0;
  if (!digits) return 0;
  return digits >= 100000 ? digits : digits * 1000;
};
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const periodKey = (startDate, endDate) => `${startDate || 'start'}:${endDate || 'end'}`;

function App() {
  const [people, setPeople] = useState(() => load(PEOPLE_KEY, seedData.people || DEFAULT_PEOPLE));
  const [sessions, setSessions] = useState(() => load(SESSIONS_KEY, seedData.sessions || []));
  const [settlements, setSettlements] = useState(() => {
    const sessionsAtLoad = load(SESSIONS_KEY, seedData.sessions || []);
    const withSessionIds = (records) => records.map((record) => ({
      ...record,
      sessionIds: Array.isArray(record.sessionIds)
        ? record.sessionIds
        : sessionsAtLoad.filter((session) => session.participants.includes(record.name)).map((session) => session.id),
    }));
    const saved = load(SETTLEMENTS_KEY, null);
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      return Object.fromEntries(Object.entries(saved).map(([key, records]) => [key, withSessionIds(records)]));
    }
    const legacyPaidPeople = load(PAID_KEY, seedData.paidPeople || []);
    return legacyPaidPeople.length ? {
      [periodKey('', '')]: legacyPaidPeople.map((name) => ({
        name,
        paidAt: new Date().toISOString(),
        sessionIds: sessionsAtLoad.filter((session) => session.participants.includes(name)).map((session) => session.id),
      })),
    } : {};
  });
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [amountText, setAmountText] = useState('');
  const [selected, setSelected] = useState([]);
  const [newPerson, setNewPerson] = useState('');
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [cloudStatus, setCloudStatus] = useState('lưu trên máy');
  const canEdit = true;

  useEffect(() => {
    save(PEOPLE_KEY, people);
    save(SESSIONS_KEY, sessions);
    save(SETTLEMENTS_KEY, settlements);
  }, []);

  const total = parseAmount(amountText);
  const perPerson = selected.length ? Math.round(total / selected.length) : 0;

  const filteredSessions = sessions;
  const activePeriodKey = periodKey('', '');
  const paidRecords = settlements[activePeriodKey] || [];
  const paidSessionIdsByPerson = useMemo(() => {
    const map = new Map();
    paidRecords.forEach((record) => {
      const ids = map.get(record.name) || new Set();
      (record.sessionIds || []).forEach((sessionId) => ids.add(sessionId));
      map.set(record.name, ids);
    });
    return map;
  }, [paidRecords]);
  const isSessionPaid = (sessionId, name) => paidSessionIdsByPerson.get(name)?.has(sessionId) || false;

  const stats = useMemo(() => {
    const totalAmount = filteredSessions.reduce((sum, session) => sum + session.totalAmount, 0);
    const totalCount = filteredSessions.length;
    const totalShares = filteredSessions.reduce((sum, session) => sum + session.participants.length, 0);
    return { totalAmount, totalCount, totalShares };
  }, [filteredSessions]);

  const { personTotals, settledPersonTotals } = useMemo(() => {
    const outstanding = new Map(people.map((name) => [name, { name, total: 0, count: 0 }]));
    const settled = new Map(people.map((name) => [name, { name, total: 0, count: 0 }]));
    filteredSessions.forEach((session) => {
      session.participants.forEach((name) => {
        const target = isSessionPaid(session.id, name) ? settled : outstanding;
        const row = target.get(name) || { name, total: 0, count: 0 };
        row.total += session.perPerson;
        row.count += 1;
        target.set(name, row);
      });
    });
    const sortRows = (rows) => [...rows.values()]
      .filter((person) => person.total > 0 || person.count > 0)
      .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name, 'vi'));
    return { personTotals: sortRows(outstanding), settledPersonTotals: sortRows(settled) };
  }, [people, filteredSessions, paidSessionIdsByPerson]);

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
      map.set(person.name, filteredSessions.filter((session) => session.participants.includes(person.name) && !isSessionPaid(session.id, person.name)));
    });
    return map;
  }, [personTotals, sortedSessions]);

  const maxPersonTotal = personTotals[0]?.total || 1;

  const monthlyDrinkers = useMemo(() => {
    const colors = ['#d6a84f', '#9ca3af', '#8f6b32', '#94a3b8', '#a78b7a', '#7c8a99', '#b58a3a', '#6b7280'];
    const map = new Map();
    filteredSessions.forEach((session) => {
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
  }, [filteredSessions]);

  const markSaved = () => setCloudStatus('đã lưu trên máy');
  const persistPeople = (next) => { setPeople(next); save(PEOPLE_KEY, next); markSaved(); };
  const persistSessions = (next) => { setSessions(next); save(SESSIONS_KEY, next); markSaved(); };
  const persistSettlements = (next) => { setSettlements(next); save(SETTLEMENTS_KEY, next); markSaved(); };

  const togglePerson = (name) => {
    setSelected((cur) => cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]);
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
    persistPeople(people.filter((person) => person !== name));
    const nextSettlements = Object.fromEntries(Object.entries(settlements).map(([key, records]) => [key, records.filter((record) => record.name !== name)]));
    persistSettlements(nextSettlements);
    setSelected(selected.filter((person) => person !== name));
  };

  const togglePaid = (name) => {
    const sessionIds = filteredSessions
      .filter((session) => session.participants.includes(name) && !isSessionPaid(session.id, name))
      .map((session) => session.id);
    if (!sessionIds.length) return;
    persistSettlements({
      ...settlements,
      [activePeriodKey]: [...paidRecords, { name, sessionIds, paidAt: new Date().toISOString() }],
    });
    setExpandedPerson(null);
  };

  const undoPaid = (name) => {
    persistSettlements({ ...settlements, [activePeriodKey]: paidRecords.filter((record) => record.name !== name) });
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
    persistSessions(sessions.filter((x) => x.id !== sessionId), true);
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
          <p className="sub">Mọi người đều có thể ghi kèo, sửa thành viên và xoá nhật ký.</p>
          <div className="admin-pill">🔓 Mở toàn bộ quyền sửa · {cloudStatus}</div>
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
            {(
              <>
                <h2><Plus size={20} /> Ghi kèo mới</h2>
                <label>Ngày đi nhậu</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

                <label>Tiêu đề / nội dung kèo</label>
                <input placeholder="VD: Lẩu bò tối thứ 7, Karaoke sau trận banh..." value={note} onChange={(e) => setNote(e.target.value)} />

                <label>Tổng tiền</label>
                <input inputMode="numeric" placeholder="VD: 1700 = 1.700K hoặc 1700000 = 1.700K" value={amountText} onChange={(e) => setAmountText(e.target.value)} />

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
              </>
            )}
          </div>

          <div className="card totals">
            <h2><Coins size={20} /> Cần thanh toán</h2>
            <p className="period-summary">Toàn bộ lịch sử · {filteredSessions.length} kèo · {settledPersonTotals.length} người đã trả</p>
            {!personTotals.length && <p className="empty">Không còn khoản cần thanh toán.</p>}
            {!!personTotals.length && (
              <div className="totals-list">
                <div className="totals-head"><span></span><b>Done</b></div>
                {personTotals.map((person, index) => (
                  <div className={`total-item rank-${index + 1}`} key={person.name}>
                    <div className="total-row-wrap">
                      <button className="total-row" onClick={() => setExpandedPerson(expandedPerson === person.name ? null : person.name)}>
                        <div className="total-rank">#{index + 1}</div>
                        <div className="total-info">
                          <strong>{person.name}</strong>
                          <small>{person.count} buổi tham gia · bấm để xem chi tiết</small>
                          <div className="total-progress"><i style={{ width: `${Math.max(8, Math.round((person.total / maxPersonTotal) * 100))}%` }} /></div>
                        </div>
                        <b>{money(person.total)}</b>
                      </button>
                      <label className="paid-check" title="Đánh dấu đã thanh toán các kèo còn lại">
                        <input type="checkbox" checked={false} disabled={!canEdit} onChange={() => togglePaid(person.name)} />
                      </label>
                    </div>
                    {expandedPerson === person.name && (
                      <div className="person-trips">
                        <div className="trip-summary">
                          <span>Chi tiết kèo của {person.name}</span>
                          <b>{person.count} buổi</b>
                        </div>
                        {(sessionsByPerson.get(person.name) || []).map((session, tripIndex) => (
                          <div className="trip-row" key={session.id}>
                            <div className="trip-dot">{tripIndex + 1}</div>
                            <div className="trip-info">
                              <strong>{session.note}</strong>
                              <span>{session.date} · {session.participants.length} người chia</span>
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
            {!!settledPersonTotals.length && (
              <details className="settled-list">
                <summary>Đã thanh toán ({settledPersonTotals.length})</summary>
                {settledPersonTotals.map((person) => (
                  <div className="settled-row" key={person.name}>
                    <span>{person.name}</span><b>{money(person.total)}</b>
                    <button onClick={() => undoPaid(person.name)}>Hoàn tác</button>
                  </div>
                ))}
              </details>
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
                  <div className="participant-statuses">
                    {s.participants.map((name) => (
                      <span className={isSessionPaid(s.id, name) ? 'participant-status paid' : 'participant-status'} key={name}>
                        {name} · {isSessionPaid(s.id, name) ? 'Đã thanh toán' : 'Chưa thanh toán'}
                      </span>
                    ))}
                  </div>
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
