import { describe, expect, it } from 'vitest';
import { defaultPreviewDomain } from './previewDomain';

describe('defaultPreviewDomain', () => {
	it('is app. under the host name, lower-cased', () => {
		expect(defaultPreviewDomain('https://Cluster.Example.com:9925/')).toBe('app.cluster.example.com');
	});

	it.each([
		'http://localhost:9925/',
		'http://127.0.0.1:9925/',
		'http://[::1]:9925/',
		undefined,
		'not a url',
	])('has none for %j, which is not a host name', (audience) => {
		expect(defaultPreviewDomain(audience)).toBeUndefined();
	});
});
