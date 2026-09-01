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

/** The limits shown read-only, grouped the way the plan defines them. */
export const LIMIT_GROUPS: Array<{ heading: string; fields: Array<{ name: string; label: string }> }> = [
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

export const RESOURCE_FIELDS: Array<{ name: string; label: string }> = [
	{ name: 'cpuCores', label: 'CPU cores' },
	{ name: 'memoryMb', label: 'Memory (MB)' },
	{ name: 'storageGb', label: 'Storage (GB)' },
	{ name: 'threads', label: 'Threads' },
	{ name: 'readIopsLimit', label: 'Read IOPS' },
	{ name: 'writeIopsLimit', label: 'Write IOPS' },
];
