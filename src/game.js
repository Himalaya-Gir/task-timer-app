// The game layer on top of the challenge: XP and levels, small daily and
// weekly challenges, badges, and the lab's weekly titles. Pure functions.

import { addDays, formatMinutes, isWeekend, isWriting, metGoal, sessionDay, weekDays } from './challenge';

// ── XP and levels ─────────────────────────────────────────────────────────
// 1 XP per minute written, plus 20 for each day the goal is met. Computed
// from daily totals only, so it can be shown for every lab member.
export const xpOf = (summary) => Math.floor(summary.totalSecs / 60) + 20 * summary.daysMet;

const xpForLevel = (n) => 50 * n * (n - 1); // level 1: 0, 2: 100, 3: 300, 4: 600

export function levelOf(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, into: xp - floor, span: next - floor, toNext: next - xp };
}

// ── Streak history ────────────────────────────────────────────────────────
export function longestStreak(totals, today, rules) {
  const days = Object.keys(totals).sort();
  if (!days.length) return 0;
  let best = 0;
  let run = 0;
  for (let key = days[0], guard = 0; key <= today && guard < 3660; key = addDays(key, 1), guard++) {
    if (metGoal(totals[key], rules)) { run++; best = Math.max(best, run); }
    else if (!(rules.weekdaysOnly && isWeekend(key)) && key !== today) run = 0;
  }
  return best;
}

const quest = (id, title, detail, value, target) => ({
  id, title, detail,
  done: value >= target,
  progress: Math.max(0, Math.min(1, target ? value / target : 0)),
});

const dayNumber = (key) => Math.round(new Date(`${key}T12:00:00`).getTime() / 86400000);

// ── Today's three challenges ──────────────────────────────────────────────
// Two fixed ones and a bonus that changes every day. `totals` should already
// include the session in progress.
export function dailyQuests(sessions, totals, today, rules) {
  const goal = rules.hasGoal ? rules.dailyGoalMin : 20;
  const mins = (totals[today] || 0) / 60;
  const mine = sessions.filter(s => isWriting(s.category) && sessionDay(s) === today);
  const longest = mine.reduce((a, s) => Math.max(a, s.duration), 0) / 60;

  const lastDay = Object.keys(totals).filter(k => k < today && totals[k] > 0).sort().pop();
  const lastMins = lastDay ? Math.floor(totals[lastDay] / 60) : 0;

  const bonus = [
    () => quest('early', 'Early start', 'Start writing before 10 am',
      mine.some(s => new Date(s.start).getHours() < 10) ? 1 : 0, 1),
    () => quest('two', 'Two sittings', 'Two sessions of 10 minutes or more',
      mine.filter(s => s.duration >= 600).length, 2),
    () => quest('deep', 'Deep session', 'One session of 25 minutes without stopping', longest, 25),
    () => quest('extra', 'Extra mile', `${goal + 15} minutes today`, mins, goal + 15),
    () => quest('beat', 'Beat your last day', `More than ${lastMins} minutes today`, mins, lastMins + 1),
  ];

  // The goal line only exists for people who chose to set a goal.
  return [
    quest('show', 'Show up', '5 minutes of writing', mins, 5),
    rules.hasGoal && quest('goal', 'Your daily goal', `${goal} minutes of writing`, mins, goal),
    bonus[dayNumber(today) % bonus.length](),
  ].filter(Boolean);
}

// ── This week's challenges ────────────────────────────────────────────────
export function weeklyQuests(totals, today, rules) {
  const week = weekDays(today);
  const weekdays = week.slice(0, 5);
  const met = weekdays.filter(k => metGoal(totals[k], rules)).length;
  const mins = week.reduce((a, k) => a + (totals[k] || 0), 0) / 60;
  const target = rules.hasGoal ? rules.dailyGoalMin * 6 : 120;
  const hours = target % 60 === 0 ? `${target / 60} hours` : `${target} minutes`;
  return [
    quest('perfect', 'Perfect week', `${rules.hasGoal ? 'Goal met' : 'Writing'} Monday to Friday (${met} of 5)`, met, 5),
    quest('volume', 'Big week', `${hours} of writing this week`, mins, target),
  ];
}

// ── Badges ────────────────────────────────────────────────────────────────
export function badges(sessions, totals, today, rules) {
  const writing = sessions.filter(s => isWriting(s.category));
  const days = Object.keys(totals);
  const hours = days.reduce((a, k) => a + totals[k], 0) / 3600;
  const best = longestStreak(totals, today, rules);
  const perfectWeek = days.some(k => weekDays(k).slice(0, 5).every(d => metGoal(totals[d], rules)));
  const comeback = days.some(k => {
    if (!metGoal(totals[k], rules)) return false;
    let prev = addDays(k, -1);
    while (rules.weekdaysOnly && isWeekend(prev)) prev = addDays(prev, -1);
    return !metGoal(totals[prev], rules) && days.some(d => d < prev && metGoal(totals[d], rules));
  });

  const b = (id, mark, name, how, earned) => ({ id, mark, name, how, earned: Boolean(earned) });
  return [
    b('first', '1', 'First words', 'Log a first writing session', writing.length > 0),
    b('s3', '3', 'Warming up', '3 days in a row', best >= 3),
    b('s7', '7', 'On a roll', '7 days in a row', best >= 7),
    b('s14', '14', 'Habit', '14 days in a row', best >= 14),
    b('s30', '30', 'Unstoppable', '30 days in a row', best >= 30),
    b('h10', '10h', 'Ten hours', '10 hours of writing in total', hours >= 10),
    b('h25', '25h', 'Twenty-five hours', '25 hours of writing in total', hours >= 25),
    b('h50', '50h', 'Fifty hours', '50 hours of writing in total', hours >= 50),
    b('week', '5/5', 'Perfect week', 'A full week, Monday to Friday', perfectWeek),
    b('long', '90', 'Marathon', '90 minutes of writing in one day', days.some(k => totals[k] >= 5400)),
    b('early', 'AM', 'Early bird', 'Start a session before 8 am',
      writing.some(s => new Date(s.start).getHours() < 8 && s.endType !== 'manual')),
    b('owl', 'PM', 'Night owl', 'Start a session after 9 pm',
      writing.some(s => new Date(s.start).getHours() >= 21 && s.endType !== 'manual')),
    b('back', 'RE', 'Comeback', 'Write again after a missed day', comeback),
  ];
}

// ── Lab: this week's titles and the team goal ─────────────────────────────
// `rows` are member summaries (memberSummary + name + id).
export function labTitles(rows) {
  if (rows.length < 2) return [];
  const top = (value) => {
    const winner = [...rows].sort((a, b) => value(b) - value(a))[0];
    return value(winner) > 0 ? winner : null;
  };
  const daysMet = (r) => r.week.filter(d => d.met).length;
  const bigDay = (r) => Math.max(...r.week.map(d => d.secs));
  return [
    { id: 'streak', title: 'Longest streak', who: top(r => r.streak), value: r => `${r.streak} ${r.streak === 1 ? 'day' : 'days'}` },
    { id: 'week', title: 'Most written', who: top(r => r.weekSecs), value: r => formatMinutes(r.weekSecs) },
    { id: 'regular', title: 'Most regular', who: top(daysMet), value: r => `${daysMet(r)} ${daysMet(r) === 1 ? 'day' : 'days'} done` },
    { id: 'day', title: 'Biggest day', who: top(bigDay), value: r => formatMinutes(bigDay(r)) },
  ].filter(t => t.who).map(t => ({ id: t.id, title: t.title, memberId: t.who.id, name: t.who.name, value: t.value(t.who) }));
}

// The lab's target is the sum of what each person aims for (their own goal,
// or just showing up), over the days that count.
export function teamGoal(rows, rules) {
  const days = rules.weekdaysOnly ? 5 : 7;
  const target = rows.reduce((a, r) => a + (r.goalSecs ?? rules.dailyGoalMin * 60), 0) * days;
  const done = rows.reduce((a, r) => a + r.weekSecs, 0);
  return { done, target, progress: target ? Math.min(1, done / target) : 0 };
}
