import { describe, expect, it } from 'vitest';
import { locateJsonPaths } from './jsonPathRanges';

describe('locateJsonPaths', () => {
	const text = JSON.stringify({ logging: { file: true, level: 'warn' }, http: { keepAliveTimeout: 301000 } }, null, 4);

	it('finds each present setting from its key through its value', () => {
		const ranges = locateJsonPaths(text, ['logging.file', 'http.keepAliveTimeout']);
		expect(ranges.map(({ path, offset, length }) => [path, text.slice(offset, offset + length)])).toEqual([
			['logging.file', '"file": true'],
			['http.keepAliveTimeout', '"keepAliveTimeout": 301000'],
		]);
	});

	it('skips settings that are not there', () => {
		expect(locateJsonPaths(text, ['logging.path', 'tls'])).toEqual([]);
	});

	it('still finds settings while the document is half typed', () => {
		const broken = '{\n  "logging": { "file": true, "level": \n';
		const [range] = locateJsonPaths(broken, ['logging.file']);
		expect(broken.slice(range.offset, range.offset + range.length)).toBe('"file": true');
	});

	it('finds nothing in an empty document', () => {
		expect(locateJsonPaths('', ['logging.file'])).toEqual([]);
	});
});
