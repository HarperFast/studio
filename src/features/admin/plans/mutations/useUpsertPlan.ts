import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { SchemaPlan } from '@/integrations/api/api.gen';
import { useMutation } from '@tanstack/react-query';

/**
 * What PlanAdmin's `buildPlanSchema` accepts. Narrower than the Plan record on purpose — see
 * PlanFormSchema: the server strips unknown keys instead of refusing them, so sending anything else
 * would look like it worked.
 */
export interface PlanPayload {
	id: string;
	name: string;
	status?: 'ACTIVE' | 'INACTIVE';
	planLevel: number;
	deploymentType: string;
	deploymentDescription: string;
	performanceDescription: string;
	priceUsd: number;
	/** null clears the channel. */
	channel: string | null;
	/** Required by the server for a paid, active plan: without it nothing on the plan can be invoiced. */
	stripePriceId: string | null;
	/** null = available to every organization. */
	organizationIds: string[] | null;
	resourcesPerInstance: Record<string, number>;
	planLimits: Record<string, number>;
}

/** POST /Admin/Plan/ → create a plan. Requires `plan:write`. */
export async function createPlan(payload: PlanPayload): Promise<SchemaPlan> {
	const { data } = await apiClient.post('/Admin/Plan/', payload);
	return data as unknown as SchemaPlan;
}

export function useCreatePlanMutation() {
	return useMutation<SchemaPlan, Error, PlanPayload>({ mutationFn: createPlan });
}

/** Served, but absent from the generated spec like the rest of the by-id Admin routes. */
const planPath = (id: string) => `/Admin/Plan/${id}` as unknown as keyof paths;

export type UpdatePlanInput = { id: string; changes: Partial<Omit<PlanPayload, 'id'>> };

/**
 * PATCH /Admin/Plan/:id → change a plan. Requires `plan:write`.
 *
 * `id` is never sent: it is the primary key, and the server would take it from the body as a value
 * to write. A nested object may be partial — PlanAdmin merges it over the stored one key by key.
 */
export async function updatePlan({ id, changes }: UpdatePlanInput): Promise<SchemaPlan> {
	const { data } = await apiClient.patch(planPath(id), changes);
	return data as unknown as SchemaPlan;
}

export function useUpdatePlanMutation() {
	return useMutation<SchemaPlan, Error, UpdatePlanInput>({ mutationFn: updatePlan });
}
