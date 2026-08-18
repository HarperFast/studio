/**
 * @vitest-environment jsdom
 */
import { OperationsValueNotice } from '@/features/instance/config/roles/operations/OperationsValueNotice';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

/*
 Rendered directly rather than through a consumer: every other assertion reaches this component via
 RoleOperationsSummary, which always passes `assigning`, so the editor wording — the half carrying
 the remedy — had no coverage at all.
*/

afterEach(() => cleanup());

describe('OperationsValueNotice', () => {
	describe('breaks-auth', () => {
		it('gives the editor the full remedy when a database of that name is the other half', () => {
			render(<OperationsValueNotice kind="breaks-auth" databaseCollision />);
			const text = screen.getByText(/authentication breaks for every user/).textContent ?? '';
			expect(text).toContain('Remove the');
			// Required on both paths: while an `operations` database exists, translateRolePermissions
			// throws for any role carrying an allowlist array.
			// The repair that restores auth comes first and stands alone; retiring the database is a
			// separate, optional migration — and must never read as "drop it now".
			expect(text).toContain('that alone restores authentication');
			expect(text).toContain('stops every role from using one');
			expect(text).toContain('dropping it destroys whatever it holds');
			expect(text.indexOf('migrating its data')).toBeLessThan(text.indexOf('dropping it destroys'));
			expect(text).not.toMatch(/Then drop/);
		});

		it('does not tell the author to drop a database that the value does not imply', () => {
			// `operations: true` reaches breaks-auth too, and no `operations` database follows from it.
			render(<OperationsValueNotice kind="breaks-auth" />);
			const text = screen.getByText(/authentication breaks for every user/).textContent ?? '';
			expect(text).toContain('Remove the');
			expect(text).not.toMatch(/drop the/);
		});

		it('tells the assignment surface to pick another role instead of editing JSON it cannot see', () => {
			render(<OperationsValueNotice kind="breaks-auth" assigning />);
			const text = screen.getByText(/breaks authentication for every user/).textContent ?? '';
			expect(text).toContain('Pick a different role');
			expect(text).not.toContain('JSON below');
		});
	});

	describe('malformed', () => {
		it('says the gate is live rather than implying the value is inert', () => {
			render(<OperationsValueNotice kind="malformed" />);
			const text = screen.getByText(/not a list of operation names/).textContent ?? '';
			// The gate enters on `operations !== undefined`, so a bare string denies everything.
			expect(text).toContain('Harper still gates on it');
			// Each shape's outcome named, rather than one lumped claim: a string denies everything, a
			// falsy value fails the requests outright.
			expect(text).toContain('every operation is denied');
			expect(text).toContain('fail outright');
			expect(text).not.toMatch(/breaks authentication/);
		});

		it('points each surface at somewhere it can actually be fixed', () => {
			render(<OperationsValueNotice kind="malformed" />);
			expect(screen.getByText(/Correct it in the JSON below/)).toBeTruthy();

			cleanup();
			render(<OperationsValueNotice kind="malformed" assigning />);
			expect(screen.getByText(/Correct it in the role editor/)).toBeTruthy();
		});
	});
});
