import { zodRequireEmail } from '@/lib/zod/email';
import { zodRequirePassword } from '@/lib/zod/password';
import { zodRequireUsername } from '@/lib/zod/username';
import { z } from 'zod';

export const UsernameSignInSchema = z.object({
	username: zodRequireUsername,
	password: zodRequirePassword,
});

export const EmailSignInSchema = z.object({
	email: zodRequireEmail,
	password: zodRequirePassword,
});
