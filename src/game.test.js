import { describe, it, expect } from 'vitest';
import { memberSummary } from './challenge';
import { badges, dailyQuests, labTitles, levelOf, longestStreak, teamGoal, weeklyQuests, xpOf } from './game';

const rules = { dailyGoalMin: 30, hasGoal: true, weekdaysOnly: true, startDay: null };
const free = { dailyGoalMin: 5, hasGoal: false, weekdaysOnly: true, startDay: null };
const M = 60;
const THU = '2026-11-19';
const at = (day, hour, mins, extra = {}) => {
  const start = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime();
  return { id: `${day}-${hour}`, start, end: start + mins * 60000, duration: mins * M, day, category: 'Writing', endType: 'complete', ...extra };
};

describe('levels', () => {
  it('gives 1 XP a minute and 20 per goal day', () => {
    const s = memberSummary({ '2026-11-18': 30 * M, [THU]: 10 * M }, THU, rules);
    expect(xpOf(s)).toBe(40 + 20);
  });
  it('steps through levels', () => {
    expect(levelOf(0)).toMatchObject({ level: 1, into: 0, span: 100, toNext: 100 });
    expect(levelOf(99).level).toBe(1);
    expect(levelOf(100).level).toBe(2);
    expect(levelOf(650)).toMatchObject({ level: 4, into: 50, span: 400 });
  });
});

describe('longestStreak', () => {
  it('finds the best run and skips empty weekends', () => {
    const totals = {
      '2026-11-05': 30 * M, '2026-11-06': 30 * M, '2026-11-09': 30 * M, // Thu Fri Mon
      '2026-11-11': 30 * M, // Wed, after a missed Tuesday
    };
    expect(longestStreak(totals, THU, rules)).toBe(3);
    expect(longestStreak({}, THU, rules)).toBe(0);
  });
});

describe('dailyQuests', () => {
  it('tracks show up and the goal', () => {
    const q = dailyQuests([at(THU, 11, 12)], { [THU]: 12 * M }, THU, rules);
    expect(q).toHaveLength(3);
    expect(q[0]).toMatchObject({ id: 'show', done: true });
    expect(q[1]).toMatchObject({ id: 'goal', done: false });
    expect(q[1].progress).toBeCloseTo(0.4);
  });
  it('has no goal line for someone without a goal', () => {
    const q = dailyQuests([at(THU, 11, 12)], { [THU]: 12 * M }, THU, free);
    expect(q.map(x => x.id)).not.toContain('goal');
    expect(q).toHaveLength(2);
  });
  it('rotates the bonus challenge from day to day', () => {
    const ids = new Set(['2026-11-16', '2026-11-17', '2026-11-18', THU, '2026-11-20']
      .map(d => dailyQuests([], {}, d, rules)[2].id));
    expect(ids.size).toBe(5);
  });
});

describe('weeklyQuests', () => {
  it('counts weekdays at goal, with nothing about weekends', () => {
    const totals = { '2026-11-16': 30 * M, '2026-11-17': 45 * M, '2026-11-21': 10 * M };
    const quests = weeklyQuests(totals, '2026-11-21', rules);
    const [perfect, volume] = quests;
    expect(quests).toHaveLength(2);
    expect(perfect.progress).toBeCloseTo(0.4);
    expect(volume.done).toBe(false);
  });
});

describe('badges', () => {
  it('earns what the history shows', () => {
    const sessions = [at('2026-11-16', 7, 30), at('2026-11-17', 22, 95), at('2026-11-18', 12, 30)];
    const totals = { '2026-11-16': 30 * M, '2026-11-17': 95 * M, '2026-11-18': 30 * M };
    const earned = badges(sessions, totals, THU, rules).filter(b => b.earned).map(b => b.id);
    expect(earned.sort()).toEqual(['early', 'first', 'long', 'owl', 's3'].sort());
  });
  it('spots a comeback and a perfect week', () => {
    const totals = {};
    ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-18']
      .forEach(d => { totals[d] = 30 * M; });
    const earned = badges([], totals, THU, rules).filter(b => b.earned).map(b => b.id);
    expect(earned).toContain('week');
    expect(earned).toContain('back');
    expect(earned).not.toContain('first');
  });
});

describe('lab', () => {
  const row = (id, totals) => ({ id, name: id, ...memberSummary(totals, THU, rules) });
  const rows = [
    row('a', { '2026-11-17': 30 * M, '2026-11-18': 30 * M, [THU]: 30 * M }),
    row('b', { '2026-11-18': 120 * M }),
    row('c', {}),
  ];
  it('hands out the week\'s titles', () => {
    const t = Object.fromEntries(labTitles(rows).map(x => [x.id, x.memberId]));
    expect(t).toEqual({ streak: 'a', week: 'b', regular: 'a', day: 'b' });
    expect(labTitles([rows[0]])).toEqual([]);
  });
  it('adds up the team goal from each person\'s own goal', () => {
    const own = [{ ...rows[0], goalSecs: 45 * M }, { ...rows[1], goalSecs: 5 * M }, rows[2]];
    expect(teamGoal(own, rules).target).toBe((45 + 5 + 30) * M * 5);
    const g = teamGoal(rows, rules);
    expect(g.target).toBe(3 * 30 * M * 5);
    expect(g.done).toBe(210 * M);
  });
});
