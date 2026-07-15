/**
 * @vitest-environment jsdom
 */
import { RemoveUserFromOrgButton } from '@/features/organization/users/components/RemoveUserFromOrgButton';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('RemoveUserFromOrgButton', () => {
	it('removing another user: shows "Remove from organization" and confirms in place', () => {
		const onConfirm = vi.fn();
		render(<RemoveUserFromOrgButton isSelf={false} isPending={false} onConfirm={onConfirm} />);

		const trigger = screen.getByRole('button', { name: /remove from organization/i });
		expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();

		// First click reveals the confirm step (with a warning) without firing the removal.
		fireEvent.click(trigger);
		expect(onConfirm).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: /confirm removal/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /^cancel$/i })).toBeTruthy();
		expect(screen.getByRole('alert').textContent).toMatch(/revokes their access/i);

		// Second click confirms.
		fireEvent.click(screen.getByRole('button', { name: /confirm removal/i }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it('removing yourself: uses gentler "leave" wording', () => {
		const onConfirm = vi.fn();
		render(<RemoveUserFromOrgButton isSelf={true} isPending={false} onConfirm={onConfirm} />);

		fireEvent.click(screen.getByRole('button', { name: /leave organization/i }));
		expect(screen.getByRole('button', { name: /confirm leave/i })).toBeTruthy();
		expect(screen.getByRole('alert').textContent).toMatch(/you’ll lose access/i);
		// The self flow never says "remove".
		expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: /confirm leave/i }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it('cancel returns to the idle state without confirming', () => {
		const onConfirm = vi.fn();
		render(<RemoveUserFromOrgButton isSelf={false} isPending={false} onConfirm={onConfirm} />);

		fireEvent.click(screen.getByRole('button', { name: /remove from organization/i }));
		fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

		expect(onConfirm).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: /remove from organization/i })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /confirm removal/i })).toBeNull();
	});

	it('while a removal is pending both buttons are disabled and show busy copy', () => {
		const onConfirm = vi.fn();
		const { rerender } = render(
			<RemoveUserFromOrgButton isSelf={false} isPending={false} onConfirm={onConfirm} />,
		);

		fireEvent.click(screen.getByRole('button', { name: /remove from organization/i }));
		rerender(<RemoveUserFromOrgButton isSelf={false} isPending={true} onConfirm={onConfirm} />);

		const confirm = screen.getByRole('button', { name: /removing/i });
		const cancel = screen.getByRole('button', { name: /^cancel$/i });
		expect(confirm.hasAttribute('disabled')).toBe(true);
		expect(cancel.hasAttribute('disabled')).toBe(true);

		fireEvent.click(confirm);
		expect(onConfirm).not.toHaveBeenCalled();
	});
});
