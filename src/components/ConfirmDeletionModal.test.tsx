/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDeletionModal } from './ConfirmDeletionModal';

afterEach(() => cleanup());

function renderModal(props: Partial<Parameters<typeof ConfirmDeletionModal>[0]> = {}) {
	render(
		<ConfirmDeletionModal
			typeOfThingBeingDeleted="cluster"
			nameOfThingBeingDeleted="prod-east"
			transitiveVerb="Terminate"
			presentParticiple="Terminating"
			isModalOpen
			setIsModalOpen={vi.fn()}
			deletionConfirmed={vi.fn()}
			deletionPending={false}
			{...props}
		/>,
	);
}

function dataLossWarning() {
	return screen.queryByText('Warning')?.closest('div') ?? null;
}

describe(ConfirmDeletionModal, () => {
	it('names what will be permanently lost', () => {
		renderModal();
		expect(dataLossWarning()?.textContent).toContain(
			'By terminating cluster prod-east you will lose the data stored in it permanently.',
		);
	});

	it('styles the data-loss warning as destructive, not as a caution', () => {
		renderModal();
		const classes = dataLossWarning()?.className.split(/\s+/) ?? [];
		expect(classes).toEqual(expect.arrayContaining(['border-destructive', 'bg-destructive/10', 'text-foreground']));
		expect(classes.some((name) => name.includes('amber'))).toBe(false);
	});

	it('omits the warning when the caller says nothing is lost', () => {
		renderModal({ hideDataLossWarning: true });
		expect(dataLossWarning()).toBeNull();
	});
});
