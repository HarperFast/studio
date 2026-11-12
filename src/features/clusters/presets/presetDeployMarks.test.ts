/** @vitest-environment jsdom */
import {
	clearDeployMark,
	getDeployMarks,
	markDeploy,
	resetDeployMarksForTests,
} from '@/features/clusters/presets/presetDeployMarks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = 'Studio:PresetSetupDeploys:clu-1';

beforeEach(() => {
	localStorage.clear();
	resetDeployMarksForTests();
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe('presetDeployMarks', () => {
	it('keeps the marks in storage, where every tab reads them', () => {
		markDeploy('clu-1', 'harper-redirects', 'unconfirmed');
		expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ 'harper-redirects': 'unconfirmed' });

		localStorage.setItem(key, JSON.stringify({ 'harper-redirects': 'partial' }));
		expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'partial' });
	});

	it('reads no mark once another tab has cleared the last one', () => {
		markDeploy('clu-1', 'harper-redirects', 'unconfirmed');
		localStorage.removeItem(key);

		expect(getDeployMarks('clu-1')).toEqual({});
		markDeploy('clu-1', 'harper-analytics', 'partial');
		expect(getDeployMarks('clu-1')).toEqual({ 'harper-analytics': 'partial' });
	});

	it('removes the key with the last mark, and writes nothing to clear a mark that is not there', () => {
		markDeploy('clu-1', 'harper-redirects', 'partial');
		clearDeployMark('clu-1', 'harper-redirects');
		expect(localStorage.getItem(key)).toBeNull();

		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
		clearDeployMark('clu-1', 'harper-redirects');
		expect(setItem).not.toHaveBeenCalled();
		expect(removeItem).not.toHaveBeenCalled();
	});

	it('holds the marks for this tab when storage refuses to write them', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		markDeploy('clu-1', 'harper-redirects', 'unconfirmed');
		expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'unconfirmed' });

		clearDeployMark('clu-1', 'harper-redirects');
		expect(getDeployMarks('clu-1')).toEqual({});
	});

	it("reads this tab's refused mark over the older one a full storage still holds", () => {
		localStorage.setItem(key, JSON.stringify({ 'harper-redirects': 'partial' }));
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		markDeploy('clu-1', 'harper-redirects', 'unconfirmed');

		expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'unconfirmed' });
		expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ 'harper-redirects': 'partial' });
	});

	it("drops this tab's refused mark once another tab changes the key", () => {
		localStorage.setItem(key, JSON.stringify({ 'harper-redirects': 'partial' }));
		const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		markDeploy('clu-1', 'harper-redirects', 'unconfirmed');
		setItem.mockRestore();

		localStorage.removeItem(key);
		expect(getDeployMarks('clu-1')).toEqual({});
		localStorage.setItem(key, JSON.stringify({ 'harper-redirects': 'partial' }));
		expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'partial' });
	});

	it('survives corrupt storage', () => {
		localStorage.setItem(key, '[not json');
		expect(getDeployMarks('clu-1')).toEqual({});
	});
});
