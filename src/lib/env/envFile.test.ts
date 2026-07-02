import { describe, expect, it } from 'vitest';
import {
	ENV_VALUE_MASK,
	formatEnvValue,
	isEnvFile,
	isExampleEnvFile,
	isProtectedEnvFile,
	parseEnv,
	parseEnvKeys,
	removeEnvKeys,
	renderMaskedEnv,
	upsertEnvValues,
} from './envFile';

/**
 * Ported from Harper core's `unitTests/utility/envFile.test.js` (HarperFast/harper#1527) so this
 * client-side port stays behaviorally in lockstep with the server-side module. The literal
 * expectations below were validated against the real `dotenv` parser in that suite.
 */
describe('envFile', () => {
	describe('isEnvFile', () => {
		it('matches .env and .env.<suffix>', () => {
			expect(isEnvFile('.env')).toBe(true);
			expect(isEnvFile('.env.local')).toBe(true);
			expect(isEnvFile('.env.production')).toBe(true);
			expect(isEnvFile('app/.env')).toBe(true);
			expect(isEnvFile('deep/nested/.env.test')).toBe(true);
		});

		it('does not match non-env files', () => {
			expect(isEnvFile('env.js')).toBe(false);
			expect(isEnvFile('config.env')).toBe(false);
			expect(isEnvFile('config.env.ts')).toBe(false);
			expect(isEnvFile('.environment')).toBe(false);
			expect(isEnvFile('.envrc')).toBe(false);
			expect(isEnvFile('')).toBe(false);
			expect(isEnvFile(undefined)).toBe(false);
		});
	});

	describe('isExampleEnvFile / isProtectedEnvFile', () => {
		it('treats template env files as examples that are not protected', () => {
			for (
				const f of [
					'.env.example',
					'.env.sample',
					'.env.template',
					'.env.local.example',
					'.ENV.SAMPLE',
					'app/.env.example',
				]
			) {
				expect(isEnvFile(f), `isEnvFile ${f}`).toBe(true);
				expect(isExampleEnvFile(f), `isExampleEnvFile ${f}`).toBe(true);
				expect(isProtectedEnvFile(f), `isProtectedEnvFile ${f}`).toBe(false);
			}
		});

		it('treats real env files as protected, not examples (case-insensitive)', () => {
			for (const f of ['.env', '.env.local', '.env.production', 'deep/.env', '.ENV', '.Env.Production']) {
				expect(isExampleEnvFile(f), `isExampleEnvFile ${f}`).toBe(false);
				expect(isProtectedEnvFile(f), `isProtectedEnvFile ${f}`).toBe(true);
			}
		});

		it('does not treat non-env files as examples even with a template suffix', () => {
			expect(isExampleEnvFile('config.example')).toBe(false);
			expect(isProtectedEnvFile('config.example')).toBe(false);
			expect(isProtectedEnvFile('env.js')).toBe(false);
		});
	});

	describe('parseEnv', () => {
		it('parses bare, quoted, and commented assignments with dotenv semantics', () => {
			const text = [
				'# comment',
				'BARE=plain',
				'SPACED=  padded value  ',
				"SINGLE='kept  literal # not a comment'",
				'DOUBLE="line1\\nline2"',
				'INLINE=value # trailing comment',
				'EMPTY=',
			].join('\n');
			expect(parseEnv(text)).toEqual({
				BARE: 'plain',
				SPACED: 'padded value',
				SINGLE: 'kept  literal # not a comment',
				DOUBLE: 'line1\nline2',
				INLINE: 'value',
				EMPTY: '',
			});
		});

		it('supports multi-line quoted values and export prefixes', () => {
			const text = 'export CERT="l1\nl2\nl3"\nNAME=keep\n';
			expect(parseEnv(text)).toEqual({ CERT: 'l1\nl2\nl3', NAME: 'keep' });
		});

		it('keeps the last assignment of a duplicated key', () => {
			expect(parseEnv('FOO=1\nFOO=2\n')).toEqual({ FOO: '2' });
		});
	});

	describe('parseEnvKeys', () => {
		it('returns key names in file order, ignoring comments and blanks', () => {
			const text = '# a comment\nAPI_KEY=secret123\n\nDB_URL=postgres://x\n';
			expect(parseEnvKeys(text)).toEqual(['API_KEY', 'DB_URL']);
		});

		it('handles export prefixes and de-dupes (last wins, single entry)', () => {
			const text = 'export FOO=1\nFOO=2\nBAR=3\n';
			expect(parseEnvKeys(text)).toEqual(['FOO', 'BAR']);
		});

		it('returns no keys for empty text', () => {
			expect(parseEnvKeys('')).toEqual([]);
			expect(parseEnvKeys('# only a comment\n')).toEqual([]);
		});
	});

	describe('renderMaskedEnv', () => {
		it('renders one masked line per key and never leaks a value', () => {
			expect(renderMaskedEnv(['API_KEY', 'DB_URL'])).toBe(`API_KEY=${ENV_VALUE_MASK}\nDB_URL=${ENV_VALUE_MASK}\n`);
		});

		it('is empty for no keys', () => {
			expect(renderMaskedEnv([])).toBe('');
		});
	});

	describe('formatEnvValue', () => {
		// round-trip: writing KEY=<formatted> and parsing it back yields the original value
		const roundTrips = (value: string) => parseEnv(`KEY=${formatEnvValue(value)}\n`).KEY;

		it('leaves simple values bare', () => {
			expect(formatEnvValue('abc123')).toBe('abc123');
			expect(formatEnvValue('postgres://u:p@h:5432/db?ssl=true')).toBe('postgres://u:p@h:5432/db?ssl=true');
		});

		it('emits an empty value bare', () => {
			expect(formatEnvValue('')).toBe('');
			expect(roundTrips('')).toBe('');
		});

		it('quotes values with spaces, #, or leading/trailing whitespace', () => {
			for (const v of ['hello world', 'has#hash', '  padded  ', 'a=b c']) {
				expect(roundTrips(v), `failed round trip for ${JSON.stringify(v)}`).toBe(v);
			}
		});

		it('round-trips quote characters', () => {
			expect(roundTrips('has"double')).toBe('has"double');
			expect(roundTrips("has'single")).toBe("has'single");
			expect(roundTrips('back`tick')).toBe('back`tick');
		});

		it('round-trips backslashes and newlines', () => {
			expect(roundTrips('a\\b\\c')).toBe('a\\b\\c');
			expect(roundTrips('line1\nline2')).toBe('line1\nline2');
			expect(roundTrips("has'single\nand newline")).toBe("has'single\nand newline");
		});

		it('throws only on the unrepresentable both-quotes case', () => {
			expect(() => formatEnvValue(`both ' and "`)).toThrow();
		});
	});

	describe('upsertEnvValues', () => {
		it('replaces an existing value in place, preserving everything else', () => {
			const text = '# header\nAPI_KEY=old\nDB_URL=postgres://x\n# trailing note\n';
			const result = upsertEnvValues(text, { API_KEY: 'rotated' });
			expect(result).toBe('# header\nAPI_KEY=rotated\nDB_URL=postgres://x\n# trailing note\n');
			expect(parseEnv(result)).toEqual({ API_KEY: 'rotated', DB_URL: 'postgres://x' });
		});

		it('appends a new key without disturbing others', () => {
			const text = 'API_KEY=secret\n';
			const result = upsertEnvValues(text, { NEW_ONE: 'x' });
			expect(result).toBe('API_KEY=secret\nNEW_ONE=x\n');
		});

		it('upserts multiple keys at once (replace + append)', () => {
			const text = 'A=1\nB=2\n';
			const result = upsertEnvValues(text, { B: '22', C: '3' });
			expect(parseEnv(result)).toEqual({ A: '1', B: '22', C: '3' });
			expect(result.startsWith('A=1\nB=22\n')).toBe(true);
		});

		it('creates content from an empty file', () => {
			expect(upsertEnvValues('', { A: '1', B: '2' })).toBe('A=1\nB=2\n');
		});

		it('preserves the export prefix and indentation when updating', () => {
			expect(upsertEnvValues('export FOO=old\n', { FOO: 'new' })).toBe('export FOO=new\n');
		});

		it('collapses a duplicate assignment of an updated key so the new value wins', () => {
			const text = 'FOO=1\nFOO=2\n';
			const result = upsertEnvValues(text, { FOO: '9' });
			expect(result).toBe('FOO=9\n');
			expect(parseEnv(result)).toEqual({ FOO: '9' });
		});

		it('does not corrupt a multi-line quoted value belonging to another key', () => {
			// CERT spans 3 lines; a continuation line looks like an assignment (OTHER=...).
			const text = 'CERT="line1\nOTHER=line2\nline3"\nNAME=keep\n';
			const result = upsertEnvValues(text, { OTHER: 'injected' });
			// CERT stays intact, OTHER is appended as a brand-new key (the look-alike was inside CERT).
			const parsed = parseEnv(result);
			expect(parsed.CERT).toBe('line1\nOTHER=line2\nline3');
			expect(parsed.NAME).toBe('keep');
			expect(parsed.OTHER).toBe('injected');
		});

		it('quotes a value that needs it when writing', () => {
			const result = upsertEnvValues('A=1\n', { B: 'two words' });
			expect(result).toBe("A=1\nB='two words'\n");
			expect(parseEnv(result).B).toBe('two words');
		});

		it('adds new keys to a file with no trailing newline', () => {
			expect(upsertEnvValues('A=1', { B: '2' })).toBe('A=1\nB=2\n');
		});

		it('treats a single-quoted value ending in a backslash as closed on its line', () => {
			// A Windows path closes on its own line; the following key must not be swallowed as a
			// continuation (which would corrupt it and append a duplicate).
			const text = "WINPATH='C:\\Users\\name\\'\nNEXT=keep\n";
			const result = upsertEnvValues(text, { NEXT: 'changed' });
			expect(result.includes("WINPATH='C:\\Users\\name\\'"), 'WINPATH preserved verbatim').toBe(true);
			expect(parseEnv(result).NEXT).toBe('changed');
			expect((result.match(/^NEXT=/gm) || []).length, 'NEXT updated in place, not duplicated').toBe(1);
		});

		it('treats a backtick-quoted value ending in a backslash as closed on its line', () => {
			// dotenv treats backtick values literally (like single quotes), so this closes on its line.
			const text = 'WINPATH=`C:\\Users\\name\\`\nNEXT=keep\n';
			const result = upsertEnvValues(text, { NEXT: 'changed' });
			expect(result.includes('WINPATH=`C:\\Users\\name\\`'), 'WINPATH preserved verbatim').toBe(true);
			expect(parseEnv(result).NEXT).toBe('changed');
			expect((result.match(/^NEXT=/gm) || []).length, 'NEXT updated in place, not duplicated').toBe(1);
		});
	});

	describe('removeEnvKeys', () => {
		it('removes a single key, leaving the rest', () => {
			const text = '# note\nA=1\nB=2\nC=3\n';
			expect(removeEnvKeys(text, 'B')).toBe('# note\nA=1\nC=3\n');
		});

		it('removes multiple keys', () => {
			expect(parseEnv(removeEnvKeys('A=1\nB=2\nC=3\n', ['A', 'C']))).toEqual({ B: '2' });
		});

		it('removes a multi-line quoted value entirely', () => {
			const text = 'CERT="l1\nl2\nl3"\nNAME=keep\n';
			expect(removeEnvKeys(text, 'CERT')).toBe('NAME=keep\n');
		});

		it('is a no-op when the key is absent', () => {
			expect(removeEnvKeys('A=1\n', 'Z')).toBe('A=1\n');
		});
	});
});
