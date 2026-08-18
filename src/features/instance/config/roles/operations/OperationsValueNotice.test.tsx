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
		it('gives the editor the full remedy, including dropping the database', () => {
			render(<OperationsValueNotice kind="breaks-auth" />);
			const text = screen.getByText(/authentication breaks for every user/).textContent ?? '';
			expect(text).toContain('Remove the');
			// Required on both paths: while an `operations` database exists, translateRolePermissions
			// throws for any role carrying an allowlist array.
			expect(text).toMatch(/then drop the\s*operations\s*database/);
			expect(text).toContain('no role on this instance can use an allowlist at all');
			// The grant-preserving step is additional, not a precondition for the drop.
			expect(text.indexOf('then drop the')).toBeLessThan(text.indexOf('To keep the table grants'));
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
			expect(text).toContain('nothing at all, for a bare string');
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
