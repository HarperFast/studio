import { z } from 'zod';

const count = (label: string) => z.number({ error: `Enter a number for ${label}` }).min(0, 'Must be zero or more');

/** What a single instance on this plan gets. Every key is required by PlanAdmin's create schema. */
export const ResourcesSchema = z.object({
	storageGb: count('storage'),
	memoryMb: count('memory'),
	cpuCores: count('CPU cores'),
	threads: count('threads'),
	readIopsLimit: count('read IOPS'),
	writeIopsLimit: count('write IOPS'),
});

/** The usage block a purchase mints. `expirationMonths` is also the plan's billing period. */
export const LimitsSchema = z.object({
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
 * Create/edit form for a plan, matching PlanAdmin's `buildPlanSchema` exactly.
 *
 * Deliberately narrower than the Plan record: central-manager validates with `stripUnknown: true`,
 * so anything outside that schema — platformPriceUsd, allowedRegionIds, cloudInstanceTypes,
 * cloudStorageGb, defaultCloudInstanceProvider, gpu, pointerCompression — is silently dropped rather
 * than refused. Offering those fields would promise an edit that never lands; the modal shows them
 * read-only instead.
 */
export const PlanFormSchema = z.object({
	// The plan's primary key — admin-supplied and immutable after create (e.g. "fabric-block-level-1").
	id: z.string().trim().min(1, 'ID is required').regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens'),
	name: z.string().trim().min(1, 'Name is required'),
	// INACTIVE retires a plan: GET /Plan hides it from customers, existing clusters keep running.
	status: z.enum(['ACTIVE', 'INACTIVE']),
	planLevel: z.number({ error: 'Enter a whole number' }).int('Must be a whole number').min(0, 'Must be zero or more'),
	deploymentType: z.enum(['colocated', 'dedicated', 'self-hosted']),
	// The two labels the cluster form groups by: deployment picks the tier list, performance the plan.
	deploymentDescription: z.string().trim().min(1, 'Deployment description is required'),
	performanceDescription: z.string().trim().min(1, 'Performance description is required'),
	priceUsd: z.number({ error: 'Enter a price' }).min(0, 'Must be zero or more'),
	// Empty string means no channel — sent as null, which is what the server stores.
	channel: z.string().trim(),
	// Required for a paid, active plan: without it createInvoiceLineItem adds no line, so blocks on
	// the plan invoice for nothing and only a log line says so. Enforced in the refinement below and
	// again by central-manager, which answers 400.
	stripePriceId: z.string().trim(),
	// Empty ⇒ available to every organization.
	organizationIds: z.array(z.string()),
	resourcesPerInstance: ResourcesSchema,
	planLimits: LimitsSchema,
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

type ResourceKey = keyof z.infer<typeof ResourcesSchema>;
type LimitKey = keyof z.infer<typeof LimitsSchema>;

/** Display metadata for the numeric grids, so 22 near-identical fields aren't written out by hand. */
export const RESOURCE_FIELDS: Array<{ name: ResourceKey; label: string }> = [
	{ name: 'cpuCores', label: 'CPU cores' },
	{ name: 'memoryMb', label: 'Memory (MB)' },
	{ name: 'storageGb', label: 'Storage (GB)' },
	{ name: 'threads', label: 'Threads' },
	{ name: 'readIopsLimit', label: 'Read IOPS' },
	{ name: 'writeIopsLimit', label: 'Write IOPS' },
];

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
