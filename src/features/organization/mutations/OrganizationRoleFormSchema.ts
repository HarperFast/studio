import { z } from 'zod';

export const OrganizationRoleOverviewSchema = z.object({
	name: z
		.string()
		.nonempty({
			error: 'Please enter a role name.',
		})
		.regex(/^[a-zA-Z_]*$/, {
			error: 'Role must contain only letters and underscores.',
		})
		.max(30, { error: 'Role name cannot be longer than 30 characters.' }),
	update: z.boolean(),
	delete: z.boolean(),
});

export const OrganizationRoleSpecificPermissionsSchema = z.object({
	roles: z.object({
		create: z.boolean(),
		delete: z.boolean(),
		update: z.boolean(),
		view: z.boolean(),
	}),
	clusters: z.object({
		create: z.boolean(),
		delete: z.boolean(),
		update: z.boolean(),
		view: z.boolean(),
		resources: z.array(z.object({
			id: z.string(),
			delete: z.boolean(),
			update: z.boolean(),
			view: z.boolean(),
			instances: z.object({
				create: z.boolean(),
				delete: z.boolean(),
				update: z.boolean(),
				view: z.boolean(),
			}),
		})),
	}),
});

export type OrganizationRoleUpdatePayloadType =
	& z.infer<typeof OrganizationRoleOverviewSchema>
	& z.infer<typeof OrganizationRoleSpecificPermissionsSchema>
	& { organizationId: string };

export type OrganizationRoleOverviewType = z.infer<typeof OrganizationRoleOverviewSchema>;
export type OrganizationRoleSpecificPermissionsType = z.infer<typeof OrganizationRoleSpecificPermissionsSchema>;
