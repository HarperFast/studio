import { zodRequirePassword } from '@/lib/zod/password';
import { zodRequireUsername } from '@/lib/zod/username';
import { z } from 'zod';

export const SignInSchema = z.object({
	username: zodRequireUsername,
	password: zodRequirePassword,
});
