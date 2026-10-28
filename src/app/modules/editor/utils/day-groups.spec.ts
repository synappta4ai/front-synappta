import { daysAgo, groupByDay } from './day-groups';

describe('day groups', () => {
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

  it('groups by local day, newest first, keeping the incoming order inside a day', () => {
    const items = [
      { id: 'a', at: at(2026, 10, 27, 15) },
      { id: 'b', at: at(2026, 10, 27, 9) },
      { id: 'c', at: at(2026, 10, 26, 22) },
      { id: 'd', at: at(2026, 10, 24, 8) },
      { id: 'e', at: at(2026, 10, 26, 1) },
    ];
    const groups = groupByDay(items, (i) => i.at);
    expect(groups.map((g) => g.key)).toEqual(['2026-10-27', '2026-10-26', '2026-10-24']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['c', 'e']);
  });

  it('sorts groups even when the input is not ordered, and skips invalid dates', () => {
    const groups = groupByDay(
      [{ at: at(2026, 10, 1) }, { at: 'not a date' }, { at: at(2026, 10, 5) }],
      (i) => i.at,
    );
    expect(groups.map((g) => g.key)).toEqual(['2026-10-05', '2026-10-01']);
    expect(groupByDay([], () => '')).toEqual([]);
  });

  it('counts calendar days ago', () => {
    const today = new Date(2026, 9, 27, 0, 5);
    expect(daysAgo(new Date(2026, 9, 27, 23), today)).toBe(0);
    expect(daysAgo(new Date(2026, 9, 26, 23, 59), today)).toBe(1);
    expect(daysAgo(new Date(2026, 9, 20), today)).toBe(7);
  });
});
