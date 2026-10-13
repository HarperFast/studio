/** @vitest-environment jsdom */
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { readSessionValue } from '@/lib/storage/sessionStorageStore';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { PropsWithChildren, useEffect, useLayoutEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStorage } from './useSessionStorage';

const BUFFER = 'EditorFileContent/instance-1/app/schema.graphql' as 'EditorFileContent/{entityId}/{path}';
const OTHER_BUFFER = 'EditorFileContent/instance-1/app/resources.js' as 'EditorFileContent/{entityId}/{path}';
const FOCUSED = 'FileFocused/instance-1' as 'FileFocused/{entityId}';
const EXPANDED = 'FolderOpened/instance-1' as 'FolderOpened/{entityId}';

interface WriterHandle {
	writeInTurn?: (values: Array<string | undefined>) => void;
}

function Writer({ handle }: { handle: WriterHandle }) {
	const [value, setValue] = useSessionStorage(BUFFER, undefined as string | undefined);
	const pending = useRef<Array<string | undefined>>([]);
	handle.writeInTurn = (values) => {
		pending.current = values.slice(1);
		setValue(values[0]);
	};
	useEffect(() => {
		if (pending.current.length) {
			setValue(pending.current.shift());
		}
	});
	return <span data-testid="writer">{String(value)}</span>;
}

function Reader({ id, children }: PropsWithChildren<{ id: string }>) {
	const [value] = useSessionStorage(BUFFER, undefined as string | undefined);
	return (
		<>
			<span data-testid={id}>{String(value)}</span>
			{children}
		</>
	);
}

function shown(id: string) {
	return screen.getByTestId(id).textContent;
}

function renderEditorLikeTree() {
	const handle: WriterHandle = {};
	render(
		<Reader id="parent">
			<Writer handle={handle} />
			<Reader id="sibling" />
		</Reader>,
	);
	return handle;
}

// jsdom dispatches Storage calls through the prototype, so spying on the instance is inert.
function spyOnStorageWrites() {
	return vi.spyOn(Storage.prototype, 'setItem');
}

function refuseStorageWrites() {
	const writes = spyOnStorageWrites().mockImplementation(() => {
		throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
	});
	return { writes, warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined) };
}

beforeEach(() => {
	clearSessionStorage();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('useSessionStorage', () => {
	it('ends every instance and sessionStorage on the last of several quick writes', async () => {
		const handle = renderEditorLikeTree();

		await act(async () => handle.writeInTurn!(['v1', 'v2', 'v3']));

		expect([shown('parent'), shown('writer'), shown('sibling')]).toEqual(['v3', 'v3', 'v3']);
		expect(sessionStorage.getItem(BUFFER)).toBe('"v3"');
	});

	it('keeps a buffer that was written and then cleared cleared in every instance', async () => {
		const handle = renderEditorLikeTree();

		await act(async () => handle.writeInTurn!(['draft', undefined]));

		expect([shown('parent'), shown('writer'), shown('sibling')]).toEqual(['undefined', 'undefined', 'undefined']);
		expect(sessionStorage.getItem(BUFFER)).toBeNull();
	});

	it('applies function updaters from two instances to the latest shared value', () => {
		const first = renderHook(() => useSessionStorage(EXPANDED, [] as string[]));
		const second = renderHook(() => useSessionStorage(EXPANDED, [] as string[]));

		act(() => {
			first.result.current[1](items => [...items, 'app']);
			second.result.current[1](items => [...items, 'app/resources']);
		});

		expect(first.result.current[0]).toEqual(['app', 'app/resources']);
		expect(second.result.current[0]).toBe(first.result.current[0]);
		expect(sessionStorage.getItem(EXPANDED)).toBe('["app","app/resources"]');
	});

	it("shows the new key's value on the render where the key changes, and writes there afterwards", () => {
		sessionStorage.setItem(OTHER_BUFFER, '"other draft"');
		const rendered: Array<[string, string | undefined]> = [];
		const { result, rerender } = renderHook(({ storageKey }) => {
			const state = useSessionStorage(storageKey, undefined as string | undefined);
			rendered.push([storageKey, state[0]]);
			return state;
		}, { initialProps: { storageKey: BUFFER } });
		act(() => result.current[1]('draft'));
		const setter = result.current[1];
		rendered.length = 0;

		rerender({ storageKey: OTHER_BUFFER });

		expect(rendered[0]).toEqual([OTHER_BUFFER, 'other draft']);
		expect(rendered).toEqual(rendered.map(() => [OTHER_BUFFER, 'other draft']));
		expect(result.current[1]).toBe(setter);
		act(() => result.current[1](previous => `${previous}, edited`));
		expect(result.current[0]).toBe('other draft, edited');
		expect(sessionStorage.getItem(OTHER_BUFFER)).toBe('"other draft, edited"');
		expect(sessionStorage.getItem(BUFFER)).toBe('"draft"');
	});

	it("lets a child's layout effect on a key-change commit write the new key", () => {
		function Child({ setSizes, table }: { setSizes: (sizes: string[]) => void; table: string }) {
			useLayoutEffect(() => setSizes([`${table} widths`]), [setSizes, table]);
			return null;
		}
		function Table({ storageKey, table }: { storageKey: 'FolderOpened/{entityId}'; table: string }) {
			const [, setSizes] = useSessionStorage(storageKey, [] as string[]);
			return <Child setSizes={setSizes} table={table} />;
		}
		const OTHER_EXPANDED = 'FolderOpened/instance-2' as 'FolderOpened/{entityId}';
		const { rerender } = render(<Table storageKey={EXPANDED} table="a" />);

		rerender(<Table storageKey={OTHER_EXPANDED} table="b" />);

		expect(sessionStorage.getItem(EXPANDED)).toBe('["a widths"]');
		expect(sessionStorage.getItem(OTHER_EXPANDED)).toBe('["b widths"]');
	});

	it("writes the new key's own default when an instance switches to an unstored key", () => {
		const { result, rerender } = renderHook(
			({ storageKey, fallback }) => useSessionStorage(storageKey, fallback),
			{ initialProps: { storageKey: EXPANDED, fallback: ['a'] } },
		);
		const OTHER_EXPANDED = 'FolderOpened/instance-2' as 'FolderOpened/{entityId}';

		rerender({ storageKey: OTHER_EXPANDED, fallback: ['b'] });

		expect(result.current[0]).toEqual(['b']);
		expect(sessionStorage.getItem(OTHER_EXPANDED)).toBe('["b"]');
		expect(sessionStorage.getItem(EXPANDED)).toBe('["a"]');
	});

	it('follows writes another instance makes to the key it switched to', () => {
		const { result, rerender } = renderHook(
			({ storageKey }) => useSessionStorage(storageKey, undefined as string | undefined),
			{ initialProps: { storageKey: BUFFER } },
		);
		const other = renderHook(() => useSessionStorage(OTHER_BUFFER, undefined as string | undefined));

		rerender({ storageKey: OTHER_BUFFER });
		act(() => other.result.current[1]('typed elsewhere'));

		expect(result.current[0]).toBe('typed elsewhere');
	});

	it("writes the first instance's default and keeps it while the caller's default changes", () => {
		const { result, rerender } = renderHook(({ fallback }) => useSessionStorage(EXPANDED, fallback), {
			initialProps: { fallback: ['app'] },
		});

		expect(sessionStorage.getItem(EXPANDED)).toBe('["app"]');
		rerender({ fallback: ['app', 'lib'] });
		expect(result.current[0]).toEqual(['app']);
	});

	it('does not write sessionStorage again on a re-render, a second instance or an unchanged value', () => {
		const first = renderHook(() => useSessionStorage(FOCUSED, 'app' as string | undefined));
		const writes = spyOnStorageWrites();

		first.rerender();
		renderHook(() => useSessionStorage(FOCUSED, 'app' as string | undefined));
		act(() => first.result.current[1]('app'));

		expect(writes).not.toHaveBeenCalled();
	});

	it('does not rewrite a stored value when its first instance mounts', () => {
		sessionStorage.setItem(BUFFER, '"a large draft"');
		const writes = spyOnStorageWrites();

		const { result } = renderHook(() => useSessionStorage(BUFFER, undefined as string | undefined));

		expect(result.current[0]).toBe('a large draft');
		expect(writes).not.toHaveBeenCalled();
	});

	it('moves every instance to a value sessionStorage refuses, so Save sends what the editor shows', () => {
		const first = renderHook(() => useSessionStorage(BUFFER, 'saved' as string | undefined));
		const second = renderHook(() => useSessionStorage(BUFFER, 'saved' as string | undefined));
		const { warn } = refuseStorageWrites();

		act(() => first.result.current[1]('too big'));
		act(() => first.result.current[1]('too big, typed on'));

		expect([first.result.current[0], second.result.current[0]]).toEqual(['too big, typed on', 'too big, typed on']);
		expect(sessionStorage.getItem(BUFFER)).toBe('"saved"');
		expect(warn).toHaveBeenCalledOnce();
	});

	it('keeps a value sessionStorage refused through a remount, since memory holds the only copy', () => {
		const first = renderHook(() => useSessionStorage(BUFFER, 'saved' as string | undefined));
		refuseStorageWrites();
		act(() => first.result.current[1]('too big'));
		first.unmount();

		const remounted = renderHook(() => useSessionStorage(BUFFER, 'saved' as string | undefined));

		expect(remounted.result.current[0]).toBe('too big');
	});

	it('mounts on its default when sessionStorage refuses to store it', () => {
		refuseStorageWrites();

		const { result } = renderHook(() => useSessionStorage(EXPANDED, ['app']));

		expect(result.current[0]).toEqual(['app']);
	});

	it('ignores a setter called after its instance unmounted, as useState does', () => {
		const leaving = renderHook(() => useSessionStorage(BUFFER, undefined as string | undefined));
		const lateSetter = leaving.result.current[1];
		leaving.unmount();
		const reopened = renderHook(() => useSessionStorage(BUFFER, undefined as string | undefined));
		act(() => reopened.result.current[1]('typed after reopening'));

		act(() => lateSetter(undefined));

		expect(reopened.result.current[0]).toBe('typed after reopening');
		expect(sessionStorage.getItem(BUFFER)).toBe('"typed after reopening"');
	});

	it('re-reads a key another document wrote', () => {
		const first = renderHook(() => useSessionStorage(BUFFER, undefined as string | undefined));
		const second = renderHook(() => useSessionStorage(BUFFER, undefined as string | undefined));

		act(() => {
			sessionStorage.setItem(BUFFER, '"from another document"');
			window.dispatchEvent(new StorageEvent('storage', { key: BUFFER, storageArea: sessionStorage }));
		});

		expect([first.result.current[0], second.result.current[0]]).toEqual([
			'from another document',
			'from another document',
		]);
	});

	it('ignores another tab writing localStorage under the same key name', () => {
		const { result } = renderHook(() => useSessionStorage(BUFFER, undefined as string | undefined));
		act(() => result.current[1]('draft'));

		act(() => {
			sessionStorage.setItem(BUFFER, '"not read back"');
			window.dispatchEvent(new StorageEvent('storage', { key: BUFFER, storageArea: localStorage }));
		});

		expect(result.current[0]).toBe('draft');
	});

	it('forgets every value when another document clears sessionStorage', () => {
		const { result } = renderHook(() => useSessionStorage(FOCUSED, 'app' as string | undefined));
		act(() => result.current[1]('app/resources.js'));

		act(() => {
			sessionStorage.clear();
			window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: sessionStorage }));
		});

		expect(result.current[0]).toBe('app');
	});

	it('keeps an instance that stays subscribed after another on its key unmounts', () => {
		const staying = renderHook(() => useSessionStorage(BUFFER, undefined as string | undefined));
		const leaving = renderHook(() => useSessionStorage(BUFFER, undefined as string | undefined));
		const writer = renderHook(() => useSessionStorage(BUFFER, undefined as string | undefined));

		leaving.unmount();
		act(() => writer.result.current[1]('after the unmount'));

		expect(staying.result.current[0]).toBe('after the unmount');
	});

	it('re-reads sessionStorage, not a forgotten in-memory value, once every instance has unmounted', () => {
		const first = renderHook(() => useSessionStorage(FOCUSED, 'app' as string | undefined));
		act(() => first.result.current[1](undefined));
		expect(first.result.current[0]).toBeUndefined();
		first.unmount();

		const remounted = renderHook(() => useSessionStorage(FOCUSED, 'lib' as string | undefined));

		expect(remounted.result.current[0]).toBe('lib');
	});

	it('resets mounted instances to their default when sign-out clears sessionStorage', () => {
		const { result } = renderHook(() => useSessionStorage(BUFFER, undefined as string | undefined));
		act(() => result.current[1]("a previous user's draft"));

		act(() => clearSessionStorage());

		expect(result.current[0]).toBeUndefined();
		expect(sessionStorage.getItem(BUFFER)).toBeNull();
	});

	it('still forgets in-memory values when sessionStorage refuses to clear, leaving what it still holds', () => {
		sessionStorage.setItem(BUFFER, '"saved"');
		const { result } = renderHook(() => useSessionStorage(BUFFER, 'fallback' as string | undefined));
		const { writes } = refuseStorageWrites();
		act(() => result.current[1]("a previous user's unsaved draft"));
		writes.mockRestore();
		vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {
			throw new DOMException('Storage refused.', 'SecurityError');
		});

		act(() => {
			expect(() => clearSessionStorage()).toThrow('Storage refused.');
		});

		expect(result.current[0]).toBe('saved');
	});

	it('does not carry a default re-read during sign-out into the next sign-in', () => {
		const signedOut = renderHook(() => useSessionStorage(EXPANDED, ['billing-app']));
		act(() => clearSessionStorage());
		signedOut.unmount();

		const signedIn = renderHook(() => useSessionStorage(EXPANDED, ['public-docs']));

		expect(signedIn.result.current[0]).toEqual(['public-docs']);
		expect(sessionStorage.getItem(EXPANDED)).toBe('["public-docs"]');
	});

	it("uses the committed mount's default over one read by a render that never committed", () => {
		readSessionValue(EXPANDED, ['abandoned']);

		const { result } = renderHook(() => useSessionStorage(EXPANDED, ['committed']));

		expect(result.current[0]).toEqual(['committed']);
		expect(sessionStorage.getItem(EXPANDED)).toBe('["committed"]');
	});

	it("uses the committed mount's default over an empty one read by a render that never committed", () => {
		readSessionValue(FOCUSED, undefined);

		const { result } = renderHook(() => useSessionStorage(FOCUSED, 'app' as string | undefined));

		expect(result.current[0]).toBe('app');
	});

	it('keeps a watched default shared when another instance mounts with a different one', () => {
		const first = renderHook(() => useSessionStorage(EXPANDED, ['app']));
		act(() => clearSessionStorage());

		const second = renderHook(() => useSessionStorage(EXPANDED, ['lib']));
		first.rerender();

		expect([first.result.current[0], second.result.current[0]]).toEqual([['app'], ['app']]);
	});

	it('drops a value no instance has subscribed to yet when sign-out clears sessionStorage', () => {
		sessionStorage.setItem(BUFFER, '"a previous user\'s draft"');
		expect(readSessionValue(BUFFER, undefined)).toBe("a previous user's draft");

		clearSessionStorage();

		expect(readSessionValue(BUFFER, undefined)).toBeUndefined();
	});
});
