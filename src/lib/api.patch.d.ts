import { SchemaOrganizationRole, SchemaUser } from '@/lib/api.gen';

/*
 * Over time, it should be our goal to empty out this file. The types here should be described by our OpenAPI docs
 * instead of needing to be maintained on the client side. The types here are either described inaccurately or we have
 * not updated the client side yet to reflect the reality of the API.
 */

interface OrgRoles extends SchemaOrganizationRole {
	id: string;
	organizationId: string;
	organizationName: string; // TODO: SchemaOrganizationRole does NOT have an organizationName...
	roleName: 'admin' | 'member';
}

// TODO: The OpenAPI SchemaUser has every property as optional.
export interface User extends SchemaUser {
	id: string;
	email: string;
	firstname: string;
	lastname: string;
	roles: OrgRoles[];
}
