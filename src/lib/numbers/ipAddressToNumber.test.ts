import { describe, expect, it } from 'vitest';
import { ipAddressToNumber } from './ipAddressToNumber';

describe('ipAddressToNumber', () => {
  it('maps common IPv4 addresses to their unsigned 32-bit numbers', () => {
    const cases: Array<[string, number]> = [
      ['0.0.0.0', 0],
      ['0.0.0.1', 1],
      ['0.0.1.0', 256],
      ['0.1.0.0', 65536],
      ['1.0.0.0', 16777216],
      ['127.0.0.1', 2130706433],
      ['127.255.255.255', 2147483647],
      ['128.0.0.0', 2147483648],
      ['255.255.255.255', 4294967295],
    ];

    for (const [ip, expected] of cases) {
      expect(ipAddressToNumber(ip), ip).toBe(expected);
    }
  });

  it('is monotonically increasing across the 127.x.x.x → 128.0.0.0 boundary', () => {
    const a = ipAddressToNumber('127.255.255.255');
    const b = ipAddressToNumber('128.0.0.0');
    expect(a).toBeLessThan(b);
  });
});
