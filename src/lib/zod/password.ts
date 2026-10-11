import { z } from 'zod';

export const zodRequirePassword = z
	.string()
	.nonempty({ error: 'Please enter your password.' });

// Central manager's `PASSWORD_MAX_LENGTH`, which it enforces only on sign-up. Reset and Profile use it
// too, so every form that sets a Fabric account password accepts the same passwords.
export const ACCOUNT_PASSWORD_MAX_LENGTH = 256;
export const ACCOUNT_PASSWORD_TOO_LONG_ERROR =
	`Password cannot be longer than ${ACCOUNT_PASSWORD_MAX_LENGTH} characters.`;
