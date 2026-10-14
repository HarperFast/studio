/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalStorage } from './clearLocalStorage';

function storedKeys(): Array<string | null> {
	return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
}

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('clearLocalStorage', () => {
	it('removes every key but the kept ones, which keep their values', () => {
		localStorage.setItem('a', '1');
		localStorage.setItem('kept', 'value');
		localStorage.setItem('b', '2');

		clearLocalStorage(['kept', 'never-stored']);

		expect(storedKeys()).toEqual(['kept']);
		expect(localStorage.getItem('kept')).toBe('value');
	});

	it('still removes the other keys when one removal throws, then throws that failure', () => {
		for (const key of ['a', 'b', 'c']) {
			localStorage.setItem(key, key);
		}
		const refused = localStorage.key(0);
		const refusal = new DOMException('Storage refused.', 'SecurityError');
		const removeItem = Storage.prototype.removeItem;
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function(this: Storage, key: string) {
			if (key === refused) {
				throw refusal;
			}
			removeItem.call(this, key);
		});

		expect(() => clearLocalStorage([])).toThrow(refusal);
		expect(storedKeys()).toEqual([refused]);
	});
});
