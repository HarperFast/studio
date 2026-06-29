/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installBrowserTranslationDomGuard } from './installBrowserTranslationDomGuard';

// Capture the pristine implementations so each test can restore them — the guard
// patches Node.prototype globally and we don't want it leaking across the file.
const pristineRemoveChild = Node.prototype.removeChild;
const pristineInsertBefore = Node.prototype.insertBefore;
const guardFlag = '__harperTranslationGuarded__';

describe('installBrowserTranslationDomGuard', () => {
	beforeEach(() => {
		Node.prototype.removeChild = pristineRemoveChild;
		Node.prototype.insertBefore = pristineInsertBefore;
		delete (Node.prototype as unknown as Record<string, unknown>)[guardFlag];
		installBrowserTranslationDomGuard();
	});

	afterEach(() => {
		Node.prototype.removeChild = pristineRemoveChild;
		Node.prototype.insertBefore = pristineInsertBefore;
		delete (Node.prototype as unknown as Record<string, unknown>)[guardFlag];
	});

	it('still removes a genuine child', () => {
		const parent = document.createElement('div');
		const child = document.createElement('span');
		parent.appendChild(child);

		expect(parent.removeChild(child)).toBe(child);
		expect(parent.contains(child)).toBe(false);
	});

	it('does not throw when removing a node that is no longer a child (the #1388 crash)', () => {
		const parent = document.createElement('div');
		const stranger = document.createElement('span'); // never parented to `parent`

		expect(() => parent.removeChild(stranger)).not.toThrow();
		expect(parent.removeChild(stranger)).toBe(stranger);
	});

	it('still inserts before a genuine reference node', () => {
		const parent = document.createElement('div');
		const ref = document.createElement('span');
		const inserted = document.createElement('b');
		parent.appendChild(ref);

		parent.insertBefore(inserted, ref);
		expect(parent.firstChild).toBe(inserted);
		expect(parent.childNodes[1]).toBe(ref);
	});

	it('does not throw when the reference node belongs to another parent; appends instead', () => {
		const parent = document.createElement('div');
		const otherParent = document.createElement('div');
		const ref = document.createElement('span');
		const inserted = document.createElement('b');
		otherParent.appendChild(ref); // ref's parent is NOT `parent`

		expect(() => parent.insertBefore(inserted, ref)).not.toThrow();
		expect(parent.contains(inserted)).toBe(true);
	});

	it('is idempotent — calling twice does not double-wrap', () => {
		const after = Node.prototype.removeChild;
		installBrowserTranslationDomGuard();
		expect(Node.prototype.removeChild).toBe(after);
	});
});
