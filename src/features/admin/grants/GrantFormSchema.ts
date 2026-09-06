import { z } from 'zod';

/**
 * The plans central-manager treats as self-hosted for grant scoping — mirrored from
 * `SELF_HOSTED_PLAN_IDS` in its environment.js, deliberately as the same constant rather than
 * derived from `deploymentType`: the constant is what the server checks, and a plan created through
 * the admin form with a self-hosted deployment type but an id outside this list would be judged
 * Harper-hosted there. Matching the server's rule beats matching the server's intent.
 */
export const SELF_HOSTED_PLAN_IDS = ['self-hosted-0', 'self-hosted-2', 'self-hosted-3', 'self-hosted-4'];

export const isSelfHostedPlanId = (planId: string) => SELF_HOSTED_PLAN_IDS.includes(planId);

/**
 * One row of a comp's shape: a plan and the region it runs in. The form holds '' where the server
 * holds null — a self-hosted plan has no region, and a Select cannot carry null.
 */
export const ShapeRowSchema = z.object({
	planId: z.string(),
	regionId: z.string(),
});
export type ShapeRow = z.infer<typeof ShapeRowSchema>;

/**
 * Says, per row, what a comp's shape is missing. A comp is for ONE exact cluster — central-manager
 * admits a claim only when the request's (plan, region) pairs equal these — so every Harper-hosted
 * row needs its region, and a self-hosted row must not carry one.
 */
function addShapeIssues(shape: ShapeRow[], ctx: z.RefinementCtx) {
	shape.forEach((row, index) => {
		if (!row.planId) {
			ctx.addIssue({ code: 'custom', path: ['shape', index, 'planId'], message: 'Choose a plan' });
		} else if (!isSelfHostedPlanId(row.planId) && !row.regionId) {
			ctx.addIssue({
				code: 'custom',
				path: ['shape', index, 'regionId'],
				message: 'Choose the region this plan runs in',
			});
		}
	});
}

/** `none` is a real policy value meaning "no expiry timeline", distinct from an unset field. */
export const NO_EXPIRY_POLICY = 'none';

/**
 * Policies central-manager applies to itself, which an admin never picks. `conversion-pending` is
 * the bounded window it mints while a trial->paid conversion is in flight; setting it by hand would
 * time-box a grant against a conversion that is not happening.
 *
 * central-manager's create validation accepts any policy value, so filtering here is what keeps it
 * off the menu.
 */
export const INTERNAL_EXPIRY_POLICIES = ['conversion-pending'];

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
		/** A comp's shape. Empty on every other source, which scope through the allow-lists below. */
		shape: z.array(ShapeRowSchema),
		allowedPlanIds: z.array(z.string()),
		allowedRegionIds: z.array(z.string()),
		// Every change to the terms carries its why: the server requires it, and it is what the
		// grants table shows in the Reason column afterwards.
		reason: z.string().trim().min(1, 'A reason is required').max(512, 'Keep the reason under 512 characters'),
	})
	.superRefine((values, ctx) => {
		addShapeIssues(values.shape, ctx);
		if (!values.endsAt) { return; }
		if (Number.isNaN(new Date(values.endsAt).getTime())) {
			ctx.addIssue({ code: 'custom', path: ['endsAt'], message: "That date isn't valid" });
		}
	});

export type GrantFormValues = z.infer<typeof GrantFormSchema>;

/**
 * What `POST /Admin/ClusterGrant` accepts. Wider than the patch schema: a grant's source and what
 * it binds to are decided at birth and never again.
 *
 * `purchased`, `contracted` and `free` are absent on purpose — central-manager only lets an admin
 * mint trial or comped. The others are derived by the flows that own them.
 */
export const CreateGrantSchema = z
	.object({
		/** 'cluster' binds now; 'organization' mints an unbound voucher a later cluster-create claims. */
		bindTo: z.enum(['cluster', 'organization']),
		clusterId: z.string(),
		organizationId: z.string(),
		source: z.enum(['trial', 'comped']),
		startsAt: z.string(),
		endsAt: z.string(),
		expiryPolicy: z.string(),
		/** The one cluster a comp is for. Required on comped; the server refuses it on anything else. */
		shape: z.array(ShapeRowSchema),
		// Trial scoping. Empty is unrestricted, which is what the server stores as null. No length
		// rule here: the server refuses an empty array, and the form never sends one.
		allowedPlanIds: z.array(z.string()),
		allowedRegionIds: z.array(z.string()),
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

		// A comp has no external bound — no clock, no card — so the shape IS the bound: the server
		// requires it. And once it has an end date it must stage, or the runner would never act on it.
		if (values.source === 'comped') {
			if (values.shape.length === 0) {
				ctx.addIssue({
					code: 'custom',
					path: ['shape'],
					message: 'A comped grant must say which cluster it is for — at least one plan and region',
				});
			}
			addShapeIssues(values.shape, ctx);
			if (values.endsAt && values.expiryPolicy === NO_EXPIRY_POLICY) {
				ctx.addIssue({
					code: 'custom',
					path: ['expiryPolicy'],
					message: 'A comped grant with an end date needs an expiry policy',
				});
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
