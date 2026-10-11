import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { triggerBlobDownload } from '@/lib/download';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadLogs, formatLogLine, logExportFilename, serializeLogs } from './exportLogs';

vi.mock('@/lib/download', async (importOriginal) => ({
	...await importOriginal<typeof import('@/lib/download')>(),
	triggerBlobDownload: vi.fn(),
}));

afterEach(() => vi.mocked(triggerBlobDownload).mockReset());

const entry = (overrides: Partial<ReadLogItem> = {}): ReadLogItem => ({
	level: 'notify',
	timestamp: '2026-10-10T14:30:05.123Z',
	thread: 'main/0',
	tags: [],
	node: '',
	message: 'HarperDB successfully started',
	...overrides,
});

// Copied from harper `utility/logging/readLog.ts` (LOG_ENTRY_MARKER).
const HARPER_LOG_ENTRY_MARKER = /(?:^|\n)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[\d.]+Z) \[(.+?)]: /g;

function parseLikeHarper(text: string) {
	const entries: { timestamp: string; thread: string; level: string; tags: string[]; message: string }[] = [];
	let last = 0;
	let match;
	while ((match = HARPER_LOG_ENTRY_MARKER.exec(text))) {
		if (entries.length) {
			entries[entries.length - 1].message = text.slice(last, match.index);
		}
		const [thread, level, ...tags] = match[2].split('] [');
		entries.push({ timestamp: match[1], thread, level, tags, message: '' });
		last = match.index + match[0].length;
	}
	if (entries.length) {
		entries[entries.length - 1].message = text.slice(last).trim();
	}
	return entries;
}

describe('formatLogLine', () => {
	it('writes the hdb.log line shape', () => {
		expect(formatLogLine(entry())).toBe('2026-10-10T14:30:05.123Z [main/0] [notify]: HarperDB successfully started');
	});

	it("carries tags, and a replicated read's node as the first tag", () => {
		expect(formatLogLine(entry({ level: 'error', tags: ['http', 'auth'], node: 'node-1.example.com' })))
			.toBe(
				'2026-10-10T14:30:05.123Z [main/0] [error] [node-1.example.com] [http] [auth]: HarperDB successfully started',
			);
	});

	it('keeps the line shape for the sparse entries the SSE tail admits, instead of throwing', () => {
		const timestamp = '2026-10-10T14:30:05.123Z';
		expect(formatLogLine({ timestamp, message: 'x', tags: 1 as unknown as string[] })).toBe(`${timestamp} [] []: x`);
		expect(formatLogLine({ timestamp, level: 'info' })).toBe(`${timestamp} [] [info]: `);
	});
});

describe('serializeLogs', () => {
	const entries = [
		entry({ level: 'error', tags: ['http'], message: 'Error: boom\n    at handler (app.js:1:1)\n    at next' }),
		entry({ timestamp: '2026-10-10T14:30:04.000Z', thread: 'http/1', level: 'info', message: 'request done' }),
	];

	it("writes one Harper log entry per row, in the order given, that Harper's parser splits back apart", () => {
		const text = serializeLogs(entries, 'txt');
		expect(text.endsWith('\n')).toBe(true);
		expect(parseLikeHarper(text)).toEqual([
			{
				timestamp: '2026-10-10T14:30:05.123Z',
				thread: 'main/0',
				level: 'error',
				tags: ['http'],
				message: 'Error: boom\n    at handler (app.js:1:1)\n    at next',
			},
			{ timestamp: '2026-10-10T14:30:04.000Z', thread: 'http/1', level: 'info', tags: [], message: 'request done' },
		]);
	});

	it('round-trips every field through JSON', () => {
		expect(JSON.parse(serializeLogs(entries, 'json'))).toEqual(entries);
	});
});

describe('logExportFilename', () => {
	it('names the log file and the moment of export, without filename-hostile characters', () => {
		const now = Date.UTC(2026, 9, 10, 14, 30, 5, 123);
		expect(logExportFilename('hdb.log', 'txt', now)).toBe('hdb-log-2026-10-10T14-30-05-123Z.txt');
		expect(logExportFilename('system.log', 'json', now)).toBe('system-log-2026-10-10T14-30-05-123Z.json');
	});
});

describe('downloadLogs', () => {
	it('hands the serialized text to the browser download with a matching type and name', async () => {
		downloadLogs([entry()], 'txt', 'hdb.log');
		const [blob, filename] = vi.mocked(triggerBlobDownload).mock.calls[0];
		expect(blob.type).toBe('text/plain;charset=utf-8');
		expect(await blob.text()).toBe(serializeLogs([entry()], 'txt'));
		expect(filename).toMatch(/^hdb-log-.*\.txt$/);
	});

	it('marks a JSON export as JSON', async () => {
		downloadLogs([entry()], 'json', 'hdb.log');
		const [blob, filename] = vi.mocked(triggerBlobDownload).mock.calls[0];
		expect(blob.type).toBe('application/json');
		expect(JSON.parse(await blob.text())).toEqual([entry()]);
		expect(filename).toMatch(/\.json$/);
	});
});
