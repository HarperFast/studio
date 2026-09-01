import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { SchemaPlan } from '@/integrations/api/api.gen';
import { useMutation } from '@tanstack/react-query';

/**
 * The plan fields studio may change live. Deliberately three: the rest is the plan's definition and
 * is changed in central-manager's plan.json through a reviewed diff — see PlanFormSchema for why.
 */
export interface PlanChanges {
	status?: 'ACTIVE' | 'INACTIVE';
	/** null = available to every organization. */
	organizationIds?: string[] | null;
	/** null clears it; a paid ACTIVE plan without one is refused by the server. */
	stripePriceId?: string | null;
}

/**
 * A create sends the whole definition, so the three live-safe fields are required there even though
 * a patch omits whatever did not change.
 */
type RequiredPlanChanges = { [K in keyof PlanChanges]-?: PlanChanges[K] };

/**
 * The full plan a create must supply — PlanAdmin's buildPlanSchema demands every one with
 * required=true. Wider than PlanChanges on purpose: a definition is set at birth, and afterwards
 * only the three live-safe fields move.
 */
export interface NewPlan extends RequiredPlanChanges {
	id: string;
	name: string;
	planLevel: number;
	deploymentType: string;
	deploymentDescription: string;
	performanceDescription: string;
	priceUsd: number;
	/** null clears the channel. */
	channel: string | null;
	resourcesPerInstance: Record<string, number>;
	planLimits: Record<string, number>;
}

const PLANS_COLLECTION = '/Admin/Plan/' as const;

/** POST /Admin/Plan/ → mint a plan. Requires `plan:write`. */
export async function createPlan(plan: NewPlan): Promise<SchemaPlan> {
	const { data } = await apiClient.post(PLANS_COLLECTION, plan);
	return data as unknown as SchemaPlan;
}

export function useCreatePlanMutation() {
	return useMutation<SchemaPlan, Error, NewPlan>({ mutationFn: createPlan });
}

/** Served, but absent from the generated spec like the rest of the by-id Admin routes. */
const planPath = (id: string) => `/Admin/Plan/${id}` as unknown as keyof paths;

export type UpdatePlanInput = { id: string; changes: PlanChanges };

/**
 * PATCH /Admin/Plan/:id → change a plan. Requires `plan:write`.
 *
 * `id` is never sent: it is the primary key, and the server would take it from the body as a value
 * to write.
 */
export async function updatePlan({ id, changes }: UpdatePlanInput): Promise<SchemaPlan> {
	const { data } = await apiClient.patch(planPath(id), changes);
	return data as unknown as SchemaPlan;
}

export function useUpdatePlanMutation() {
	return useMutation<SchemaPlan, Error, UpdatePlanInput>({ mutationFn: updatePlan });
}
