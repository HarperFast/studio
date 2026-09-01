import { z } from 'zod';

/**
 * The two plan fields an admin may change from here.
 *
 * Everything else — limits, price, resources, the Stripe price, the deployment and performance
 * labels — is the plan's definition, and lives in central-manager's `src/models/plan.json` behind a
 * reviewed diff. Three properties of the Plan table make that the right home rather than a
 * preference:
 *
 * - Edits are retroactive. `clusterUsage` meters each block against its plan's CURRENT `planLimits`,
 *   and Stripe reads `priceUsd`/`stripePriceId` at invoice time, so changing either re-meters and
 *   re-prices every live block on the plan at once, with no versioning or grandfathering.
 * - Nothing records the change. Unlike ClusterGrant, Plan is not an audited table: there is
 *   `updatedByUserId` and last-write-wins, so no before-value and nothing to roll back to.
 * - The drift is permanent. `loadDefaultData` is add-only — it backfills missing fields and never
 *   overwrites an existing value — so a hand edit is never reconciled and plan.json silently stops
 *   describing the deployment.
 *
 * The two below are exempt because neither is retroactive: retiring hides a plan from new
 * provisioning while existing clusters keep running, and scoping decides who is offered it.
 *
 * `stripePriceId` is deliberately NOT among them, though central-manager would accept it. It is set
 * at birth and changed in plan.json like the rest of the definition; a plan already invoicing
 * nothing is taken out of service here and repaired there.
 */
export const PlanFormSchema = z.object({
	// INACTIVE retires a plan: GET /Plan hides it from customers, existing clusters keep running.
	status: z.enum(['ACTIVE', 'INACTIVE']),
	// Empty ⇒ available to every organization.
	organizationIds: z.array(z.string()),
});

export type PlanFormValues = z.infer<typeof PlanFormSchema>;

export const UNBILLABLE_MESSAGE =
	'This plan has no Stripe price, so nothing on it can be invoiced. It can be retired here; the price is set in plan.json.';

/**
 * Whether central-manager will refuse this patch as unbillable, mirroring PlanAdmin.assertBillable —
 * both its rule and, importantly, its trigger.
 *
 * The trigger is the subtle half: the server only assesses billability when the patch touches
 * `status` or `stripePriceId`. Since this form never sends the latter, the trigger reduces to a
 * status change — so scoping an already-unbillable plan stays possible, which is the one mitigation
 * worth having, and retiring one stays possible too because the rule early-returns on any status
 * other than ACTIVE. Only activating a paid plan that has no price is refused.
 *
 * `stripePriceId` is the plan's stored value rather than a form field: it is no longer editable
 * here, so the resulting state always carries whatever the record already had.
 */
export function refusedAsUnbillable(
	{ touchesStatus, priceUsd, status, stripePriceId }: {
		touchesStatus: boolean;
		priceUsd: number;
		status: string;
		stripePriceId: string | null | undefined;
	},
): boolean {
	if (!touchesStatus) { return false; }
	if (priceUsd <= 0 || status !== 'ACTIVE') { return false; }
	return !stripePriceId;
}

const count = (label: string) => z.number({ error: `Enter a number for ${label}` }).min(0, 'Must be zero or more');

/** What a single instance on this plan gets. Every key is required by PlanAdmin's create schema. */
const ResourcesSchema = z.object({
	storageGb: count('storage'),
	memoryMb: count('memory'),
	cpuCores: count('CPU cores'),
	threads: count('threads'),
	readIopsLimit: count('read IOPS'),
	writeIopsLimit: count('write IOPS'),
});

/** The usage block a purchase mints. `expirationMonths` is also the plan's billing period. */
const LimitsSchema = z.object({
	storageBytes: count('storage'),
	totalReadCount: count('total reads'),
	totalReadsBytes: count('total read bytes'),
	readsPerMinuteCount: count('reads per minute'),
	readsPerMinuteBytes: count('read bytes per minute'),
	totalWriteCount: count('total writes'),
	totalWritesBytes: count('total write bytes'),
	writesPerMinuteCount: count('writes per minute'),
	writesPerMinuteBytes: count('write bytes per minute'),
	totalRealTimeMessageDeliveries: count('real-time deliveries'),
	totalRealTimeMessageDeliveryBytes: count('real-time delivery bytes'),
	realTimeMessageDeliveriesPerMinute: count('real-time deliveries per minute'),
	realTimeMessageDeliveryBytesPerMinute: count('real-time delivery bytes per minute'),
	tlsHandshakes: count('TLS handshakes'),
	applicationComputeHours: count('compute hours'),
	expirationMonths: z.number({ error: 'Enter a whole number of months' }).int('Whole months only').min(1, 'At least 1'),
});

/**
 * A new plan, in full. Creating is the one plan write that is not retroactive — a plan with no blocks
 * on it meters and prices nobody until something is provisioned onto it, and there is no prior value
 * to lose. What still applies is drift: `loadDefaultData` never adds a hand-made plan back to
 * plan.json, so a plan born here exists only in this deployment's table.
 *
 * Matches PlanAdmin's `buildPlanSchema` with required=true, so every field the server demands is
 * asked for rather than discovered as a 400.
 */
export const CreatePlanSchema = z.object({
	// The plan's primary key — admin-supplied and immutable after create (e.g. "fabric-block-level-1").
	id: z.string().trim().min(1, 'ID is required').regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens'),
	name: z.string().trim().min(1, 'Name is required'),
	status: z.enum(['ACTIVE', 'INACTIVE']),
	planLevel: z.number({ error: 'Enter a whole number' }).int('Must be a whole number').min(0, 'Must be zero or more'),
	deploymentType: z.enum(['colocated', 'dedicated', 'self-hosted']),
	// The two labels the cluster form groups by: deployment picks the tier list, performance the plan.
	deploymentDescription: z.string().trim().min(1, 'Deployment description is required'),
	performanceDescription: z.string().trim().min(1, 'Performance description is required'),
	priceUsd: z.number({ error: 'Enter a price' }).min(0, 'Must be zero or more'),
	channel: z.string().trim(),
	stripePriceId: z.string().trim(),
	organizationIds: z.array(z.string()),
	resourcesPerInstance: ResourcesSchema,
	planLimits: LimitsSchema,
}).superRefine((values, ctx) => {
	// The same rule the server enforces on create, said before the request rather than after.
	if (values.priceUsd > 0 && values.status === 'ACTIVE' && !values.stripePriceId) {
		ctx.addIssue({
			code: 'custom',
			path: ['stripePriceId'],
			message: 'A paid, active plan needs a Stripe price — nothing on it can be invoiced without one',
		});
	}
});

export type CreatePlanValues = z.infer<typeof CreatePlanSchema>;
export type LimitKey = keyof z.infer<typeof LimitsSchema>;
export type ResourceKey = keyof z.infer<typeof ResourcesSchema>;

/** The limits, grouped the way the plan defines them. Shared by the read-only view and the create form. */
export const LIMIT_GROUPS: Array<{ heading: string; fields: Array<{ name: LimitKey; label: string }> }> = [
	{
		heading: 'Term and storage',
		fields: [
			{ name: 'expirationMonths', label: 'Billing period (months)' },
			{ name: 'storageBytes', label: 'Storage (bytes)' },
			{ name: 'applicationComputeHours', label: 'Compute hours' },
			{ name: 'tlsHandshakes', label: 'TLS handshakes' },
		],
	},
	{
		heading: 'Reads',
		fields: [
			{ name: 'totalReadCount', label: 'Total reads' },
			{ name: 'totalReadsBytes', label: 'Total read bytes' },
			{ name: 'readsPerMinuteCount', label: 'Reads / minute' },
			{ name: 'readsPerMinuteBytes', label: 'Read bytes / minute' },
		],
	},
	{
		heading: 'Writes',
		fields: [
			{ name: 'totalWriteCount', label: 'Total writes' },
			{ name: 'totalWritesBytes', label: 'Total write bytes' },
			{ name: 'writesPerMinuteCount', label: 'Writes / minute' },
			{ name: 'writesPerMinuteBytes', label: 'Write bytes / minute' },
		],
	},
	{
		heading: 'Real-time messaging',
		fields: [
			{ name: 'totalRealTimeMessageDeliveries', label: 'Total deliveries' },
			{ name: 'totalRealTimeMessageDeliveryBytes', label: 'Total delivery bytes' },
			{ name: 'realTimeMessageDeliveriesPerMinute', label: 'Deliveries / minute' },
			{ name: 'realTimeMessageDeliveryBytesPerMinute', label: 'Delivery bytes / minute' },
		],
	},
];

export const RESOURCE_FIELDS: Array<{ name: ResourceKey; label: string }> = [
	{ name: 'cpuCores', label: 'CPU cores' },
	{ name: 'memoryMb', label: 'Memory (MB)' },
	{ name: 'storageGb', label: 'Storage (GB)' },
	{ name: 'threads', label: 'Threads' },
	{ name: 'readIopsLimit', label: 'Read IOPS' },
	{ name: 'writeIopsLimit', label: 'Write IOPS' },
];
