/**
 * @vitest-environment jsdom
 */
import { OperationsAllowlistEditor } from '@/features/instance/config/roles/operations/OperationsAllowlistEditor';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Radix's menu relies on a handful of DOM APIs that jsdom doesn't implement.
beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => cleanup());

function Harness({ initial, version = '5.2.2' }: { initial?: string[]; version?: string }) {
	const [value, setValue] = useState<string[] | undefined>(initial);
	return <OperationsAllowlistEditor value={value} onChange={setValue} version={version} />;
}

function openPicker() {
	fireEvent.pointerDown(screen.getByRole('button', { name: /Add operations/ }), { button: 0, ctrlKey: false });
}

function filterPicker(query: string) {
	fireEvent.change(screen.getByRole('textbox', { name: 'Filter operations' }), { target: { value: query } });
}

function closePicker() {
	fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
}

describe('OperationsAllowlistEditor', () => {
	it('starts unrestricted and produces an empty allowlist when restriction is turned on', () => {
		const onChange = vi.fn();
		render(<OperationsAllowlistEditor value={undefined} onChange={onChange} version="5.2.2" />);
		expect(screen.getByText(/No operation-level restriction/)).toBeTruthy();

		fireEvent.click(screen.getByRole('switch', { name: 'Restrict operations' }));
		expect(onChange).toHaveBeenCalledWith([]);
	});

	it('removes the restriction when toggled back off, and restores it on re-toggle', () => {
		render(<Harness initial={['read_only', 'deploy_component']} />);
		const restrictSwitch = () => screen.getByRole('switch', { name: 'Restrict operations' });

		// A misclick must not destroy the curated allowlist…
		fireEvent.click(restrictSwitch());
		expect(screen.getByText(/No operation-level restriction/)).toBeTruthy();

		// …so toggling back on restores it rather than starting from deny-everything.
		fireEvent.click(restrictSwitch());
		expect(screen.getByRole('button', { name: 'Remove deploy_component' })).toBeTruthy();
		expect(screen.getByRole('checkbox', { name: /^read_only/ }).getAttribute('checked')).not.toBeNull();
	});

	it('warns that an empty allowlist denies everything', () => {
		render(<Harness initial={[]} />);
		expect(screen.getByText(/cannot run any operation/)).toBeTruthy();
	});

	it('toggles predefined groups via checkboxes and reports the effective expansion', () => {
		render(<Harness initial={[]} />);
		// Anchored: standard_user's description also mentions read_only.
		fireEvent.click(screen.getByRole('checkbox', { name: /^read_only/ }));
		// read_only expands to 13 distinct handlers (two alias pairs fold).
		expect(screen.getByText(/Effectively allows 13 operations/)).toBeTruthy();
	});

	it('hides the agent group from pre-5.2 instances, unless the role already carries it', () => {
		render(<Harness initial={[]} version="5.1.4" />);
		expect(screen.getByRole('checkbox', { name: /standard_user/ })).toBeTruthy();
		expect(screen.queryByRole('checkbox', { name: /agent/ })).toBeNull();

		// A saved-but-unoffered group must stay visible and removable, not silently counted.
		cleanup();
		render(<Harness initial={['agent']} version="5.1.4" />);
		const agentCheckbox = screen.getByRole('checkbox', { name: /agent/ });
		expect(screen.getByText(/not offered for this instance's Harper version/)).toBeTruthy();
		fireEvent.click(agentCheckbox);
		expect(screen.getByText(/cannot run any operation/)).toBeTruthy();
	});

	it('adds operations from the picker, badges super_user delegations, and writes groups first', () => {
		render(<Harness initial={['standard_user']} />);
		openPicker();
		// get_configuration carries an api_name, so its grant is actually enforced and earns the badge.
		filterPicker('get_configuration');
		const item = screen.getByRole('menuitemcheckbox', { name: /get_configuration/ });
		expect(within(item).getByText('super_user')).toBeTruthy();
		fireEvent.click(item);
		expect(item.getAttribute('aria-checked')).toBe('true');

		// Radix hides everything outside its portal while the menu is open, so close before
		// asserting on the chips and the summary line.
		closePicker();
		expect(screen.getByRole('button', { name: 'Remove get_configuration' })).toBeTruthy();
		expect(screen.getByText(/including some that normally require super_user/)).toBeTruthy();
	});

	it('warns that Harper rejects an allowlist on a super_user or cluster_user role', () => {
		render(
			<OperationsAllowlistEditor value={['read_only']} onChange={() => {}} version="5.2.2" allowlistRejected />,
		);
		expect(screen.getByText(/does not accept an operations allowlist/)).toBeTruthy();
	});

	it('tells a structure_user role which operations bypass the list, rather than calling it inert', () => {
		render(
			<OperationsAllowlistEditor value={['read_only']} onChange={() => {}} version="5.2.2" structureUserDdl />,
		);
		// The allowlist IS enforced for a structure user on everything except DDL.
		expect(screen.getByText(/regardless of the list/)).toBeTruthy();
		expect(screen.getByText(/on any database/)).toBeTruthy();
		expect(screen.queryByText(/has no effect/)).toBeNull();
	});

	it('scopes the DDL carve-out to the listed databases for an array-shaped structure_user', () => {
		render(
			<OperationsAllowlistEditor
				value={['read_only']}
				onChange={() => {}}
				version="5.2.2"
				structureUserDdl={['dev']}
			/>,
		);
		// The array form can never create/drop a database, and its DDL is scoped to those listed.
		expect(screen.getByText('dev')).toBeTruthy();
		expect(screen.queryByText(/create\/drop database/)).toBeNull();
	});

	it('does not promise a super_user delegation for a grant the server cannot enforce', () => {
		render(<Harness initial={['deploy_component']} />);
		expect(screen.queryByText(/normally require super_user/)).toBeNull();
	});

	it('exempts the structure_user DDL carve-out from the cannot-run-anything warning', () => {
		render(<OperationsAllowlistEditor value={[]} onChange={() => {}} version="5.2.2" structureUserDdl />);
		expect(screen.getByText(/except the DDL noted above/)).toBeTruthy();
	});

	it('marks a grant that the server cannot currently enforce', () => {
		render(<Harness initial={[]} />);
		openPicker();
		filterPicker('deploy_component');
		const item = screen.getByRole('menuitemcheckbox', { name: /deploy_component/ });
		expect(within(item).getByText('not yet enforced')).toBeTruthy();
		expect(within(item).queryByText('super_user')).toBeNull();
	});

	it('does not offer a case variant of a known operation as a custom grant', () => {
		render(<Harness initial={[]} />);
		openPicker();
		filterPicker('SEARCH');
		// validateOperations rejects the wrong-case name, so offering it would only produce a save error.
		expect(screen.queryByRole('menuitemcheckbox', { name: /Grant "SEARCH"/ })).toBeNull();
		expect(screen.getAllByRole('menuitemcheckbox').length).toBeGreaterThan(0);
	});

	it('does not offer an alias spelling through the custom-grant path either', () => {
		render(<Harness initial={[]} />);
		openPicker();
		filterPicker('describe_database');
		expect(screen.queryByRole('menuitemcheckbox', { name: /Grant "describe_database"/ })).toBeNull();
	});

	it('offers only the canonical spelling of an alias pair', () => {
		render(<Harness initial={[]} />);
		openPicker();
		filterPicker('describe_');
		// describe_database is an alias whose authorization entry is keyed on describe_schema, so a
		// grant of the alias spelling would be inert.
		expect(screen.queryByRole('menuitemcheckbox', { name: /describe_database/ })).toBeNull();
		expect(screen.getByRole('menuitemcheckbox', { name: /describe_schema/ })).toBeTruthy();
	});

	it('never offers non-delegable operations, not even through the custom-grant path', () => {
		render(<Harness initial={[]} version="5.2.2" />);
		openPicker();
		filterPicker('set_secret');
		expect(screen.queryByRole('menuitemcheckbox', { name: /set_secret/ })).toBeNull();
	});

	it('offers a too-new catalog operation only as a flagged custom grant', () => {
		render(<Harness initial={[]} version="5.0.3" />);
		openPicker();
		filterPicker('list_deployments');
		// Not in this version's list, but the server validates — backports must stay reachable.
		const custom = screen.getByRole('menuitemcheckbox', { name: /Grant "list_deployments"/ });
		expect(custom.textContent).toContain('newer Harper versions');
		expect(screen.queryAllByRole('menuitemcheckbox')).toHaveLength(1);
	});

	it('offers an operation-shaped filter miss as a custom grant, preserving its case', () => {
		render(<Harness initial={[]} />);
		openPicker();
		// Component-registered names can be camelCase; granting a lowercased copy would never match.
		filterPicker('myCustomOp');
		fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Grant "myCustomOp"/ }));
		closePicker();
		expect(screen.getByRole('button', { name: 'Remove myCustomOp' })).toBeTruthy();
	});

	it('keeps unknown existing entries as chips and removes an entry when its chip is dismissed', () => {
		const onChange = vi.fn();
		render(
			<OperationsAllowlistEditor
				value={['read_only', 'mystery_op', 'search']}
				onChange={onChange}
				version="5.2.2"
			/>,
		);
		expect(screen.getByRole('button', { name: 'Remove mystery_op' })).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Remove search' }));
		expect(onChange).toHaveBeenCalledWith(['read_only', 'mystery_op']);
	});
});
