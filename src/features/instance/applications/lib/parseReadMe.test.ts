import { describe, expect, it } from 'vitest';
import { parseReadMe } from './parseReadMe';


describe('parseReadMe', () => {
	const resp = (project: string = 'Example') => ({ project });
	const baseURL = 'https://example.com:9925';

	it('replaces localhost:9926 links with base host derived from 9925 URL (no trailing slash)', () => {
		const input = [
			'Visit http://localhost:9926',
			'API: http://localhost:9926/api',
			'Secure: https://localhost:9926/docs',
		].join('\n');

		const output = parseReadMe(input, baseURL, resp());

		expect(output).toContain('Visit https://example.com');
		expect(output).toContain('API: https://example.com/api');
		expect(output).toContain('Secure: https://example.com/docs');
	});

	it('replaces localhost:9926 links when base 9925 URL ends with a trailing slash', () => {
		const input = 'Go to http://localhost:9926/path';

		const output = parseReadMe(input, baseURL, resp());

		expect(output).toBe('Go to https://example.com/path');
	});

	it('replaces the project placeholder when response.project is provided', () => {
		const input = 'Welcome to Your New Harper Fabric App!';

		const output = parseReadMe(input, baseURL, resp('My App'));

		expect(output).toBe('Welcome to My App!');
	});

	it('does not alter unrelated hosts or content', () => {
		const input = [
			'External link: https://example.com/page',
			'No placeholder here.',
		].join('\n');

		const output = parseReadMe(input, baseURL, resp());

		expect(output).toBe(input);
	});

	it('is idempotent when run multiple times with same inputs', () => {
		const input = 'http://localhost:9926/a and Your New Harper Fabric App';

		const once = parseReadMe(input, baseURL, resp('Proj'));
		const twice = parseReadMe(once, baseURL, resp('Proj'));

		expect(twice).toBe(once);
	});
});
