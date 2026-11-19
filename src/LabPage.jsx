import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Nav, { Avatar } from './Nav';
import { fileToAvatar } from './utils';
import { useLab } from './AppContext';
import { DEFAULT_RULES, formatMinutes, memberSummary, rulesFor } from './challenge';
import { labTitles, levelOf, teamGoal, xpOf } from './game';
import { demoBoard } from './demoBoard';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SORTS = [
  { key: 'streak', label: 'Streak' },
  { key: 'weekSecs', label: 'This week' },
  { key: 'xp', label: 'Level' },
];

function WeekMarks({ week, goalSecs }) {
  return (
    <div className="marks">
      {week.map((d, i) => {
        const cls = d.met ? 'met' : d.future ? 'future' : d.secs > 0 ? 'part' : d.optional ? 'future' : 'missed';
        return (
          <span
            key={d.day}
            className={`mark ${cls}`}
            style={cls === 'part' ? { '--part': `${Math.round(Math.min(1, d.secs / goalSecs) * 100)}%` } : undefined}
            title={`${d.day}: ${formatMinutes(d.secs)}`}
          >
            {DAY_LETTERS[i]}
          </span>
        );
      })}
    </div>
  );
}

function ProfilePhoto() {
  const { photo, setPhoto, joined, profile } = useLab();
  const input = useRef(null);
  const [error, setError] = useState(null);

  const choose = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try { setPhoto(await fileToAvatar(file)); }
    catch (err) { setError(err.message); }
  };

  return (
    <section className="card profile">
      <Avatar src={photo} name={profile?.name ?? 'You'} size={88} />
      <div className="profile-text">
        <h2>Your photo</h2>
        <p className="note">
          A picture of you writing, the sillier the better.
          {joined ? ' Everyone in the lab sees it next to your name.' : ' It stays on this device until you join a lab.'}
        </p>
        <div className="profile-actions">
          <input ref={input} type="file" accept="image/*" onChange={choose} hidden />
          <button className="btn btn-primary" onClick={() => input.current?.click()}>{photo ? 'Change photo' : 'Choose a photo'}</button>
          {photo && <button className="btn btn-ghost" onClick={() => setPhoto(null)}>Remove</button>}
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
    </section>
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
  const lab = useLab();
  const [params] = useSearchParams();
  const demo = params.has('demo');
  const [sortKey, setSortKey] = useState('weekSecs');

  const base = demo ? DEFAULT_RULES : lab.baseRules;
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
        const avatar = me && !demo ? lab.photo : m.avatar;
        // Each person is measured against their own goal (or just showing up).
        const own = me && !demo ? lab.rules : rulesFor(base, m.goalMin);
        const summary = memberSummary(totals, lab.today, own);
        const xp = xpOf(summary);
        return { id: m.id, name: m.name, avatar, me, xp, goalSecs: own.dailyGoalMin * 60, hasGoal: own.hasGoal, level: levelOf(xp).level, ...summary };
      })
      .sort((a, b) => b[sortKey] - a[sortKey] || b.xp - a.xp || a.name.localeCompare(b.name));
  }, [demo, lab.joined, lab.board, lab.myTotals, lab.photo, lab.profile, lab.today, lab.rules, base, sortKey]);

  const wroteToday = rows.filter(r => r.todayMet).length;
  const team = teamGoal(rows, base);
  const titles = useMemo(() => labTitles(rows), [rows]);
  const titlesOf = (id) => titles.filter(t => t.memberId === id);
  const heading = demo ? 'Sample lab' : lab.joined ? (lab.labName ?? 'Lab') : 'Writing challenge';

  const leave = async () => {
    if (!window.confirm('Leave the lab? Your shared writing time is removed for everyone. It stays on this device.')) return;
    try { await lab.leaveLab(); } catch (e) { window.alert(e.message); }
  };

  return (
    <div className="app">
      <Nav />
      <main className="page">
        <div className="page-head">
          <h1>{heading}</h1>
          <p>
            Everyone writes toward their own daily goal, or simply shows up for {DEFAULT_RULES.dailyGoalMin} minutes.
            {base.weekdaysOnly && ' Weekends are free: they never break a streak.'}
          </p>
        </div>

        {demo && <p className="note">This is made-up data, to show the page once a lab has joined. <Link to="/lab">Back to my challenge</Link></p>}

        {showBoard && (
          <section className="figures">
            <div className="figure wide">
              <div className="figure-head"><span>Lab goal this week</span><strong>{formatMinutes(team.done)} of {formatMinutes(team.target)}</strong></div>
              <span className="bar big" role="img" aria-label={`${Math.round(team.progress * 100)} percent`}><span style={{ width: `${team.progress * 100}%` }} /></span>
            </div>
            <div className="figure">
              <strong>{wroteToday} of {rows.length}</strong>
              <span>did their day today</span>
            </div>
          </section>
        )}

        {titles.length > 0 && (
          <section className="titles" aria-label="This week's titles">
            {titles.map(t => (
              <div key={t.id} className="title-card">
                <span>{t.title}</span>
                <strong>{t.name}</strong>
                <em>{t.value}</em>
              </div>
            ))}
          </section>
        )}

        {lab.joined && !demo && !lab.board && lab.status.state !== 'error' && <p className="note">Loading the lab.</p>}

        <section className="board" role="table">
          <div className="board-row board-head" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Week</span>
            <span role="columnheader" className="num">Today</span>
            {SORTS.map(s => (
              <button key={s.key} role="columnheader" className={`num sort-btn${sortKey === s.key ? ' on' : ''}`} onClick={() => setSortKey(s.key)} title={`Sort by ${s.label.toLowerCase()}`}>
                {s.label}
              </button>
            ))}
          </div>
          {rows.map((r, i) => (
            <div key={r.id} className={`board-row${r.me && showBoard ? ' me' : ''}`} role="row">
              <span className="board-name" role="cell">
                {showBoard && <span className="rank">{i + 1}</span>}
                <Avatar src={r.avatar} name={r.name} />
                <span className="who">
                  {r.name}{r.me && showBoard && <em>you</em>}
                  {titlesOf(r.id).length > 0 && <span className="tags">{titlesOf(r.id).map(t => <span key={t.id} className="tag">{t.title}</span>)}</span>}
                </span>
              </span>
              <span role="cell" className="board-week"><WeekMarks week={r.week} goalSecs={r.goalSecs} /></span>
              <span className={`num${r.todayMet ? ' done' : ''}`} role="cell" data-label="Today" title={r.hasGoal ? `Own goal: ${r.goalSecs / 60} min a day` : 'No set goal'}>
                {formatMinutes(r.todaySecs)}{r.hasGoal && <small> of {r.goalSecs / 60}</small>}
              </span>
              <span className="num" role="cell" data-label="Streak">{r.streak} {r.streak === 1 ? 'day' : 'days'}</span>
              <span className="num" role="cell" data-label="Week">{formatMinutes(r.weekSecs)}</span>
              <span className="num" role="cell" data-label="Level">{r.level}</span>
            </div>
          ))}
        </section>

        {!demo && lab.status.state === 'error' && (
          <p className="form-error">
            Could not reach the lab ({lab.status.error}). Your time is kept on this device and will be sent later.{' '}
            <button className="link-btn" onClick={lab.sync}>Try again</button>
          </p>
        )}

        {!demo && !lab.joined && (
          <section className="card">
            <h2>Do it with your lab</h2>
            {lab.configured ? <JoinForm /> : (
              <p className="note">
                This copy of the app is not connected to a lab yet, so the challenge is only for you.
                The README explains how to connect one in about ten minutes.
              </p>
            )}
            <p className="note"><Link to="/lab?demo">See a sample lab</Link></p>
          </section>
        )}

        {!demo && <ProfilePhoto />}

        {!demo && lab.joined && (
          <p className="foot">
            Shared as {lab.profile.name}. Only the Writing category is shared.{' '}
            <button className="link-btn" onClick={leave}>Leave the lab</button>
          </p>
        )}
      </main>
    </div>
  );
}
