import { describe, it, expect } from 'vitest';
import {
  addDays, currentStreak, dayKey, formatMinutes, isWeekend, isWriting,
  memberSummary, weekDays, writingByDay,
} from './challenge';

const rules = { dailyGoalMin: 30, weekdaysOnly: true, startDay: null };
const MIN30 = 30 * 60;

// Thursday 19 November 2026.
const THU = '2026-11-19';

describe('days', () => {
  it('formats and steps local days', () => {
    expect(dayKey(new Date(2026, 10, 19, 23, 59))).toBe(THU);
    expect(addDays(THU, 1)).toBe('2026-11-20');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(isWeekend('2026-11-21')).toBe(true);
    expect(isWeekend(THU)).toBe(false);
  });

  it('starts the week on Monday', () => {
    expect(weekDays(THU)[0]).toBe('2026-11-16');
    expect(weekDays('2026-11-22')[0]).toBe('2026-11-16');
    expect(weekDays(THU)).toHaveLength(7);
  });
});

describe('writingByDay', () => {
  it('counts only the Writing category', () => {
    const totals = writingByDay([
      { category: 'Writing', duration: 600, day: THU },
      { category: ' writing ', duration: 300, day: THU },
      { category: 'General', duration: 999, day: THU },
      { category: 'Writing', duration: 60, start: new Date(2026, 10, 18, 9).getTime() },
    ]);
    expect(totals).toEqual({ [THU]: 900, '2026-11-18': 60 });
    expect(isWriting(undefined)).toBe(false);
  });
});

describe('currentStreak', () => {
  it('is 0 with nothing', () => {
    expect(currentStreak({}, THU, rules)).toBe(0);
  });

  it('keeps yesterday\'s streak while today is in progress', () => {
    const totals = { '2026-11-17': MIN30, '2026-11-18': MIN30, [THU]: 60 };
    expect(currentStreak(totals, THU, rules)).toBe(2);
  });

  it('adds today once the goal is met', () => {
    const totals = { '2026-11-17': MIN30, '2026-11-18': MIN30, [THU]: MIN30 };
    expect(currentStreak(totals, THU, rules)).toBe(3);
  });

  it('breaks on a missed weekday', () => {
    const totals = { '2026-11-16': MIN30, '2026-11-18': MIN30 };
    expect(currentStreak(totals, THU, rules)).toBe(1);
  });

  it('skips an empty weekend when weekdaysOnly', () => {
    const totals = { '2026-11-13': MIN30, '2026-11-16': MIN30 };
    expect(currentStreak(totals, '2026-11-16', rules)).toBe(2);
    expect(currentStreak(totals, '2026-11-16', { ...rules, weekdaysOnly: false })).toBe(1);
  });

  it('counts a weekend day that was written', () => {
    const totals = { '2026-11-13': MIN30, '2026-11-14': MIN30, '2026-11-16': MIN30 };
    expect(currentStreak(totals, '2026-11-16', rules)).toBe(3);
  });

  it('ignores days before the challenge start', () => {
    const totals = { '2026-11-17': MIN30, '2026-11-18': MIN30, [THU]: MIN30 };
    expect(currentStreak(totals, THU, { ...rules, startDay: '2026-11-18' })).toBe(2);
  });
});

describe('memberSummary', () => {
  it('summarises today, week and total', () => {
    const totals = { '2026-11-09': MIN30, '2026-11-17': 3600, [THU]: 600 };
    const s = memberSummary(totals, THU, rules);
    expect(s.todaySecs).toBe(600);
    expect(s.todayMet).toBe(false);
    expect(s.weekSecs).toBe(4200);
    expect(s.totalSecs).toBe(4200 + MIN30);
    expect(s.daysMet).toBe(2);
    expect(s.week.map(d => d.met)).toEqual([false, true, false, false, false, false, false]);
    expect(s.week[4].future).toBe(true);
    expect(s.week[5].optional).toBe(true);
  });
});

describe('formatMinutes', () => {
  it('reads naturally', () => {
    expect(formatMinutes(59)).toBe('0 min');
    expect(formatMinutes(25 * 60)).toBe('25 min');
    expect(formatMinutes(3600)).toBe('1 h');
    expect(formatMinutes(3600 + 5 * 60)).toBe('1 h 05');
  });
});

describe('rulesFor', () => {
  it('uses a person\'s own goal, or just showing up', async () => {
    const { rulesFor, DEFAULT_RULES } = await import('./challenge');
    expect(rulesFor(DEFAULT_RULES, 45)).toMatchObject({ dailyGoalMin: 45, hasGoal: true });
    expect(rulesFor(DEFAULT_RULES, null)).toMatchObject({ dailyGoalMin: 5, hasGoal: false });
    expect(rulesFor(DEFAULT_RULES, 0).hasGoal).toBe(false);
  });
});
