import { z } from 'zod';

export const zodRequireUsername = z
	.string()
	.nonempty({ error: 'Please enter a username.' });
