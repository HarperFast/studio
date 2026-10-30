import { describe, expect, it } from 'vitest';
import { defaultPreviewDomain, previewAudience } from './previewAudience';

describe('previewAudience', () => {
	it.each([
		['https://cluster.example.com:9925/', 'https://cluster.example.com:9925/'],
		['https://cluster.example.com:9925', 'https://cluster.example.com:9925/'],
		['http://localhost:9925', 'http://localhost:9925/'],
		// A URL the browser is connected to, so no port means the protocol's, which Harper needs written out.
		['https://cluster.example.com', 'https://cluster.example.com:443/'],
		['https://cluster.example.com:443/', 'https://cluster.example.com:443/'],
		['http://cluster.example.com/', 'http://cluster.example.com:80/'],
		['https://example.com/operations', 'https://example.com:443/operations/'],
		['https://user:pass@cluster.example.com:9925/?a=b#c', 'https://cluster.example.com:9925/'],
	])('turns %s into %s', (url, expected) => {
		expect(previewAudience(url)).toBe(expected);
	});

	it.each([
		'https://stage.studio.harperfabric.com/Cluster/clu-1/operation',
		'https://stage.studio.harperfabric.com/HDBInstance/ins-1/operation',
		'not a url',
		'',
		null,
		undefined,
		'ftp://cluster.example.com/',
	])('refuses %j, whose token could never match', (url) => {
		expect(previewAudience(url)).toBeUndefined();
	});
});

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
