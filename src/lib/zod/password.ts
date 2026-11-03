import { z } from 'zod';

export const zodRequirePassword = z
	.string()
	.nonempty({ error: 'Please enter your password.' });

// Central manager's `PASSWORD_MAX_LENGTH`, which it enforces only on sign-up. Reset and Profile use it
// too, so every form that sets a Fabric account password accepts the same passwords.
export const ACCOUNT_PASSWORD_MAX_LENGTH = 256;
export const ACCOUNT_PASSWORD_TOO_LONG_ERROR =
	`Password cannot be longer than ${ACCOUNT_PASSWORD_MAX_LENGTH} characters.`;

export const zodNewAccountPassword = zodRequirePassword
	.min(8, { error: 'Password must be at least 8 characters long.' })
	.max(ACCOUNT_PASSWORD_MAX_LENGTH, { error: ACCOUNT_PASSWORD_TOO_LONG_ERROR });

export const NewAccountPasswordSchema = z
	.object({
		password: zodNewAccountPassword,
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		error: 'Passwords do not match.',
		path: ['confirmPassword'],
	});
