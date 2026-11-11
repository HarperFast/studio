import { describe, expect, it } from 'vitest';
import { actionsAudience, isPrivateAudience } from './actionsAudience';

describe('actionsAudience', () => {
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
		expect(actionsAudience(url)).toBe(expected);
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
		expect(actionsAudience(url)).toBeUndefined();
	});
});

describe('isPrivateAudience', () => {
	it.each([
		'http://localhost:9925/',
		'http://127.0.0.1:9925/',
		'http://[::1]:9925/',
		'http://10.0.3.7:9925/',
		'http://172.20.1.1:9925/',
		'http://192.168.1.10:9925/',
		'http://harper.local:9925/',
		'http://localhost.:9925/',
		'http://harper.local.:9925/',
		'http://0.0.0.0:9925/',
		'http://[::]:9925/',
		'http://[fe80::1]:9925/',
		'http://100.101.102.103:9925/',
		'http://[::ffff:127.0.0.1]:9925/',
		'http://[::ffff:c0a8:10a]:9925/',
	])('is private for %s, which a hosted runner cannot reach', (audience) => {
		expect(isPrivateAudience(audience)).toBe(true);
	});

	it.each([
		'https://cluster.example.com:9925/',
		'http://172.32.0.1:9925/',
		'https://8.8.8.8:443/',
		'http://100.128.0.1:9925/',
		'http://[::ffff:808:808]:9925/',
	])(
		'is public for %s',
		(audience) => {
			expect(isPrivateAudience(audience)).toBe(false);
		},
	);
});
