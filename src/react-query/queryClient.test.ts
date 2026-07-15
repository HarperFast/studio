import { MutationObserver } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { errorHandler, queryClient } from './queryClient';

// Mock the toast module
vi.mock('sonner', () => ({
	toast: {
		error: vi.fn().mockReturnValue({
			dismiss: vi.fn(),
		}),
		dismiss: vi.fn(),
	},
}));

describe('errorHandler', () => {
	let consoleMock: MockInstance<Console['error']>;

	beforeEach(() => {
		vi.clearAllMocks();
		consoleMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		// mockRestore (not mockReset) un-installs the spy so the global
		// render-phase-update tripwire's console.error wrapper is back in place
		// at teardown — mockReset leaves a swallowing no-op spy installed, which
		// the tripwire self-check (failOnRenderPhaseUpdate #1520) flags.
		consoleMock.mockRestore();
	});

	it('should display default error message when no specific error info is available', () => {
		// Call errorHandler with a generic error
		errorHandler(new Error());
		expect(consoleMock).toHaveBeenCalled();

		// Verify toast.error was called with the default message
		expect(toast.error).toHaveBeenCalledWith('Error', {
			description: 'We had some trouble!',
			action: {
				label: 'Dismiss',
				onClick: expect.any(Function),
			},
		});
	});

	it('should display error message from axios error.response.data.error', () => {
		// Create a mock Axios error with error property
		const axiosError = {
			response: {
				data: {
					error: 'Specific API error message',
				},
			},
		} as AxiosError<{ error?: string; message?: string }>;

		// Call errorHandler with the axios error
		errorHandler(axiosError);

		// Verify toast.error was called with the specific error message
		expect(toast.error).toHaveBeenCalledWith('Error', {
			description: 'Specific API error message',
			action: {
				label: 'Dismiss',
				onClick: expect.any(Function),
			},
		});
	});

	it('should display a string error message', () => {
		// Call errorHandler with a generic error
		errorHandler('String error message');

		// Verify toast.error was called with the default message
		expect(toast.error).toHaveBeenCalledWith('Error', {
			description: 'String error message',
			action: {
				label: 'Dismiss',
				onClick: expect.any(Function),
			},
		});
	});

	it('should display error message from axios error.response.data.message', () => {
		// Create a mock Axios error with message property
		const axiosError = {
			response: {
				data: {
					message: 'API message error',
				},
			},
		} as AxiosError<{ error?: string; message?: string }>;

		// Call errorHandler with the axios error
		errorHandler(axiosError);

		// Verify toast.error was called with the specific error message
		expect(toast.error).toHaveBeenCalledWith('Error', {
			description: 'API message error',
			action: {
				label: 'Dismiss',
				onClick: expect.any(Function),
			},
		});
	});

	// Feature code (e.g. the Import Data modal) intentionally has no per-mutation onError:
	// the MutationCache routes every mutation error through errorHandler. This pins that
	// wiring so removing it doesn't silently drop all mutation error feedback.
	it('is invoked for failing mutations via the global MutationCache', async () => {
		const observer = new MutationObserver(queryClient, {
			mutationFn: () => Promise.reject(new Error('Import failed: the CSV was malformed')),
		});
		await expect(observer.mutate()).rejects.toThrow('the CSV was malformed');
		expect(toast.error).toHaveBeenCalledWith(
			'Import failed',
			expect.objectContaining({ description: expect.stringContaining('the CSV was malformed') }),
		);
	});

	it('should display error message from generic error.message', () => {
		// Create a generic error with message property
		const genericError = {
			message: 'Generic error message',
		};

		// Call errorHandler with the generic error
		errorHandler(genericError);

		// Verify toast.error was called with the specific error message
		expect(toast.error).toHaveBeenCalledWith('Error', {
			description: 'Generic error message',
			action: {
				label: 'Dismiss',
				onClick: expect.any(Function),
			},
		});
	});

	it('extracts the nested message when response.data.error is a structured object (#1426)', () => {
		const axiosError = {
			response: {
				data: {
					error: { message: 'npm install exited with code 1', code: 'ERR_INSTALL' },
				},
			},
		} as AxiosError<{ error?: unknown; message?: unknown }>;

		errorHandler(axiosError);

		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: 'npm install exited with code 1' }),
		);
	});

	it('never shows "[object Object]" for a structured error without a nested message', () => {
		const axiosError = {
			response: {
				data: {
					error: { code: 500 },
				},
			},
		} as AxiosError<{ error?: unknown; message?: unknown }>;

		errorHandler(axiosError);

		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: '{"code":500}' }),
		);
	});
});
