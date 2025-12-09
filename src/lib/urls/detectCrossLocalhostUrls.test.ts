import { describe, expect, it } from 'vitest';
import { CrossLocalhostIssueType, detectCrossLocalhostUrls } from './detectCrossLocalhostUrls';

describe('detectCrossLocalhostUrls', () => {
	const chrome = 'Chrome';
	const firefox = 'Firefox';
	const safari = 'Safari';

	it('returns null when operationsUrl is null', () => {
		expect(detectCrossLocalhostUrls(chrome, 'localhost', null)).toBe(null);
	});

	it('returns null when operationsUrl is undefined', () => {
		expect(detectCrossLocalhostUrls(chrome, 'localhost', undefined)).toBe(null);
	});

	it('returns null when operationsUrl is empty string', () => {
		expect(detectCrossLocalhostUrls(chrome, 'localhost', '')).toBe(null);
	});

	it('returns null when browserHostname is missing', () => {
		expect(detectCrossLocalhostUrls(chrome, undefined, 'http://localhost:3000')).toBe(null);
	});

	it('returns null when browserHostname is not localhost or 127.0.0.1', () => {
		expect(detectCrossLocalhostUrls(chrome, 'example.com', 'http://localhost:3000')).toBe(null);
		expect(detectCrossLocalhostUrls(chrome, 'my.dev', 'http://127.0.0.1:3000')).toBe(null);
	});

	it('returns true when browser is localhost and operationsUrl is 127.0.0.1', () => {
		expect(detectCrossLocalhostUrls(chrome, 'localhost', 'http://127.0.0.1:3000')).toBe(
			CrossLocalhostIssueType.MixedLoopback,
		);
	});

	it('returns true when browser is 127.0.0.1 and operationsUrl is localhost', () => {
		expect(detectCrossLocalhostUrls(chrome, '127.0.0.1', 'http://localhost:8080')).toBe(
			CrossLocalhostIssueType.MixedLoopback,
		);
	});

	it('returns null when both hostnames match (localhost)', () => {
		expect(detectCrossLocalhostUrls(chrome, 'localhost', 'http://localhost:8080')).toBe(null);
	});

	it('returns null when both hostnames match (127.0.0.1)', () => {
		expect(detectCrossLocalhostUrls(chrome, '127.0.0.1', 'http://127.0.0.1:8080')).toBe(null);
	});

	it('ignores port differences and only compares hostname', () => {
		// Hostnames differ -> true
		expect(detectCrossLocalhostUrls(chrome, 'localhost', 'http://127.0.0.1:1234')).toBe(
			CrossLocalhostIssueType.MixedLoopback,
		);
		// Hostnames same -> null even if ports different
		expect(detectCrossLocalhostUrls(chrome, 'localhost', 'http://localhost:1234')).toBe(null);
	});

	it('returns true when connecting from the cloud to local outside Chrome and Firefox', () => {
		expect(detectCrossLocalhostUrls(chrome, 'prod.com', 'http://127.0.0.1:8080')).toBe(null);
		expect(detectCrossLocalhostUrls(firefox, 'prod.com', 'http://127.0.0.1:8080')).toBe(null);
		expect(detectCrossLocalhostUrls(safari, 'prod.com', 'http://127.0.0.1:8080')).toBe(
			CrossLocalhostIssueType.InsecureCookieOutsideChromeAndFirefox,
		);
	});
});
