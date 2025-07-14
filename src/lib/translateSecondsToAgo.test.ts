import { describe, expect, it } from 'vitest';
import { translateSecondsToAgo } from './translateSecondsToAgo';

describe('translateSecondsToAgo', () => {
  const now = Date.now();

  it('should return "a few seconds ago" when less than 45 seconds have elapsed', () => {
    expect(translateSecondsToAgo(0, now)).toBe('a few seconds ago');
    expect(translateSecondsToAgo(1, now)).toBe('a few seconds ago');
    expect(translateSecondsToAgo(44, now)).toBe('a few seconds ago');
  });

  it('should return "a minute ago" when between 45 and 119 seconds have elapsed', () => {
    expect(translateSecondsToAgo(45, now)).toBe('a minute ago');
    expect(translateSecondsToAgo(60, now)).toBe('a minute ago');
    expect(translateSecondsToAgo(119, now)).toBe('a minute ago');
  });

  it('should return "X minutes ago" when between 2 and 59 minutes have elapsed', () => {
    expect(translateSecondsToAgo(120, now)).toBe('2 minutes ago');
    expect(translateSecondsToAgo(180, now)).toBe('3 minutes ago');
    expect(translateSecondsToAgo(3540, now)).toBe('59 minutes ago');
  });

  it('should return "an hour ago" when between 60 and 119 minutes have elapsed', () => {
    expect(translateSecondsToAgo(3600, now)).toBe('an hour ago');
    expect(translateSecondsToAgo(3660, now)).toBe('an hour ago');
    expect(translateSecondsToAgo(7140, now)).toBe('an hour ago');
  });

  it('should return "X hours ago" when between 2 and 48 hours have elapsed', () => {
    expect(translateSecondsToAgo(7200, now)).toBe('2 hours ago');
    expect(translateSecondsToAgo(10800, now)).toBe('3 hours ago');
    expect(translateSecondsToAgo(172740, now)).toBe('47 hours ago');
  });

  it('should return a date string when more than 48 hours have elapsed', () => {
    const moreThanTwoDaysAgo = now - 49 * 60 * 60 * 1000;
    const expectedDateString = new Date(moreThanTwoDaysAgo).toLocaleString();

    expect(translateSecondsToAgo(49 * 60 * 60, moreThanTwoDaysAgo)).toBe(expectedDateString);

    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const expectedWeekAgoString = new Date(oneWeekAgo).toLocaleString();

    expect(translateSecondsToAgo(7 * 24 * 60 * 60, oneWeekAgo)).toBe(expectedWeekAgoString);
  });

  it('should handle edge cases correctly', () => {
    // Negative seconds (shouldn't happen in practice, but testing for robustness)
    expect(translateSecondsToAgo(-10, now)).toBe('a few seconds ago');

    // Exactly at the boundary values
    expect(translateSecondsToAgo(45, now)).toBe('a minute ago');
    expect(translateSecondsToAgo(120, now)).toBe('2 minutes ago');
    expect(translateSecondsToAgo(3600, now)).toBe('an hour ago');
    expect(translateSecondsToAgo(7200, now)).toBe('2 hours ago');
  });
});
