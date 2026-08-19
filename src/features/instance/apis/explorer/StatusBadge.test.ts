import { httpStatusColorClass } from '@/features/instance/apis/explorer/StatusBadge';
import { describe, expect, it } from 'vitest';

describe('httpStatusColorClass', () => {
	it('maps each HTTP status class to its tint, at the boundaries', () => {
		expect(httpStatusColorClass(200)).toContain('text-green');
		expect(httpStatusColorClass(299)).toContain('text-green');
		expect(httpStatusColorClass(300)).toContain('text-blue');
		expect(httpStatusColorClass(399)).toContain('text-blue');
		expect(httpStatusColorClass(400)).toContain('text-yellow');
		expect(httpStatusColorClass(499)).toContain('text-yellow');
		expect(httpStatusColorClass(500)).toContain('text-red');
	});

	it('treats a 0 / non-finite "no response" as red', () => {
		expect(httpStatusColorClass(0)).toContain('text-red');
		expect(httpStatusColorClass(Number.NaN)).toContain('text-red');
	});
});
