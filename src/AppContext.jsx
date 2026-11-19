import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DEFAULT_RULES, dayKey, memberSummary, writingByDay } from './challenge';
import { makeSession, upgradeSessions, readJSON, writeJSON } from './utils';
import * as labApi from './labApi';

const CategoriesCtx = createContext(null);
const SessionsCtx = createContext(null);
const LabCtx = createContext(null);

const DEFAULT_CATEGORIES = [
  { name: 'General', color: '#1976d2' },
  { name: 'Writing', color: '#7b1fa2' },
];

// Default category names this browser has already been given, so a newly
// added default reaches existing users once, and stays gone if they delete it.
const SEEDED_KEY = 'seededDefaultCategories';

function loadCategories() {
  let cats;
  try {
    const raw = JSON.parse(localStorage.getItem('categories'));
    if (!Array.isArray(raw) || !raw.length) return DEFAULT_CATEGORIES;
    cats = typeof raw[0] === 'string' ? raw.map(name => ({ name, color: '#1976d2' })) : raw;
  } catch { return DEFAULT_CATEGORIES; }

  let seeded;
  try { seeded = JSON.parse(localStorage.getItem(SEEDED_KEY)) || ['General']; }
  catch { seeded = ['General']; }

  const has = (name) => cats.some(c => c.name.toLowerCase() === name.toLowerCase());
  const missing = DEFAULT_CATEGORIES.filter(d => !seeded.includes(d.name) && !has(d.name));
  return missing.length ? [...cats, ...missing] : cats;
}

function loadSessions() {
  const stored = readJSON('sessions', []);
  const sessions = upgradeSessions(Array.isArray(stored) ? stored : []);
  if (sessions !== stored) writeJSON('sessions', sessions);
  return sessions;
}

// Re-renders when the calendar day changes, so "today" never goes stale in a
// tab left open overnight.
function useToday() {
  const [today, setToday] = useState(() => dayKey(Date.now()));
  useEffect(() => {
    const tick = () => setToday(dayKey(Date.now()));
    const id = setInterval(tick, 60 * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);
  return today;
}

export function AppProvider({ children }) {
  const [categories, setCategories] = useState(loadCategories);

  useEffect(() => {
    writeJSON(SEEDED_KEY, DEFAULT_CATEGORIES.map(c => c.name));
  }, []);

  const [activeCategory, setActiveCategory] = useState(() =>
    localStorage.getItem('category') || DEFAULT_CATEGORIES[0].name
  );

  const [sessions, setSessions] = useState(loadSessions);

  useEffect(() => { writeJSON('categories', categories); }, [categories]);

  useEffect(() => {
    localStorage.setItem('category', activeCategory);
  }, [activeCategory]);

  const getCategoryColor = useCallback((name) =>
    categories.find(c => c.name === name)?.color ?? '#1976d2',
  [categories]);

  const addSession = useCallback((fields) => {
    setSessions(prev => {
      const updated = [...prev, makeSession(fields)];
      writeJSON('sessions', updated);
      return updated;
    });
  }, []);

  const deleteSession = useCallback((id) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      writeJSON('sessions', updated);
      return updated;
    });
    // Remembered so the shared copy is removed at the next sync.
    if (readJSON('labSynced', []).includes(id)) {
      writeJSON('labPendingDeletes', [...readJSON('labPendingDeletes', []), id]);
    }
  }, []);

  // ── Lab challenge ─────────────────────────────────────────────────────
  const today = useToday();
  const [profile, setProfile] = useState(() => readJSON('labProfile', null));
  const [labRules, setLabRules] = useState(() => readJSON('labRules', null));
  const [board, setBoard] = useState(null);
  const [photo, setPhotoState] = useState(() => localStorage.getItem('profilePhoto'));
  const [labStatus, setLabStatus] = useState({ state: 'idle', error: null, syncedAt: null });

  const joined = labApi.labConfigured && Boolean(profile);
  const rules = useMemo(
    () => (joined && labRules ? labRules : DEFAULT_RULES),
    [joined, labRules]
  );

  const myTotals = useMemo(() => writingByDay(sessions), [sessions]);
  const mySummary = useMemo(() => memberSummary(myTotals, today, rules), [myTotals, today, rules]);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const syncing = useRef(false);
  const syncAgain = useRef(false);

  // Send what is new, then read everyone's totals. One run at a time.
  const sync = useCallback(async () => {
    if (!labApi.labConfigured || !readJSON('labProfile', null)) return;
    if (syncing.current) { syncAgain.current = true; return; }
    syncing.current = true;
    setLabStatus(s => ({ ...s, state: 'loading', error: null }));
    try {
      const fetched = await labApi.fetchRules();
      if (fetched) { setLabRules(fetched); writeJSON('labRules', fetched); }

      if (localStorage.getItem('labPhotoDirty') === '1') {
        await labApi.setAvatar(localStorage.getItem('profilePhoto'));
        localStorage.removeItem('labPhotoDirty');
      }

      const synced = new Set(readJSON('labSynced', []));
      const deletes = readJSON('labPendingDeletes', []);
      const sent = await labApi.pushSessions(sessionsRef.current, synced, deletes);
      sent.forEach(id => synced.add(id));
      deletes.forEach(id => synced.delete(id));
      writeJSON('labSynced', [...synced]);
      writeJSON('labPendingDeletes', readJSON('labPendingDeletes', []).filter(id => !deletes.includes(id)));

      setBoard(await labApi.fetchBoard(fetched?.startDay));
      setLabStatus({ state: 'idle', error: null, syncedAt: Date.now() });
    } catch (e) {
      setLabStatus(s => ({ ...s, state: 'error', error: e.message || 'Could not reach the lab.' }));
    } finally {
      syncing.current = false;
      if (syncAgain.current) { syncAgain.current = false; sync(); }
    }
  }, []);

  // Sync when joined, whenever sessions change, and when the tab comes back.
  useEffect(() => {
    if (!joined) return;
    sync();
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', sync);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', sync);
    };
  }, [joined, sessions, sync]);

  const joinLab = useCallback(async (name, code) => {
    await labApi.joinLab(name, code);
    const p = { name };
    if (localStorage.getItem('profilePhoto')) localStorage.setItem('labPhotoDirty', '1');
    writeJSON('labProfile', p);
    setProfile(p);
  }, []);

  const leaveLab = useCallback(async () => {
    await labApi.leaveLab();
    ['labProfile', 'labSynced', 'labPendingDeletes', 'labRules', 'labPhotoDirty'].forEach(k => localStorage.removeItem(k));
    setProfile(null);
    setBoard(null);
    setLabRules(null);
  }, []);

  // The photo lives on this device; it is sent to the lab at the next sync.
  const setPhoto = useCallback((dataUrl) => {
    try {
      if (dataUrl) localStorage.setItem('profilePhoto', dataUrl);
      else localStorage.removeItem('profilePhoto');
      localStorage.setItem('labPhotoDirty', '1');
    } catch { /* storage unavailable */ }
    setPhotoState(dataUrl);
    sync();
  }, [sync]);

  const labValue = {
    configured: labApi.labConfigured,
    joined, profile, rules, labName: labRules?.name ?? null,
    today, myTotals, mySummary, board, status: labStatus,
    photo, setPhoto, joinLab, leaveLab, sync,
  };

  return (
    <CategoriesCtx.Provider value={{ categories, setCategories, getCategoryColor, activeCategory, setActiveCategory }}>
      <SessionsCtx.Provider value={{ sessions, addSession, deleteSession }}>
        <LabCtx.Provider value={labValue}>
          {children}
        </LabCtx.Provider>
      </SessionsCtx.Provider>
    </CategoriesCtx.Provider>
  );
}

export const useCategories = () => useContext(CategoriesCtx);
export const useSessions = () => useContext(SessionsCtx);
export const useLab = () => useContext(LabCtx);
