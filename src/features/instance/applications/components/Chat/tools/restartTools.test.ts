import {
	RESTART_UNCONFIRMED_MESSAGE,
	RESTART_UNCONFIRMED_TITLE,
	RestartUnconfirmedError,
} from '@/integrations/api/instance/status/restartUnconfirmed';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecuteParams } from '../types/executeParams';
import { execute as createApp } from './createApp/execute';
import { execute as restartHTTPService } from './restartHTTPService/execute';

vi.mock('@/integrations/api/instance/status/restartInstance', () => ({ restartInstance: vi.fn() }));
vi.mock('@/integrations/api/instance/applications/addComponent', () => ({ addComponent: vi.fn() }));
vi.mock('@/lib/events/listener', () => ({ emitToListeners: vi.fn() }));
vi.mock('sonner', () => ({
	toast: { loading: vi.fn(() => 'tool-toast'), error: vi.fn(), success: vi.fn() },
}));

import { addComponent } from '@/integrations/api/instance/applications/addComponent';
import { restartInstance } from '@/integrations/api/instance/status/restartInstance';

function params<T>(input: T): ExecuteParams<T> {
	return {
		input,
		instanceClientParams: { entityType: 'instance', entityId: 'ins-1' } as ExecuteParams['instanceClientParams'],
		baseURL: 'https://ins-1.example.com',
		params: {},
	};
}

const notBackYet = () => new RestartUnconfirmedError(new AxiosError('Network Error', AxiosError.ERR_NETWORK));

function refused() {
	const config = { method: 'post', data: { operation: 'restart_service' } } as never;
	return new AxiosError('Request failed with status code 403', AxiosError.ERR_BAD_REQUEST, config, undefined, {
		status: 403,
		statusText: '',
		data: { error: 'This operation is restricted to super users' },
		headers: {},
		config,
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(addComponent).mockResolvedValue({} as never);
});

describe('restartHTTPService', () => {
	it('tells the agent a restart Harper accepted is not back yet, and not to restart it again', async () => {
		vi.mocked(restartInstance).mockRejectedValue(notBackYet());

		const output = await restartHTTPService(params({}));

		expect(output.success).toBe(true);
		expect(output.message).not.toMatch(/^Error/);
		expect(output.message).toContain("Don't restart it again");
		expect(restartInstance).toHaveBeenCalledOnce();
		expect(toast.error).toHaveBeenCalledWith(
			RESTART_UNCONFIRMED_TITLE,
			expect.objectContaining({
				id: 'tool-toast',
				description: RESTART_UNCONFIRMED_MESSAGE,
			}),
		);
	});

	it('still reports a refused restart as an error, and clears its progress toast', async () => {
		vi.mocked(restartInstance).mockRejectedValue(refused());

		const output = await restartHTTPService(params({}));

		expect(output.success).toBe(false);
		expect(output.message).toMatch(/^Error: /);
		expect(toast.error).toHaveBeenCalledWith('Error', expect.objectContaining({ id: 'tool-toast' }));
	});
});

describe('createApp', () => {
	it('keeps the fact that the app was created when its restart is not back yet', async () => {
		vi.mocked(restartInstance).mockRejectedValue(notBackYet());

		const output = await createApp(params({ name: 'My App', type: 'vanilla' as const }));

		expect(output.success).toBe(true);
		expect(output.message).toMatch(/^App "my-app" created\. Harper accepted the restart/);
		expect(output.message).toContain("Don't create the app or restart again");
		expect(addComponent).toHaveBeenCalledOnce();
	});

	it('clears its progress toast when the app could not be created', async () => {
		vi.mocked(addComponent).mockRejectedValue(new Error('Component my-app already exists'));

		const output = await createApp(params({ name: 'My App', type: 'vanilla' as const }));

		expect(output.success).toBe(false);
		expect(restartInstance).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ id: 'tool-toast' }));
	});
});
