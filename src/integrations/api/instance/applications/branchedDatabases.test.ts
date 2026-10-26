import { describe, expect, it } from 'vitest';
import {
	branchStorageMessage,
	describeBranchedDatabases,
	readBranchedDatabases,
	supportsBranchedDatabases,
} from './branchedDatabases';

describe('supportsBranchedDatabases', () => {
	it.each([
		['5.3.1', false],
		['5.3.2-beta.1', false],
		['5.3.2', true],
		['5.4.0-alpha.1', true],
		[undefined, false],
	])('%s → %s', (version, expected) => {
		expect(supportsBranchedDatabases(version)).toBe(expected);
	});
});

describe('readBranchedDatabases', () => {
	it('reads a list and true off the application entry', () => {
		expect(readBranchedDatabases({ web: { package: 'npm:web', branchedDatabases: ['data'] } }, 'web')).toEqual([
			'data',
		]);
		expect(readBranchedDatabases({ web: { branchedDatabases: true } }, 'web')).toBe(true);
	});

	it('reads an empty list as none, since it branches nothing', () => {
		expect(readBranchedDatabases({ web: { branchedDatabases: [] } }, 'web')).toBeUndefined();
	});

	it('reads only the named application, and only its own key', () => {
		const configuration = { other: { branchedDatabases: true }, web: { package: 'npm:web' } };
		expect(readBranchedDatabases(configuration, 'web')).toBeUndefined();
		expect(readBranchedDatabases(configuration, 'missing')).toBeUndefined();
		// Inherited from Object.prototype, not an application.
		expect(readBranchedDatabases(configuration, 'constructor')).toBeUndefined();
	});

	it.each([undefined, null, 'web', ['web'], { web: 'npm:web' }, { web: { branchedDatabases: 'data' } }])(
		'reads %j as none',
		(configuration) => {
			expect(readBranchedDatabases(configuration, 'web')).toBeUndefined();
		},
	);
});

describe('describeBranchedDatabases', () => {
	it('names the databases, or says all of them but system', () => {
		expect(describeBranchedDatabases(['data', 'logs'])).toBe('data, logs');
		expect(describeBranchedDatabases(true)).toBe('all databases except system');
	});
});

describe('branchStorageMessage', () => {
	it("returns Harper's answer when it says what became of the copies", () => {
		const message = 'Successfully dropped: web. Any branched database storage this application owns was left in place; '
			+ 'drop it again with restart: true to discard that data';
		expect(branchStorageMessage({ message })).toBe(message);
	});

	it.each([{ message: 'Successfully dropped: web' }, { message: 42 }, undefined, 'branched database storage'])(
		'ignores %j',
		(response) => {
			expect(branchStorageMessage(response)).toBeUndefined();
		},
	);
});
