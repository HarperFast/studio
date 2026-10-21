import { formatHours, STAFF_TOKEN_LIFETIMES, STAFF_TOKEN_ROLES } from '@/features/admin/apiToken/staffTokenRoles';
import { z } from 'zod';

/** Central-manager's NAME_MAX_LENGTH for a staff token. */
export const TOKEN_NAME_MAX_LENGTH = 100;

export const MintTokenSchema = z
	.object({
		ownerUserId: z.string().nonempty({ error: 'Pick an owner.' }),
		role: z.enum(STAFF_TOKEN_ROLES),
		name: z
			.string()
			.trim()
			.nonempty({ error: 'Enter a name.' })
			.max(TOKEN_NAME_MAX_LENGTH, { error: `Name cannot be longer than ${TOKEN_NAME_MAX_LENGTH} characters.` }),
		expiresInHours: z
			.number({ error: 'Enter a whole number of hours.' })
			.int({ error: 'Enter a whole number of hours.' })
			.min(1, { error: 'Must be at least 1 hour.' }),
	})
	// The cap depends on the role, so it can't sit on the field itself.
	.superRefine((values, ctx) => {
		const { maxHours } = STAFF_TOKEN_LIFETIMES[values.role];
		if (values.expiresInHours > maxHours) {
			ctx.addIssue({
				code: 'custom',
				path: ['expiresInHours'],
				message: `A ${values.role} token lives at most ${formatHours(maxHours)} (${maxHours} hours).`,
			});
		}
	});

export type MintTokenValues = z.infer<typeof MintTokenSchema>;
