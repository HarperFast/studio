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

/**
 * What `POST /Admin/ClusterGrant` accepts. Wider than the patch schema: a grant's source and what
 * it binds to are decided at birth and never again.
 *
 * `purchased` and `enterprise` are absent on purpose — central-manager only lets an admin mint
 * trial, gift or comp. Revenue grants are created by the flows that take the money.
 */
export const CreateGrantSchema = z
	.object({
		/** 'cluster' binds now; 'organization' mints an unbound voucher a later cluster-create claims. */
		bindTo: z.enum(['cluster', 'organization']),
		clusterId: z.string(),
		organizationId: z.string(),
		source: z.enum(['trial', 'gift', 'comp']),
		startsAt: z.string(),
		endsAt: z.string(),
		expiryPolicy: z.string(),
		reason: z.string().trim().min(1, 'A reason is required').max(512, 'Keep the reason under 512 characters'),
	})
	.superRefine((values, ctx) => {
		// The server takes clusterId XOR organizationId — exactly one, never both.
		if (values.bindTo === 'cluster' && !values.clusterId.trim()) {
			ctx.addIssue({ code: 'custom', path: ['clusterId'], message: 'A cluster id is required' });
		}
		if (values.bindTo === 'organization' && !values.organizationId) {
			ctx.addIssue({ code: 'custom', path: ['organizationId'], message: 'An organization is required' });
		}

		// A trial must be time-boxed from birth and stay stageable — the server refuses otherwise.
		if (values.source === 'trial') {
			if (!values.endsAt) {
				ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'A trial must have an end date' });
			}
			if (values.expiryPolicy === NO_EXPIRY_POLICY) {
				ctx.addIssue({ code: 'custom', path: ['expiryPolicy'], message: 'A trial needs an expiry policy' });
			}
		}

		// The window has to actually open, or the grant occupies the cluster's live slot while
		// authorizing nothing.
		if (values.endsAt) {
			const ends = new Date(values.endsAt).getTime();
			if (Number.isNaN(ends)) {
				ctx.addIssue({ code: 'custom', path: ['endsAt'], message: "That date isn't valid" });
			} else {
				const starts = values.startsAt ? new Date(values.startsAt).getTime() : Date.now();
				if (ends <= starts) {
					ctx.addIssue({
						code: 'custom',
						path: ['endsAt'],
						message: values.startsAt ? 'Must be after the start date' : 'Must be in the future',
					});
				}
			}
		}
	});

export type CreateGrantValues = z.infer<typeof CreateGrantSchema>;
