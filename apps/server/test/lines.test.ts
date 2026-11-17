import { describe, expect, it } from 'vitest';
import { asian, handicap, over, payoutFactor, under } from '../src/sports/lines.js';

describe('азиатские линии', () => {
  it('половинные тоталы', () => {
    expect(over(3, 2.5)).toBe('win');
    expect(over(2, 2.5)).toBe('lose');
    expect(under(2, 2.5)).toBe('win');
  });
  it('целые тоталы — возврат', () => {
    expect(over(2, 2)).toBe('void');
    expect(under(2, 2)).toBe('void');
    expect(over(3, 2)).toBe('win');
  });
  it('четвертные тоталы', () => {
    expect(over(2, 2.25)).toBe('half_lose');
    expect(over(3, 2.25)).toBe('win');
    expect(over(2, 1.75)).toBe('half_win');
    expect(under(2, 2.25)).toBe('half_win');
    expect(under(2, 1.75)).toBe('half_lose');
  });
  it('форы', () => {
    expect(handicap(1, 0, -0.5)).toBe('win');
    expect(handicap(1, 0, -1)).toBe('void');
    expect(handicap(1, 0, -1.5)).toBe('lose');
    expect(handicap(1, 0, -0.75)).toBe('half_win');
    expect(handicap(1, 1, -0.25)).toBe('half_lose');
    expect(handicap(0, 1, 0.75)).toBe('half_lose');
    expect(handicap(0, 1, 1.25)).toBe('half_win');
    expect(handicap(2, 2, 0)).toBe('void');
  });
  it('множители выплат', () => {
    expect(payoutFactor('win', 2)).toBe(2);
    expect(payoutFactor('lose', 2)).toBe(0);
    expect(payoutFactor('void', 2)).toBe(1);
    expect(payoutFactor('half_win', 2)).toBe(1.5);
    expect(payoutFactor('half_lose', 2)).toBe(0.5);
  });
  it('asian не делит половинные линии', () => {
    expect(asian(-1.5, (l) => 2 + l)).toBe('win');
  });
});
