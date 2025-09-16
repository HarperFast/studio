import { z } from 'zod';

export const zodRequirePassword = z
	.string()
	.nonempty({ error: 'Please enter your password.' });
