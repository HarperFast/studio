/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mounted = vi.hoisted(() => [] as string[]);
vi.mock('@/features/instance/config/deployments/components/DeploymentDetail', () => ({
	DeploymentDetail: ({ deploymentId }: { deploymentId: string }) => {
		useEffect(() => {
			mounted.push(deploymentId);
		}, []);
		return <div>{deploymentId}</div>;
	},
}));

import { DeploymentDetailModal } from './DeploymentDetailModal';

afterEach(() => {
	cleanup();
	mounted.length = 0;
});

describe('DeploymentDetailModal', () => {
	it("mounts a fresh detail for each record, so one record's activation never shows on the next", () => {
		const { rerender } = render(<DeploymentDetailModal deploymentId="d1" isModalOpen closeModal={() => {}} />);
		rerender(<DeploymentDetailModal deploymentId="d2" isModalOpen closeModal={() => {}} />);
		expect(mounted).toEqual(['d1', 'd2']);
	});
});
