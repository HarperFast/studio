/** @vitest-environment jsdom */
import type { Instance } from '@/integrations/api/api.patch';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const clock = vi.hoisted(() => ({ useNow: vi.fn(() => Date.parse('2026-10-01T12:00:00Z')) }));
vi.mock('@/hooks/useNow', () => clock);

import { CloneProgressList, InstanceCloneProgress } from './CloneProgress';

function instance(fields: Partial<Instance>): Instance {
	return { id: 'ins-1', instanceFqdn: 'a.example.com', operationsApiPort: 9925, ...fields } as Instance;
}

afterEach(() => {
	cleanup();
	clock.useNow.mockClear();
});

describe('InstanceCloneProgress', () => {
	it('shows a spinning sync icon and the copied amount while cloning', () => {
		const { container } = render(
			<InstanceCloneProgress instance={instance({ status: 'CLONING', cloneExpectedGb: 40, cloneProgressGb: 12.4 })} />,
		);
		expect(screen.getByText('Syncing data · ~12.4 of ~40 GB (31%)')).toBeTruthy();
		expect(container.querySelector('svg.lucide-refresh-cw')).toBeTruthy();
		expect(container.querySelector('[role="progressbar"]')).toBeNull();
	});

	it('shows the copied amount alone without an expected size', () => {
		render(<InstanceCloneProgress instance={instance({ status: 'CLONING', cloneProgressGb: 0 })} />);
		expect(screen.getByText('Syncing data · ~0 GB copied')).toBeTruthy();
	});

	it('shows a static clock icon while the copy is pending', () => {
		const { container } = render(<InstanceCloneProgress instance={instance({ status: 'CLONE_PENDING' })} />);
		expect(screen.getByText('Waiting to sync data')).toBeTruthy();
		expect(container.querySelector('svg.lucide-clock')).toBeTruthy();
		expect(container.querySelector('svg.lucide-refresh-cw')).toBeNull();
	});

	it('subscribes to the clock only when the caption shows an age', () => {
		render(<InstanceCloneProgress instance={instance({ status: 'CLONING', cloneProgressGb: 1 })} />);
		render(<InstanceCloneProgress instance={instance({ status: 'CLONE_PENDING' })} />);
		expect(clock.useNow).not.toHaveBeenCalled();
		render(
			<InstanceCloneProgress
				instance={instance({ status: 'CLONING', cloneProgressGb: 1, cloneProgressAt: '2026-10-01T11:58:00Z' })}
			/>,
		);
		expect(clock.useNow).toHaveBeenCalled();
		expect(screen.getByText('Syncing data · ~1 GB copied · last progress 2 minutes ago')).toBeTruthy();
	});

	it('renders nothing for a running instance that kept its clone fields', () => {
		const { container } = render(
			<InstanceCloneProgress
				instance={instance({ status: 'RUNNING', cloneExpectedGb: 40, cloneProgressGb: 40 })}
			/>,
		);
		expect(container.innerHTML).toBe('');
	});
});

describe('CloneProgressList', () => {
	it('lists only the instances in a clone status, by FQDN', () => {
		render(
			<CloneProgressList
				instances={[
					instance({ id: 'ins-c', name: 'gamma', instanceFqdn: 'c.example.com', status: 'CLONING' }),
					instance({ id: 'ins-r', name: 'alpha', instanceFqdn: 'a.example.com', status: 'RUNNING' }),
					instance({ id: 'ins-b', instanceFqdn: 'b.example.com', status: 'CLONE_PENDING' }),
				]}
			/>,
		);
		const items = screen.getAllByRole('listitem').map((item) => item.textContent);
		expect(items).toEqual([
			'b.example.comWaiting to sync data',
			'gammaSyncing data · ~0 GB copied',
		]);
	});

	it('renders nothing when no instance is cloning', () => {
		const { container } = render(
			<CloneProgressList instances={[instance({ status: 'RUNNING' })]} />,
		);
		expect(container.innerHTML).toBe('');
		render(<CloneProgressList instances={undefined} />);
		expect(screen.queryByRole('list')).toBeNull();
	});
});
