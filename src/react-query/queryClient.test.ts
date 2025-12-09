import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { errorHandler } from './queryClient';

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
		consoleMock.mockReset();
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
});
