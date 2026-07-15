import { describe, expect, it } from 'vitest';
import { shortenNodeLabel, shortNodeLabelMap } from '../lib/nodeLabels';

describe('shortenNodeLabel', () => {
	it('keeps the first FQDN segment', () => {
		expect(shortenNodeLabel('xb6-us-west-1.prod.ibm.harperfabric.com')).toBe('xb6-us-west-1');
	});

	it('falls back to the full string without a dot', () => {
		expect(shortenNodeLabel('localhost')).toBe('localhost');
	});
});

describe('shortNodeLabelMap', () => {
	it('shortens non-colliding nodes to their first segment (same as shortenNodeLabel)', () => {
		const map = shortNodeLabelMap(['a.acme.com', 'b.acme.com']);
		expect(map.get('a.acme.com')).toBe('a');
		expect(map.get('b.acme.com')).toBe('b');
	});

	it('extends colliding labels with enough segments to disambiguate', () => {
		const map = shortNodeLabelMap(['node1.us.acme.com', 'node1.eu.acme.com', 'node2.us.acme.com']);
		expect(map.get('node1.us.acme.com')).toBe('node1.us');
		expect(map.get('node1.eu.acme.com')).toBe('node1.eu');
		// Unique first segment stays short.
		expect(map.get('node2.us.acme.com')).toBe('node2');
	});

	it('keeps deep collisions extending until they split', () => {
		const map = shortNodeLabelMap(['n.us.east.acme.com', 'n.us.west.acme.com']);
		expect(map.get('n.us.east.acme.com')).toBe('n.us.east');
		expect(map.get('n.us.west.acme.com')).toBe('n.us.west');
	});

	it('falls back to the full name when a node exhausts its segments', () => {
		const map = shortNodeLabelMap(['web', 'web.acme.com']);
		expect(map.get('web')).toBe('web');
		expect(map.get('web.acme.com')).toBe('web.acme');
	});

	it('dedupes repeated inputs and handles empties', () => {
		const map = shortNodeLabelMap(['a.acme.com', 'a.acme.com']);
		expect(map.size).toBe(1);
		expect(shortNodeLabelMap([]).size).toBe(0);
	});
});
