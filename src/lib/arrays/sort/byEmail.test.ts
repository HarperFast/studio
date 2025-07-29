import { sortByEmail } from '@/lib/arrays/sort/byEmail';
import { describe, expect, it } from 'vitest';

describe('sortByEmail', () => {
	it('should sort objects by email in ascending order', () => {
		const items = [
			{ email: 'john@example.com' },
			{ email: 'alice@example.com' },
			{ email: 'zack@example.com' },
			{ email: 'bob@example.com' },
		];

		items.sort(sortByEmail);

		expect(items.map(item => item.email)).toEqual([
			'alice@example.com',
			'bob@example.com',
			'john@example.com',
			'zack@example.com',
		]);
	});

	it('should handle case sensitivity correctly', () => {
		const items = [
			{ email: 'John@example.com' },
			{ email: 'alice@example.com' },
			{ email: 'Bob@example.com' },
		];

		items.sort(sortByEmail);

		// Capital letters come before lowercase in standard string comparison
		expect(items.map(item => item.email)).toEqual([
			'Bob@example.com',
			'John@example.com',
			'alice@example.com',
		]);
	});

	it('should handle email addresses with different domains', () => {
		const items = [
			{ email: 'user@example.org' },
			{ email: 'user@example.com' },
			{ email: 'user@example.net' },
		];

		items.sort(sortByEmail);

		expect(items.map(item => item.email)).toEqual([
			'user@example.com',
			'user@example.net',
			'user@example.org',
		]);
	});

	it('should handle empty email strings', () => {
		const items = [
			{ email: 'john@example.com' },
			{ email: '' },
			{ email: 'alice@example.com' },
		];

		items.sort(sortByEmail);

		expect(items.map(item => item.email)).toEqual([
			'',
			'alice@example.com',
			'john@example.com',
		]);
	});
});
