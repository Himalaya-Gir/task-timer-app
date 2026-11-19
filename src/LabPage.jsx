import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCategories, useLab } from './AppContext';
import { getContrastColor } from './utils';
import { DEFAULT_RULES, formatMinutes, memberSummary } from './challenge';
import { demoBoard } from './demoBoard';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SORTS = [
  { key: 'streak', label: 'Streak' },
  { key: 'weekSecs', label: 'This week' },
  { key: 'totalSecs', label: 'Total' },
];

function WeekDots({ week, goalSecs }) {
  return (
    <div className="week-dots">
      {week.map((d, i) => {
        const part = Math.min(1, d.secs / goalSecs);
        const cls = d.met ? 'met' : d.future ? 'future' : d.secs > 0 ? 'part' : d.optional ? 'optional' : 'missed';
        return (
          <span
            key={d.day}
            className={`week-dot ${cls}`}
            style={cls === 'part' ? { '--part': `${Math.round(part * 100)}%` } : undefined}
            title={`${d.day}: ${formatMinutes(d.secs)}`}
          >
            {DAY_LETTERS[i]}
          </span>
        );
      })}
    </div>
  );
}

function JoinForm() {
  const { joinLab } = useLab();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setBusy(true);
    setError(null);
    try { await joinLab(name.trim(), code.trim()); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <form className="join-form" onSubmit={submit}>
      <p>
        Join your lab to see everyone's writing time. Only your sessions in the
        <strong> Writing</strong> category are shared, under the name you choose.
      </p>
      <div className="join-fields">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your first name" maxLength={30} aria-label="Your first name" required />
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Lab code" aria-label="Lab code" autoCapitalize="none" autoComplete="off" required />
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Joining' : 'Join'}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

export default function LabPage() {
  const { getCategoryColor, activeCategory } = useCategories();
  const lab = useLab();
  const [params] = useSearchParams();
  const demo = params.has('demo');
  const [sortKey, setSortKey] = useState('weekSecs');

  const bgColor = getCategoryColor(activeCategory);
  const fg = getContrastColor(bgColor);
  const navStyle = { borderColor: fg, color: fg };

  const rules = demo ? DEFAULT_RULES : lab.rules;
  const goalSecs = rules.dailyGoalMin * 60;
  const showBoard = demo || lab.joined;

  const rows = useMemo(() => {
    let source;
    if (demo) source = demoBoard(lab.today);
    else if (lab.joined && lab.board) source = lab.board;
    else source = { myId: 'me', members: [{ id: 'me', name: lab.profile?.name ?? 'You', totals: lab.myTotals }] };

    return source.members
      .map(m => {
        const me = m.id === source.myId;
        // My own row uses what is on this device, so it updates at once.
        const totals = me && !demo ? lab.myTotals : m.totals;
        return { id: m.id, name: m.name, me, ...memberSummary(totals, lab.today, rules) };
      })
      .sort((a, b) => b[sortKey] - a[sortKey] || b.totalSecs - a.totalSecs || a.name.localeCompare(b.name));
  }, [demo, lab.joined, lab.board, lab.myTotals, lab.profile, lab.today, rules, sortKey]);

  const wroteToday = rows.filter(r => r.todayMet).length;
  const labWeek = rows.reduce((a, r) => a + r.weekSecs, 0);
  const title = demo ? 'Sample lab' : lab.joined ? (lab.labName ?? 'Lab') : 'Writing challenge';

  const leave = async () => {
    if (!window.confirm('Leave the lab? Your shared writing time is removed for everyone. It stays on this device.')) return;
    try { await lab.leaveLab(); } catch (e) { window.alert(e.message); }
  };

  return (
    <div className="stats-page" style={{ background: bgColor }}>
      <div className="stats-nav">
        <Link to="/stats" className="nav-btn" style={navStyle}>Stats</Link>
        <Link to="/" className="nav-btn" style={navStyle}>Timer</Link>
      </div>

      <div className="stats-card">
        <h2>{title}</h2>
        <p className="lab-rule">
          Goal: <strong>{rules.dailyGoalMin} minutes of writing</strong> {rules.weekdaysOnly ? 'every weekday' : 'every day'}.
          {rules.weekdaysOnly && ' Weekends are a bonus: they never break a streak.'}
        </p>

        {demo && <p className="lab-note">This is made-up data, to show what the page looks like once a lab has joined.</p>}

        {showBoard && (
          <div className="lab-figures">
            <div><strong>{wroteToday} of {rows.length}</strong><span>reached the goal today</span></div>
            <div><strong>{formatMinutes(labWeek)}</strong><span>written by the lab this week</span></div>
          </div>
        )}

        {lab.joined && !demo && !lab.board && lab.status.state !== 'error' && (
          <p className="lab-note">Loading the lab.</p>
        )}

        <div className="board" role="table">
          <div className="board-row board-head" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Week</span>
            <span role="columnheader" className="num">Today</span>
            {SORTS.map(s => (
              <button
                key={s.key}
                role="columnheader"
                className={`num sort-btn${sortKey === s.key ? ' on' : ''}${s.key === 'totalSecs' ? ' wide-only' : ''}`}
                onClick={() => setSortKey(s.key)}
                title={`Sort by ${s.label.toLowerCase()}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {rows.map(r => (
            <div key={r.id} className={`board-row${r.me ? ' me' : ''}`} role="row">
              <span className="board-name" role="cell">{r.name}{r.me && showBoard && <em>you</em>}</span>
              <span role="cell" className="board-week"><WeekDots week={r.week} goalSecs={goalSecs} /></span>
              <span className={`num${r.todayMet ? ' done' : ''}`} role="cell" data-label="Today">{formatMinutes(r.todaySecs)}</span>
              <span className="num" role="cell" data-label="Streak">{r.streak} {r.streak === 1 ? 'day' : 'days'}</span>
              <span className="num" role="cell" data-label="Week">{formatMinutes(r.weekSecs)}</span>
              <span className="num wide-only" role="cell">{formatMinutes(r.totalSecs)}</span>
            </div>
          ))}
        </div>

        {!demo && lab.status.state === 'error' && (
          <p className="form-error">
            Could not reach the lab ({lab.status.error}). Your time is kept on this device and will be sent later.{' '}
            <button className="link-btn" onClick={lab.sync}>Try again</button>
          </p>
        )}
      </div>

      {!demo && !lab.joined && (
        <div className="stats-card">
          <h3>Do it with your lab</h3>
          {lab.configured ? <JoinForm /> : (
            <p className="lab-note">
              This copy of the app is not connected to a lab yet, so the challenge is only for you.
              The README explains how to connect one in about ten minutes.
            </p>
          )}
          <p className="lab-note"><Link to="/lab?demo">See a sample lab</Link></p>
        </div>
      )}

      {demo && (
        <p className="lab-foot" style={{ color: fg }}><Link to="/lab" style={{ color: fg }}>Back to my challenge</Link></p>
      )}

      {!demo && lab.joined && (
        <p className="lab-foot" style={{ color: fg }}>
          Shared as {lab.profile.name}. Only the Writing category is shared.{' '}
          <button className="link-btn" style={{ color: fg }} onClick={leave}>Leave the lab</button>
        </p>
      )}
    </div>
  );
}
