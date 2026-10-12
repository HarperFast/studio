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

	it('distinguishes an all-inert list from an empty one', () => {
		render(<Harness initial={['deploy_component']} />);
		// The chip is right there, so "Nothing selected" would contradict the screen.
		expect(screen.getByText(/Every entry here is inert/)).toBeTruthy();
		expect(screen.queryByText(/Nothing selected/)).toBeNull();
	});

	it('warns that an empty allowlist denies everything', () => {
		render(<Harness initial={[]} />);
		expect(screen.getByText(/cannot run any Operations API call/)).toBeTruthy();
	});

	it('toggles predefined groups via checkboxes and reports the effective expansion', () => {
		render(<Harness initial={[]} />);
		// Anchored: standard_user's description also mentions read_only.
		fireEvent.click(screen.getByRole('checkbox', { name: /^read_only/ }));
		// read_only: 15 members, minus two folded alias pairs and sql, which the list does not govern.
		expect(screen.getByText(/Effectively allows 12 operations/)).toBeTruthy();
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
		expect(screen.getByText(/cannot run any Operations API call/)).toBeTruthy();
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
		// Before 5.3 the allowlist IS enforced for a structure user on everything except DDL.
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

	describe('from 5.3.0-alpha.1, where the list runs ahead of the structure_user and SQL paths', () => {
		// 5.3.0-beta.2 is the last build that gates first without naming every entry, so it pins the
		// gate-order boundary apart from the beta.3 naming boundary.
		const GATE_FIRST_VERSIONS = ['5.3.0-alpha.1', '5.3.0-beta.2', '5.3.0'];

		it('tells a structure user its DDL needs listing, and names what is missing', () => {
			for (const version of GATE_FIRST_VERSIONS) {
				render(
					<OperationsAllowlistEditor
						value={['read_only', 'create_table']}
						onChange={() => {}}
						version={version}
						structureUserDdl
					/>,
				);
				expect(screen.getByText(/gates its DDL too/), version).toBeTruthy();
				expect(screen.queryByText(/regardless of the list/), version).toBeNull();
				const note = screen.getByText(/Not listed, so Harper refuses them/).textContent ?? '';
				expect(note.split('refuses them:')[1], version).toBe(
					' create_attribute, drop_table, drop_attribute, create_database, drop_database.',
				);
				cleanup();
			}
		});

		it('drops the missing-DDL sentence once every DDL operation is listed', () => {
			const allDdl = [
				'create_attribute',
				'create_database',
				'create_table',
				'drop_attribute',
				'drop_database',
				'drop_table',
			];
			render(<OperationsAllowlistEditor value={allDdl} onChange={() => {}} version="5.3.0" structureUserDdl />);
			expect(screen.getByText(/gates its DDL too/)).toBeTruthy();
			expect(screen.queryByText(/Not listed/)).toBeNull();
		});

		it('does not count an alias spelling as listing the database DDL', () => {
			// create_schema is registered under create_database's api_name, so the gate never matches it.
			render(
				<OperationsAllowlistEditor value={['create_schema']} onChange={() => {}} version="5.3.0" structureUserDdl />,
			);
			expect(screen.getByText(/Not listed, so Harper refuses them/).textContent?.split('refuses them:')[1])
				.toContain('create_database');
		});

		it('keeps an array-shaped structure user to its databases, without the database DDL', () => {
			render(
				<OperationsAllowlistEditor value={[]} onChange={() => {}} version="5.3.0" structureUserDdl={['dev']} />,
			);
			const note = screen.getByText(/gates its DDL too/).textContent ?? '';
			expect(note).toContain('dev');
			expect(note).toContain('cannot reach another database');
			expect(note).not.toContain('create_database');
		});

		it('leaves no DDL exception standing on an empty list, and says SQL is denied too', () => {
			render(<OperationsAllowlistEditor value={[]} onChange={() => {}} version="5.3.0-alpha.1" structureUserDdl />);
			expect(screen.getByText(/not even SQL or its structure-user DDL/)).toBeTruthy();
			expect(screen.queryByText(/except the DDL noted above/)).toBeNull();
			expect(screen.queryByText(/SQL is gated by table permissions, not this list/)).toBeNull();
		});

		it('says the list gates SQL, where before 5.3 it says the opposite', () => {
			render(<Harness initial={[]} version="5.3.0-beta.2" />);
			expect(screen.getByText(/anything unlisted is denied, SQL included/)).toBeTruthy();
			expect(screen.queryByText(/this list does not restrict them/)).toBeNull();

			cleanup();
			render(<Harness initial={[]} version="5.2.15" />);
			expect(screen.getByText(/this list does not restrict them/)).toBeTruthy();
			expect(screen.queryByText(/SQL included/)).toBeNull();
		});

		it('counts sql as a grant, in read_only and on its own chip', () => {
			render(<Harness initial={['read_only']} version="5.3.0-alpha.1" />);
			expect(screen.getByText(/Effectively allows 13 operations/)).toBeTruthy();

			cleanup();
			render(<Harness initial={['sql']} version="5.3.0" />);
			expect(screen.getByText(/Effectively allows 1 operation\./)).toBeTruthy();
			const chip = screen.getByRole('button', { name: 'Remove sql' }).parentElement;
			expect(chip?.getAttribute('title') ?? '').not.toMatch(/changes nothing/);
		});

		it('still treats the deploy grants as inert on the prereleases before beta.3', () => {
			render(<Harness initial={['deploy_component']} version="5.3.0-beta.2" />);
			expect(screen.getByText(/Every entry here is inert/)).toBeTruthy();
		});
	});

	it('calls a saved sql grant inert before 5.3, and says why on its chip', () => {
		render(<Harness initial={['sql']} version="5.2.15" />);
		expect(screen.getByText(/Every entry here is inert/)).toBeTruthy();
		const chip = screen.getByRole('button', { name: 'Remove sql' }).parentElement;
		expect(chip?.getAttribute('title')).toMatch(/changes nothing/);
	});

	it('marks a grant this version cannot enforce, and says which version does', () => {
		render(<Harness initial={[]} />);
		openPicker();
		filterPicker('deploy_component');
		const item = screen.getByRole('menuitemcheckbox', { name: /deploy_component/ });
		expect(within(item).getByText('needs newer Harper')).toBeTruthy();
		expect(within(item).queryByText('super_user')).toBeNull();
	});

	it('treats the deploy operations as real super_user delegations on 5.3', () => {
		render(<Harness initial={['deploy_component', 'get_job']} version="5.3.0" />);
		expect(screen.getByText(/Effectively allows 2 operations, including some that normally require super_user/))
			.toBeTruthy();
		expect(screen.queryByText(/Every entry here is inert/)).toBeNull();

		openPicker();
		filterPicker('deploy_component');
		const item = screen.getByRole('menuitemcheckbox', { name: /deploy_component/ });
		expect(within(item).getByText('super_user')).toBeTruthy();
		expect(within(item).queryByText('needs newer Harper')).toBeNull();
	});

	it('stops offering catchup on 5.3, where no allowlist can reach it, and says so on a saved one', () => {
		render(<Harness initial={['catchup']} version="5.3.0" />);
		expect(screen.getByText(/Every entry here is inert/)).toBeTruthy();
		const chip = screen.getByRole('button', { name: 'Remove catchup' }).parentElement;
		expect(chip?.getAttribute('title')).toMatch(/never lets an operations allowlist grant this operation/);

		openPicker();
		filterPicker('catchup');
		expect(screen.queryByRole('menuitemcheckbox', { name: /catchup/ })).toBeNull();
	});

	it('does not offer a never-granted operation through the custom-grant path either', () => {
		render(<Harness initial={[]} version="5.3.0" />);
		openPicker();
		for (const name of ['catchup', 'get_backup', 'read_transaction_log']) {
			filterPicker(name);
			expect(screen.queryAllByRole('menuitemcheckbox'), name).toHaveLength(0);
		}
	});

	it('does not offer the trust-policy operations, whose handlers insist on a super_user', () => {
		render(<Harness initial={[]} version="5.3.0" />);
		openPicker();
		for (const name of ['add_oidc_trust', 'list_oidc_trust', 'drop_oidc_trust']) {
			filterPicker(name);
			// Not even as a custom grant.
			expect(screen.queryAllByRole('menuitemcheckbox'), name).toHaveLength(0);
		}
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
