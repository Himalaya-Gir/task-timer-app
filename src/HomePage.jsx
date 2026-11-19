import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Nav, { Quest } from './Nav';
import { useCategories, useSessions, useLab } from './AppContext';
import { makeSession } from './utils';
import { formatMinutes, isWriting } from './challenge';
import { dailyQuests, levelOf, weeklyQuests, xpOf } from './game';
import chimeSound from './assets/chime-sound-7143.mp3';

const PRESET_COLORS = ['#1976d2', '#388e3c', '#d32f2f', '#7b1fa2', '#e65100', '#0097a7'];

// A timer that reached zero while the page was gone (crash, phone closing the
// tab) is logged once on the next visit instead of being lost.
let recoveredOnce = false;

function getSavedTimer() {
  try { return JSON.parse(localStorage.getItem('timerState')) || {}; }
  catch { return {}; }
}

export default function HomePage() {
  const { categories, setCategories, getCategoryColor, activeCategory: category, setActiveCategory: setCategory } = useCategories();
  const { sessions, addSession } = useSessions();
  const { mySummary, myTotals, today, rules, joined, labName } = useLab();

  // ── Timer state ──────────────────────────────────────────────────────
  const saved = getSavedTimer();

  // Restore running state: if endTime is still in the future, resume.
  const savedEndTime = saved.endTime ?? null;
  const savedStillRunning = saved.isRunning && savedEndTime && Math.round((savedEndTime - Date.now()) / 1000) > 0;

  const [isRunning, setIsRunning] = useState(savedStillRunning);
  const [endTime, setEndTime] = useState(savedStillRunning ? savedEndTime : null);
  const [time, setTime] = useState(() => {
    if (savedStillRunning) return Math.max(0, Math.round((savedEndTime - Date.now()) / 1000));
    return saved.time ?? 30 * 60;
  });
  const [lastSetTime, setLastSetTime] = useState(saved.lastSetTime ?? 30 * 60);
  const [sessionStart, setSessionStart] = useState(saved.sessionStart ?? null);

  // ── Work-time accumulator (excludes paused time) ─────────────────────
  // Both are saved with the timer so a reload never loses time already worked.
  const accumulatedSecsRef = useRef(saved.sessionStart ? (saved.accumulated ?? 0) : 0);
  const resumeTimeRef = useRef(savedStillRunning ? (saved.resumeTime ?? Date.now()) : null);

  useEffect(() => {
    if (recoveredOnce) return;
    recoveredOnce = true;
    if (!saved.isRunning || !saved.sessionStart || !savedEndTime || savedStillRunning) return;
    const worked = Math.round(
      (saved.accumulated ?? 0) + (savedEndTime - (saved.resumeTime ?? saved.sessionStart)) / 1000
    );
    if (worked > 0) {
      addSession({ start: saved.sessionStart, end: savedEndTime, duration: worked, category, endType: 'complete' });
    }
    accumulatedSecsRef.current = 0;
    setSessionStart(null);
    setTime(saved.lastSetTime ?? 30 * 60);
  }, []);

  // ── Timer editing ────────────────────────────────────────────────────
  const [editingTime, setEditingTime] = useState(false);
  const [inputMins, setInputMins] = useState(Math.floor(time / 60));
  const [inputSecs, setInputSecs] = useState('00');
  const minutesRef = useRef(null);

  // ── Category editing ─────────────────────────────────────────────────
  const [colorPickerFor, setColorPickerFor] = useState(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);
  const newCatRef = useRef(null);

  // ── Audio ─────────────────────────────────────────────────────────────
  const audioRef = useRef(null);

  // ── Derived theming ───────────────────────────────────────────────────
  const catColor = getCategoryColor(category);

  // ── Stale-closure-safe session logger ─────────────────────────────────
  const logSessionRef = useRef(null);
  logSessionRef.current = (endType) => {
    if (!sessionStart) return;
    const workedSecs = Math.round(
      accumulatedSecsRef.current +
      (isRunning && resumeTimeRef.current ? (Date.now() - resumeTimeRef.current) / 1000 : 0)
    );
    if (workedSecs <= 0) { setSessionStart(null); return; }
    addSession({ start: sessionStart, end: Date.now(), duration: workedSecs, category, endType });
    accumulatedSecsRef.current = 0;
    resumeTimeRef.current = null;
    setSessionStart(null);
  };

  // ── Persist timer state (including running state for tab-title continuity) ─
  useEffect(() => {
    localStorage.setItem('timerState', JSON.stringify({
      time, lastSetTime, isRunning, endTime, sessionStart,
      accumulated: accumulatedSecsRef.current,
      resumeTime: resumeTimeRef.current,
    }));
  }, [time, lastSetTime, isRunning, endTime, sessionStart]);

  // ── Page title ────────────────────────────────────────────────────────
  const updateTitle = () => {
    const remaining = endTime ? Math.max(0, Math.round((endTime - Date.now()) / 1000)) : time;
    const m = Math.floor(remaining / 60);
    const s = (remaining % 60).toString().padStart(2, '0');
    document.title = `${m}:${s}`;
  };

  useEffect(() => { updateTitle(); }, [time]);

  // Snap title to correct value when tab becomes visible again (Chrome throttles
  // background timers, so the displayed time can lag while the tab is hidden).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') updateTitle(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [endTime, time]);

  // ── Focus effects ────────────────────────────────────────────────────
  useEffect(() => {
    if (editingTime && minutesRef.current) {
      minutesRef.current.focus();
      minutesRef.current.select();
    }
  }, [editingTime]);

  useEffect(() => {
    if (addingCategory && newCatRef.current) newCatRef.current.focus();
  }, [addingCategory]);

  // ── Unlock audio on first interaction ────────────────────────────────
  useEffect(() => {
    const unlock = () => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // ── Notification permission ───────────────────────────────────────────
  useEffect(() => {
    if (window.Notification?.permission === 'default') Notification.requestPermission();
  }, []);

  // ── Log session + reset on page close/refresh ─────────────────────────
  // Ref is reassigned every render so handler always closes over fresh state.
  const onPageCloseRef = useRef(null);
  onPageCloseRef.current = () => {
    if (!isRunning || !sessionStart) return;
    const workedSecs = Math.round(
      accumulatedSecsRef.current +
      (resumeTimeRef.current ? (Date.now() - resumeTimeRef.current) / 1000 : 0)
    );
    if (workedSecs > 0) {
      try {
        const sessions = JSON.parse(localStorage.getItem('sessions')) || [];
        sessions.push(makeSession({
          start: sessionStart, end: Date.now(), duration: workedSecs, category, endType: 'close',
        }));
        localStorage.setItem('sessions', JSON.stringify(sessions));
      } catch {}
    }
    // Reset so the page comes back paused at the original set time.
    try {
      const s = getSavedTimer();
      localStorage.setItem('timerState', JSON.stringify({
        ...s,
        time: s.lastSetTime ?? 30 * 60,
        isRunning: false,
        endTime: null,
        sessionStart: null,
        accumulated: 0,
        resumeTime: null,
      }));
    } catch {}
  };

  useEffect(() => {
    const handler = () => onPageCloseRef.current?.();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || !endTime) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTime(remaining);
      if (remaining === 0) {
        clearInterval(id);
        playChime();
        if (window.Notification?.permission === 'granted' && document.visibilityState !== 'visible') {
          new Notification('Time is up!', { body: 'Your timer has finished.' });
        }
        logSessionRef.current('complete');
        setIsRunning(false);
        setEndTime(null);
        setTime(lastSetTime);
      }
    }, 200);
    return () => clearInterval(id);
  }, [isRunning, endTime, lastSetTime]);

  // ── Dismiss color picker on outside click ─────────────────────────────
  useEffect(() => {
    if (!colorPickerFor) return;
    const dismiss = (e) => {
      if (!e.target.closest('.color-popover') && !e.target.closest('.color-dot')) {
        setColorPickerFor(null);
      }
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [colorPickerFor]);

  // ── Audio helpers ─────────────────────────────────────────────────────
  const playChime = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(playBeep);
    } else {
      playBeep();
    }
  };

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
      o.onended = () => ctx.close();
    } catch {}
  };

  // ── Timer controls ─────────────────────────────────────────────────────
  const handleStart = () => {
    if (isRunning) {
      // Pause: bank elapsed time so far
      if (resumeTimeRef.current) {
        accumulatedSecsRef.current += (Date.now() - resumeTimeRef.current) / 1000;
        resumeTimeRef.current = null;
      }
      setIsRunning(false);
    } else {
      resumeTimeRef.current = Date.now();
      if (!sessionStart) setSessionStart(Date.now());
      setEndTime(Date.now() + time * 1000);
      setIsRunning(true);
    }
  };

  const handleReset = () => {
    logSessionRef.current('reset');
    accumulatedSecsRef.current = 0;
    resumeTimeRef.current = null;
    setIsRunning(false);
    setEndTime(null);
    setTime(lastSetTime);
  };

  const handleTimeClick = () => {
    if (isRunning) return;
    setInputMins(Math.floor(time / 60));
    setInputSecs('00');
    setEditingTime(true);
  };

  const commitEdit = () => {
    const m = parseInt(inputMins, 10) || 0;
    const s = parseInt(inputSecs, 10) || 0;
    if (m > 0 || s > 0) {
      const t = m * 60 + s;
      setTime(t);
      setLastSetTime(t);
    }
    setEditingTime(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit();
    else if (e.key === 'Escape') setEditingTime(false);
  };

  // ── Category helpers ──────────────────────────────────────────────────
  const handleDeleteCategory = (name) => {
    setCategories(prev => prev.filter(c => c.name !== name));
    if (category === name) {
      setCategory(categories.find(c => c.name !== name)?.name ?? 'General');
    }
  };

  const handleSetColor = (name, color) => {
    setCategories(prev => prev.map(c => c.name === name ? { ...c, color } : c));
  };

  const handleAddCategory = () => {
    const name = newCatName.trim();
    if (name && !categories.some(c => c.name === name)) {
      setCategories(prev => [...prev, { name, color: newCatColor }]);
      setCategory(name);
    }
    setNewCatName('');
    setNewCatColor(PRESET_COLORS[0]);
    setAddingCategory(false);
  };

  // ── Focus mode: nothing but the clock ─────────────────────────────────
  const [focus, setFocus] = useState(() => localStorage.getItem('focusMode') === '1');
  useEffect(() => {
    try { localStorage.setItem('focusMode', focus ? '1' : '0'); } catch { /* storage unavailable */ }
    if (!focus) return;
    const onKey = (e) => { if (e.key === 'Escape') setFocus(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus]);

  // ── Writing today, including the session in progress ──────────────────
  const liveSecs = sessionStart && isWriting(category)
    ? accumulatedSecsRef.current + (isRunning && resumeTimeRef.current ? (Date.now() - resumeTimeRef.current) / 1000 : 0)
    : 0;
  const liveTotals = liveSecs ? { ...myTotals, [today]: (myTotals[today] || 0) + liveSecs } : myTotals;
  const todaySecs = liveTotals[today] || 0;
  const todayDone = todaySecs >= rules.dailyGoalMin * 60;

  const todayQuests = dailyQuests(sessions, liveTotals, today, rules);
  const weekQuests = weeklyQuests(liveTotals, today, rules);
  const level = levelOf(xpOf(mySummary) + Math.floor(liveSecs / 60));
  const questsDone = todayQuests.filter(q => q.done).length;

  // ── A short cheer when the daily goal is reached ──────────────────────
  const [toast, setToast] = useState(null);
  const wasDone = useRef(todayDone);
  useEffect(() => {
    if (todayDone && !wasDone.current) {
      setToast('Daily goal reached. Well done.');
      const id = setTimeout(() => setToast(null), 6000);
      wasDone.current = true;
      return () => clearTimeout(id);
    }
    wasDone.current = todayDone;
  }, [todayDone]);

  const formatTime = () => {
    const m = Math.floor(time / 60);
    const s = (time % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const RING = 2 * Math.PI * 150;
  const remaining = lastSetTime ? Math.min(1, time / lastSetTime) : 1;

  return (
    <div className={`app home${focus ? ' focus' : ''}`}>
      <audio ref={audioRef} src={chimeSound} preload="auto" />

      {!focus && (
        <Nav>
          <button className="tool-btn" onClick={() => setFocus(true)} title="Show only the clock">
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Focus
          </button>
        </Nav>
      )}

      <main className="home-main">
        <section className="timer-col">
          <div className="ring-wrap">
            <svg className="ring" viewBox="0 0 320 320" aria-hidden="true">
              <circle cx="160" cy="160" r="150" className="ring-track" />
              <circle
                cx="160" cy="160" r="150" className="ring-fill" transform="rotate(-90 160 160)"
                style={{ stroke: catColor, strokeDasharray: RING, strokeDashoffset: RING * (1 - remaining) }}
              />
            </svg>
            <div className="ring-inner">
              {editingTime ? (
                <div className="timer-input-row">
                  <input
                    ref={minutesRef}
                    className="timer-input"
                    aria-label="Minutes"
                    value={inputMins}
                    onChange={e => setInputMins(e.target.value.replace(/\D/g, ''))}
                    onBlur={commitEdit}
                    onKeyDown={handleEditKeyDown}
                    maxLength={3}
                  />
                  <span className="timer-colon">:</span>
                  <input
                    className="timer-input"
                    aria-label="Seconds"
                    value={String(inputSecs).padStart(2, '0')}
                    onChange={e => {
                      let v = e.target.value.replace(/\D/g, '');
                      if (parseInt(v, 10) > 59) v = '59';
                      setInputSecs(v.slice(0, 2));
                    }}
                    onBlur={commitEdit}
                    onKeyDown={handleEditKeyDown}
                    maxLength={2}
                  />
                </div>
              ) : (
                <button
                  className={`timer-time${isRunning ? ' locked' : ''}`}
                  onClick={handleTimeClick}
                  title={isRunning ? 'Pause to change the time' : 'Click to set the time'}
                >
                  {formatTime()}
                </button>
              )}
              <div className="ring-cat"><span className="sq" style={{ background: catColor }} />{category}</div>
            </div>
          </div>

          <div className="timer-buttons">
            <button className="btn btn-primary btn-big" onClick={handleStart}>
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <button className="btn btn-ghost btn-big" onClick={handleReset}>Reset</button>
          </div>

          {focus ? (
            <div className="focus-foot">
              <span>{formatMinutes(todaySecs)} of {rules.dailyGoalMin} min today</span>
              <button className="link-btn" onClick={() => setFocus(false)}>Leave focus (Esc)</button>
            </div>
          ) : (
            <div className="category-bar">
              {categories.map(cat => {
                const isActive = cat.name === category;
                return (
                  <div key={cat.name} className="category-pill-wrap">
                    <button
                      className={`category-pill${isActive ? ' on' : ''}`}
                      onClick={() => setCategory(cat.name)}
                    >
                      <span
                        className="color-dot"
                        style={{ background: cat.color }}
                        onClick={e => {
                          e.stopPropagation();
                          setColorPickerFor(colorPickerFor === cat.name ? null : cat.name);
                        }}
                        title="Change color"
                      />
                      {cat.name}
                    </button>

                    {cat.name !== 'General' && (
                      <button className="pill-delete" onClick={() => handleDeleteCategory(cat.name)} title={`Delete ${cat.name}`} aria-label={`Delete ${cat.name}`}>
                        ×
                      </button>
                    )}

                    {colorPickerFor === cat.name && (
                      <div className="color-popover">
                        <div className="color-swatches">
                          {PRESET_COLORS.map(color => (
                            <button
                              key={color}
                              aria-label={`Color ${color}`}
                              className={`color-swatch${cat.color === color ? ' selected' : ''}`}
                              style={{ background: color }}
                              onClick={() => { handleSetColor(cat.name, color); setColorPickerFor(null); }}
                            />
                          ))}
                        </div>
                        <input type="color" aria-label="Custom color" value={cat.color} onChange={e => handleSetColor(cat.name, e.target.value)} />
                      </div>
                    )}
                  </div>
                );
              })}

              {addingCategory ? (
                <div className="add-category-form">
                  <input
                    ref={newCatRef}
                    className="category-input"
                    aria-label="Category name"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddCategory();
                      else if (e.key === 'Escape') { setAddingCategory(false); setNewCatName(''); }
                    }}
                    placeholder="Name"
                    maxLength={20}
                  />
                  <div className="color-swatches">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        aria-label={`Color ${color}`}
                        className={`color-swatch${newCatColor === color ? ' selected' : ''}`}
                        style={{ background: color }}
                        onClick={() => setNewCatColor(color)}
                      />
                    ))}
                  </div>
                  <button className="btn btn-primary" onClick={handleAddCategory}>Add</button>
                  <button className="btn btn-ghost" aria-label="Cancel" onClick={() => { setAddingCategory(false); setNewCatName(''); }}>×</button>
                </div>
              ) : (
                <button className="category-pill add-pill" onClick={() => setAddingCategory(true)} title="Add a category" aria-label="Add a category">
                  +
                </button>
              )}
            </div>
          )}
        </section>

        {!focus && (
          <aside className="side">
            <div className="side-top">
              <div className="stat-big">
                <strong>{mySummary.streak}</strong>
                <span>{mySummary.streak === 1 ? 'day in a row' : 'days in a row'}</span>
              </div>
              <div className="level">
                <div className="level-head"><strong>Level {level.level}</strong><span>{level.toNext} XP to level {level.level + 1}</span></div>
                <span className="bar" role="img" aria-label={`${level.into} of ${level.span} XP`}><span style={{ width: `${(level.into / level.span) * 100}%` }} /></span>
              </div>
            </div>

            <section>
              <h2>Today <span>{questsDone} of {todayQuests.length}</span></h2>
              <ul className="quests">{todayQuests.map(q => <Quest key={q.id} q={q} />)}</ul>
            </section>

            <section>
              <h2>This week</h2>
              <ul className="quests">{weekQuests.map(q => <Quest key={q.id} q={q} />)}</ul>
            </section>

            <Link to="/lab" className="side-link">
              {joined ? `See how ${labName ?? 'the lab'} is doing` : 'Do it with your lab'} →
            </Link>
          </aside>
        )}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
