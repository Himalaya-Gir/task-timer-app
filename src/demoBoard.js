// Sample lab, shown at #/lab?demo so the page can be seen without a database.
import { addDays, isWeekend } from './challenge';

const PEOPLE = [
  ['Ada', 0.95, 48], ['Noam', 0.8, 35], ['Rosalind', 0.9, 62],
  ['Alan', 0.55, 30], ['Grace', 0.7, 41], ['Santiago', 0.35, 25],
];

// Small deterministic generator: the demo looks the same on every visit.
function rng(seed) {
  let x = seed;
  return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
}

export function demoBoard(today) {
  const members = PEOPLE.map(([name, regularity, minutes], i) => {
    const rand = rng(i + 7);
    const totals = {};
    for (let back = 24; back >= 0; back--) {
      const day = addDays(today, -back);
      const chance = isWeekend(day) ? regularity * 0.25 : regularity;
      if (rand() < chance) totals[day] = Math.round(minutes * (0.6 + rand() * 0.9)) * 60;
    }
    return { id: `demo-${i}`, name, totals };
  });
  return { myId: 'demo-0', members };
}
