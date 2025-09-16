import { z } from 'zod';

export const zodRequireEmail = z
	.email({
		error: 'Please enter a valid email address.',
	})
	.toLowerCase()
	.trim();
