/**
 * @vitest-environment jsdom
 */
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { downloadLogs } from '../lib/exportLogs';
import { DownloadLogsMenu } from './DownloadLogsMenu';

vi.mock('../lib/exportLogs', () => ({ downloadLogs: vi.fn() }));

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	window.PointerEvent ??= class extends MouseEvent {} as typeof PointerEvent;
});

afterEach(() => {
	cleanup();
	vi.mocked(downloadLogs).mockReset();
});

const logs: ReadLogItem[] = [
	{ level: 'info', timestamp: '2026-10-10T14:30:05.123Z', thread: 'main/0', tags: [], node: '', message: 'one' },
	{ level: 'warn', timestamp: '2026-10-10T14:30:04.000Z', thread: 'main/0', tags: [], node: '', message: 'two' },
];

function openMenu() {
	fireEvent.pointerDown(screen.getByRole('button', { name: 'Download logs' }), { button: 0, ctrlKey: false });
}

describe('DownloadLogsMenu', () => {
	it('is disabled while there is nothing to save', () => {
		render(<DownloadLogsMenu logs={[]} logName="hdb.log" />);
		expect((screen.getByRole('button', { name: 'Download logs' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('says how many entries it will save — the loaded slice, not the whole file', () => {
		render(<DownloadLogsMenu logs={logs} logName="hdb.log" />);
		openMenu();
		expect(screen.getByText('Saves the 2 entries shown')).toBeTruthy();
	});

	it.each(
		[
			['Text (.txt)', 'txt'],
			['JSON (.json)', 'json'],
		] as const,
	)('%s saves exactly the rows it was given, as %s', (label, format) => {
		render(<DownloadLogsMenu logs={logs} logName="system.log" />);
		openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: label }));
		expect(downloadLogs).toHaveBeenCalledExactlyOnceWith(logs, format, 'system.log');
	});
});
