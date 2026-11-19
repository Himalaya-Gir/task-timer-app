import { dayKey } from './challenge';

export function getContrastColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#1a1a1a' : '#ffffff';
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback for pages not served over https.
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16));
}

// Every stored session goes through here, so each one has an id (needed to
// share and delete it) and the local day it belongs to.
export function makeSession({ start, end, duration, category, endType }) {
  return {
    id: uuid(),
    start,
    end,
    duration,
    day: dayKey(start),
    dayOfWeek: new Date(start).getDay(),
    category,
    endType,
  };
}

// Sessions saved by older versions have no id or day.
export function upgradeSessions(sessions) {
  let changed = false;
  const upgraded = sessions.map(s => {
    if (s.id && s.day) return s;
    changed = true;
    return { ...s, id: s.id ?? uuid(), day: s.day ?? dayKey(s.start) };
  });
  return changed ? upgraded : sessions;
}

export function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
