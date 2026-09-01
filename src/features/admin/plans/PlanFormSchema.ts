import { z } from 'zod';

/**
 * The three plan fields an admin may change from here.
 *
 * Everything else — limits, price, resources, the deployment and performance labels — is the plan's
 * definition, and lives in central-manager's `src/models/plan.json` behind a reviewed diff. Three
 * properties of the Plan table make that the right home rather than a preference:
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
 * The three below are exempt because none of them is retroactive: retiring hides a plan from new
 * provisioning while existing clusters keep running, scoping decides who is offered it, and the
 * Stripe price is the field you need to repair when a plan is invoicing nothing.
 */
export const PlanFormSchema = z.object({
	// INACTIVE retires a plan: GET /Plan hides it from customers, existing clusters keep running.
	status: z.enum(['ACTIVE', 'INACTIVE']),
	// Empty ⇒ available to every organization.
	organizationIds: z.array(z.string()),
	// Required for a paid, active plan: without it createInvoiceLineItem adds no line, so blocks on
	// the plan invoice for nothing and only a log line says so.
	stripePriceId: z.string().trim(),
	/**
	 * Carried but never edited. The billable rule below needs it, and reading it from form state
	 * rather than closing over the record keeps the rule in one place — the same schema the resolver
	 * and any test both use.
	 */
	priceUsd: z.number(),
}).superRefine((values, ctx) => {
	if (values.priceUsd > 0 && values.status === 'ACTIVE' && !values.stripePriceId) {
		ctx.addIssue({
			code: 'custom',
			path: ['stripePriceId'],
			message: 'A paid, active plan needs a Stripe price — nothing on it can be invoiced without one',
		});
	}
});

export type PlanFormValues = z.infer<typeof PlanFormSchema>;

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
