/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigReviewDialog } from './ConfigReviewDialog';

afterEach(cleanup);

function renderDialog(changes: Parameters<typeof ConfigReviewDialog>[0]['changes']) {
	render(
		<ConfigReviewDialog
			open
			onOpenChange={() => {}}
			changes={changes}
			restartNote="Saving restarts Harper."
			warnings={[]}
			saving={false}
			onConfirm={() => {}}
		/>,
	);
	return screen.getByRole('button', { name: 'Save & Restart' }) as HTMLButtonElement;
}

describe('ConfigReviewDialog', () => {
	it('offers the save while there is something to send', () => {
		expect(renderDialog([{ path: ['logging', 'level'], before: 'warn', after: 'debug' }]).disabled).toBe(false);
	});

	it('takes the save away once a refetch has landed every change, so it cannot only restart', () => {
		expect(renderDialog([]).disabled).toBe(true);
	});
});
