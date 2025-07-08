import { describe, expect, it, vi } from 'vitest';
import { notYetImplemented } from './notYetImplemented';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
	toast: {
		error: vi.fn(),
	},
}));

describe('notYetImplemented', () => {
	it('should call toast.error with the correct message', () => {
		notYetImplemented();

		expect(toast.error).toHaveBeenCalledWith('This feature is not yet implemented!');
	});

	it('should call toast.error exactly once', () => {
		vi.clearAllMocks();

		notYetImplemented();

		expect(toast.error).toHaveBeenCalledTimes(1);
	});
});
