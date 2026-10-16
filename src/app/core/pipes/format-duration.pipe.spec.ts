import { FormatDurationPipe, formatDurationValue } from './format-duration.pipe';

describe('formatDurationValue', () => {
  it('should render whole seconds without decimals', () => {
    expect(formatDurationValue(45)).toBe('45s');
  });

  it('should keep one decimal for fractional seconds', () => {
    expect(formatDurationValue(2.5)).toBe('2.5s');
  });

  it('should render minutes and hours', () => {
    expect(formatDurationValue(192)).toBe('3m 12s');
    expect(formatDurationValue(120)).toBe('2m');
    expect(formatDurationValue(3900)).toBe('1h 5m');
  });

  it('should render milliseconds under a second', () => {
    expect(formatDurationValue(850, 'ms')).toBe('850ms');
    expect(formatDurationValue(2500, 'ms')).toBe('2.5s');
  });

  it('should return an em dash for invalid values', () => {
    expect(formatDurationValue(null)).toBe('—');
    expect(formatDurationValue(0)).toBe('—');
    expect(formatDurationValue(-3)).toBe('—');
  });
});

describe('FormatDurationPipe', () => {
  it('should delegate to formatDurationValue', () => {
    expect(new FormatDurationPipe().transform(90)).toBe('1m 30s');
  });
});
