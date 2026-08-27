import { z } from 'zod';

/**
 * What `PATCH /Admin/ClusterGrant/:id` accepts. Deliberately narrower than the grant row: `source`
 * and `clusterId` are not patchable, and `status` only ever moves to REVOKED — there is no
 * hand-reactivate path, so changing those means minting a new grant instead.
 *
 * The server's own guards are mirrored here so a reader gets an inline message rather than a 4xx:
 * see validatePatchClusterGrant and ClusterGrantAdmin.patch in central-manager.
 */
export const GrantFormSchema = z
	.object({
		/** Empty string means "no end" — the form's stand-in for null, which a date input can't hold. */
		endsAt: z.string(),
		expiryPolicy: z.string(),
		allowedPlanIds: z.array(z.string()),
		allowedRegionIds: z.array(z.string()),
		// Every change to the terms carries its why: the server requires it, and it is what the
		// grants table shows in the Reason column afterwards.
		reason: z.string().trim().min(1, 'A reason is required').max(512, 'Keep the reason under 512 characters'),
	})
	.superRefine((values, ctx) => {
		if (!values.endsAt) { return; }
		if (Number.isNaN(new Date(values.endsAt).getTime())) {
			ctx.addIssue({ code: 'custom', path: ['endsAt'], message: "That date isn't valid" });
		}
	});

export type GrantFormValues = z.infer<typeof GrantFormSchema>;

/** `none` is a real policy value meaning "no expiry timeline", distinct from an unset field. */
export const NO_EXPIRY_POLICY = 'none';
