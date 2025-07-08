import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
	it('should combine class names correctly', () => {
		expect(cn('class1', 'class2')).toBe('class1 class2');
	});

	it('should handle conditional class names', () => {
		const condition = true;
		expect(cn('class1', condition && 'class2')).toBe('class1 class2');
		expect(cn('class1', !condition && 'class2')).toBe('class1');
	});

	it('should handle array of class names', () => {
		expect(cn('class1', ['class2', 'class3'])).toBe('class1 class2 class3');
	});

	it('should handle object notation for conditional classes', () => {
		expect(cn('class1', { class2: true, class3: false })).toBe('class1 class2');
	});

	it('should merge Tailwind utility classes correctly', () => {
		expect(cn('p-4', 'p-5')).toBe('p-5');
		expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
	});
});
