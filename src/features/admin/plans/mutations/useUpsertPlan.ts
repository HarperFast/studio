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
	organizationIds: string[] | null;
	/** null clears it; a paid ACTIVE plan without one is refused by the server. */
	stripePriceId: string | null;
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
