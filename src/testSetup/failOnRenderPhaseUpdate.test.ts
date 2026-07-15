// Unit coverage for the render-phase-update tripwire's self-check (#1520): the
// afterEach net-disabled detection must fire when a test replaces console.error
// and leaves it replaced, and must stay quiet when the wrapper is intact.
import { describe, expect, it } from 'vitest';
import { detectDisabledNet, installTripwire } from './failOnRenderPhaseUpdate';

describe('failOnRenderPhaseUpdate — tripwire net self-check', () => {
	it('installTripwire installs a forwarding wrapper and captures the original', () => {
		const before = console.error;
		const { wrapper, original } = installTripwire();
		try {
			expect(original).toBe(before);
			expect(console.error).toBe(wrapper);
			expect(wrapper).not.toBe(before);
		} finally {
			// Put the setup's wrapper back so this test's own afterEach detection
			// (which compares against that wrapper) does not flag a false disable.
			console.error = before;
		}
	});

	it('detectDisabledNet returns null while the installed wrapper is still in place', () => {
		const wrapper = (() => {}) as typeof console.error;
		expect(detectDisabledNet(wrapper, wrapper, 'some test')).toBeNull();
	});

	it('detectDisabledNet flags a warning when console.error was replaced and not restored', () => {
		const wrapper = (() => {}) as typeof console.error;
		const replacement = (() => {}) as typeof console.error; // e.g. a vi.spyOn mock
		const message = detectDisabledNet(replacement, wrapper, 'a test that mocks console.error');

		expect(message).not.toBeNull();
		expect(message).toContain('DISABLED');
		expect(message).toContain('a test that mocks console.error');
	});
});
