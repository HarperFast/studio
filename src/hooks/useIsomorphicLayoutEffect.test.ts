import { describe, expect, it } from 'vitest';
import { useEffect, useLayoutEffect } from 'react';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

describe('useIsomorphicLayoutEffect', () => {
	it('should be defined', () => {
		expect(useIsomorphicLayoutEffect).toBeDefined();
		expect(typeof useIsomorphicLayoutEffect).toBe('function');
	});

	it('should be either useLayoutEffect or useEffect', () => {
		expect(
			useIsomorphicLayoutEffect === useLayoutEffect ||
			useIsomorphicLayoutEffect === useEffect,
		).toBe(true);
	});
});
