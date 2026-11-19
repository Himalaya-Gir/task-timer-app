// Talks to the shared lab database (Supabase). Everything here is optional:
// without the two VITE_SUPABASE_* variables the app stays local-only.

import { isWriting, sessionDay } from './challenge';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

export const labConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

let clientPromise = null;

// Loaded on demand so local-only users never download the library.
function getClient() {
  if (!labConfigured) throw new Error('The lab database is not set up.');
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY));
  return clientPromise;
}

const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// Each browser gets its own anonymous account: no email, no password.
async function signedIn() {
  const supabase = await getClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) check(await supabase.auth.signInAnonymously());
  return supabase;
}

export async function joinLab(name, code) {
  const supabase = await signedIn();
  check(await supabase.rpc('join_lab', { p_name: name, p_code: code }));
}

// fields: { avatar } and/or { goal_min }
export async function updateMember(fields) {
  const supabase = await signedIn();
  const { data } = await supabase.auth.getUser();
  if (data.user) check(await supabase.from('members').update(fields).eq('id', data.user.id));
}

export async function leaveLab() {
  const supabase = await signedIn();
  const { data } = await supabase.auth.getUser();
  if (data.user) check(await supabase.from('members').delete().eq('id', data.user.id));
  await supabase.auth.signOut();
}

export async function fetchRules() {
  const supabase = await getClient();
  const lab = check(await supabase.from('lab').select('*').eq('id', 1).maybeSingle());
  if (!lab) return null;
  return {
    name: lab.name,
    suggestedGoalMin: lab.daily_goal_min,
    weekdaysOnly: lab.weekdays_only,
    startDay: lab.start_day,
  };
}

// Send writing sessions not sent yet; remove the ones deleted here.
export async function pushSessions(sessions, syncedIds, pendingDeletes) {
  const supabase = await signedIn();
  const fresh = sessions.filter(s => s.id && isWriting(s.category) && !syncedIds.has(s.id));
  if (fresh.length) {
    check(await supabase.from('sessions').upsert(fresh.map(s => ({
      id: s.id,
      day: sessionDay(s),
      started_at: new Date(s.start).toISOString(),
      duration: Math.min(86400, Math.max(1, Math.round(s.duration))),
      end_type: s.endType ?? null,
    }))));
  }
  if (pendingDeletes.length) {
    check(await supabase.from('sessions').delete().in('id', pendingDeletes));
  }
  return fresh.map(s => s.id);
}

// → { myId, members: [{ id, name, totals: { day: seconds } }] }
export async function fetchBoard(startDay) {
  const supabase = await signedIn();
  const { data: auth } = await supabase.auth.getUser();
  const members = check(await supabase.from('members').select('id,name,avatar,goal_min').order('joined_at'));

  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('daily_totals').select('user_id,day,seconds')
      .order('day').order('user_id').range(from, from + 999);
    if (startDay) q = q.gte('day', startDay);
    const page = check(await q);
    rows.push(...page);
    if (page.length < 1000) break;
  }

  const byMember = new Map(members.map(m => [m.id, { id: m.id, name: m.name, avatar: m.avatar, goalMin: m.goal_min, totals: {} }]));
  for (const r of rows) {
    const m = byMember.get(r.user_id);
    if (m) m.totals[r.day] = r.seconds;
  }
  return { myId: auth.user?.id ?? null, members: [...byMember.values()] };
}
