import { describe, expect, it } from 'vitest';
import { type NamedTransformKey, namedTransforms } from '../../pipeline/transforms.ts';

describe('namedTransforms registry', () => {
	it('exports percent-of-core that multiplies by 100', () => {
		expect(namedTransforms['percent-of-core'](0.5)).toBe(50);
		expect(namedTransforms['percent-of-core'](11.46)).toBe(1146);
	});

	it('type NamedTransformKey narrows to registry keys', () => {
		const valid: NamedTransformKey = 'percent-of-core';
		expect(valid).toBe('percent-of-core');
	});
});
