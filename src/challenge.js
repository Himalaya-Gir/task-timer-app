// Pure logic for the writing challenge: which sessions count, daily totals,
// streaks. No React, no storage, no network, so it is easy to test.

export const DEFAULT_RULES = { dailyGoalMin: 30, weekdaysOnly: true, startDay: null };

// Local calendar day of a timestamp, as 'YYYY-MM-DD'.
export function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Noon avoids daylight-saving edges when stepping from day to day.
const atNoon = (key) => new Date(`${key}T12:00:00`);

export function addDays(key, n) {
  const d = atNoon(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export const isWeekend = (key) => [0, 6].includes(atNoon(key).getDay());

// Only the Writing category counts for the challenge (and is shared with the lab).
export const isWriting = (category) =>
  typeof category === 'string' && category.trim().toLowerCase() === 'writing';

export const sessionDay = (s) => s.day ?? dayKey(s.start);

// { 'YYYY-MM-DD': seconds } of writing.
export function writingByDay(sessions) {
  const totals = {};
  for (const s of sessions) {
    if (!isWriting(s.category)) continue;
    const key = sessionDay(s);
    totals[key] = (totals[key] || 0) + s.duration;
  }
  return totals;
}

export const metGoal = (seconds, rules) => (seconds || 0) >= rules.dailyGoalMin * 60;

// Number of days in a row the goal was met, ending today.
// Today does not break the streak while it is still in progress. With
// weekdaysOnly, a weekend without writing is skipped; a weekend with enough
// writing still adds a day.
export function currentStreak(totals, today, rules) {
  const counts = (key) => !rules.startDay || key >= rules.startDay;
  let streak = 0;
  let key = today;
  if (!metGoal(totals[key], rules)) key = addDays(key, -1);
  for (let guard = 0; guard < 3660 && counts(key); guard++) {
    if (metGoal(totals[key], rules)) streak++;
    else if (!(rules.weekdaysOnly && isWeekend(key))) break;
    key = addDays(key, -1);
  }
  return streak;
}

// The 7 days of the week containing `today`, Monday first.
export function weekDays(today) {
  const dow = (atNoon(today).getDay() + 6) % 7;
  const monday = addDays(today, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// One leaderboard row from a member's daily totals.
export function memberSummary(totals, today, rules) {
  const week = weekDays(today);
  const counted = Object.entries(totals).filter(([k]) => !rules.startDay || k >= rules.startDay);
  return {
    todaySecs: totals[today] || 0,
    todayMet: metGoal(totals[today], rules),
    streak: currentStreak(totals, today, rules),
    weekSecs: week.reduce((a, k) => a + (totals[k] || 0), 0),
    totalSecs: counted.reduce((a, [, v]) => a + v, 0),
    daysMet: counted.filter(([, v]) => metGoal(v, rules)).length,
    week: week.map(k => ({
      day: k,
      secs: totals[k] || 0,
      met: metGoal(totals[k], rules),
      future: k > today,
      optional: rules.weekdaysOnly && isWeekend(k),
    })),
  };
}

export function formatMinutes(secs) {
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`;
}
