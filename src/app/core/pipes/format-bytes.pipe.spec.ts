import { FormatBytesPipe, formatBytesValue } from './format-bytes.pipe';

describe('formatBytesValue', () => {
  it('should render bytes without decimals', () => {
    expect(formatBytesValue(512)).toBe('512 B');
  });

  it('should scale to KB/MB/GB with one decimal under 10', () => {
    expect(formatBytesValue(2048)).toBe('2 KB');
    expect(formatBytesValue(1536)).toBe('1.5 KB');
    expect(formatBytesValue(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('should return an em dash for invalid values', () => {
    expect(formatBytesValue(null)).toBe('—');
    expect(formatBytesValue(0)).toBe('—');
    expect(formatBytesValue(Number.NaN)).toBe('—');
  });
});

describe('FormatBytesPipe', () => {
  it('should delegate to formatBytesValue', () => {
    expect(new FormatBytesPipe().transform(1024)).toBe('1 KB');
  });
});
