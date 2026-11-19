import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { isAvatar } from './utils';

const ORDER = ['auto', 'day', 'night'];
const LABEL = { auto: 'Auto', day: 'Day', night: 'Night' };

const prefersNight = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

function applyTheme(choice) {
  const theme = choice === 'auto' ? (prefersNight() ? 'night' : 'day') : choice;
  document.documentElement.dataset.theme = theme;
}

// Day, night, or follow the computer.
export function useTheme() {
  const [choice, setChoice] = useState(() => {
    const saved = localStorage.getItem('theme');
    return ORDER.includes(saved) ? saved : 'auto';
  });

  useEffect(() => {
    applyTheme(choice);
    try { localStorage.setItem('theme', choice); } catch { /* storage unavailable */ }
    if (choice !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('auto');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  const next = () => setChoice(c => ORDER[(ORDER.indexOf(c) + 1) % ORDER.length]);
  return { choice, next };
}

function ThemeIcon({ choice }) {
  if (choice === 'night') {
    return <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
  }
  if (choice === 'day') {
    return <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.6 1.6M14.1 14.1l1.6 1.6M4.3 15.7l1.6-1.6M14.1 5.9l1.6-1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
  }
  return <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" /></svg>;
}

export default function Nav({ children }) {
  const { choice, next } = useTheme();
  const tab = ({ isActive }) => `tab${isActive ? ' on' : ''}`;
  return (
    <header className="nav">
      <nav className="tabs" aria-label="Pages">
        <NavLink to="/" end className={tab}>Timer</NavLink>
        <NavLink to="/lab" className={tab}>Lab</NavLink>
        <NavLink to="/stats" className={tab}>Stats</NavLink>
      </nav>
      <div className="nav-tools">
        {children}
        <button className="tool-btn" onClick={next} title="Switch between day, night and automatic" aria-label={`Theme: ${LABEL[choice]}. Change`}>
          <ThemeIcon choice={choice} />
          {LABEL[choice]}
        </button>
      </div>
    </header>
  );
}

// A member's photo, or their initial when they have none.
export function Avatar({ src, name, size = 40 }) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (isAvatar(src)) return <img className="avatar" src={src} alt="" style={style} />;
  return <span className="avatar empty" style={style} aria-hidden="true">{(name || '?').trim().charAt(0).toUpperCase()}</span>;
}

// A small challenge line with its progress, used on the timer and lab pages.
export function Quest({ q }) {
  return (
    <li className={`quest${q.done ? ' done' : ''}`}>
      <span className="quest-box" aria-hidden="true">
        {q.done && <svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <span className="quest-text">
        <strong>{q.title}</strong>
        <span>{q.detail}</span>
        <span className="bar" role="img" aria-label={q.done ? 'Done' : `${Math.round(q.progress * 100)} percent`}>
          <span style={{ width: `${q.progress * 100}%` }} />
        </span>
      </span>
    </li>
  );
}
