/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeLegend } from '../../charts/NodeLegend';

describe('NodeLegend', () => {
	afterEach(cleanup);

	const nodes = ['node1.us.acme.com', 'node1.eu.acme.com', 'other.acme.com'];

	it('shows collision-aware short names, not the full FQDN', () => {
		render(<NodeLegend nodeIds={nodes} isActive={() => true} onClickNode={() => {}} />);
		// node1.* collide on the first segment → keep one more segment.
		expect(screen.getByText('node1.us')).toBeTruthy();
		expect(screen.getByText('node1.eu')).toBeTruthy();
		// unique first segment → shortened all the way.
		expect(screen.getByText('other')).toBeTruthy();
		expect(screen.queryByText('node1.us.acme.com')).toBe(null);
	});

	it('keeps the full FQDN on the button title for hover', () => {
		render(<NodeLegend nodeIds={nodes} isActive={() => true} onClickNode={() => {}} />);
		const btn = screen.getByText('other').closest('button');
		expect(btn?.getAttribute('title')).toBe('other.acme.com');
	});

	it('disabled tab keeps its explanatory title instead of the FQDN', () => {
		render(<NodeLegend nodeIds={nodes} isActive={() => true} onClickNode={() => {}} disabled />);
		const btn = screen.getByText('other').closest('button');
		expect(btn?.getAttribute('title')).toBe("Per-node filter unavailable on this tab's panels");
	});
});
