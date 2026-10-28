import { organizationNameRegex } from '@/lib/string/regex/organizationNameRegex';
import { z } from 'zod';

export const FALLBACK_ORGANIZATION_NAME = 'My Organization';

export const specifiedOrganizationName = z
	.string()
	.max(255, {
		error: 'Name cannot be longer than 255 characters.',
	})
	.regex(organizationNameRegex, {
		error:
			"Please only use letters A–Z, digits, spaces and ' ’ - . , & ( ) in the name. Must start with a letter or digit.",
	});

export const specifiedSubdomain = z
	.string()
	.max(62, { error: 'Must be at most 62 characters long.' })
	.regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
		error:
			'Please only use lowercase letters, digits and dashes (-) in the subdomain. Must not start or end with a dash.',
	});

export const NewOrganizationSchema = z.object({
	name: z.union([
		z.literal(''),
		specifiedOrganizationName,
	]),
	subdomain: z.union([
		z.literal(''),
		z.undefined(),
		specifiedSubdomain,
	]).optional(),
});

// Organization names are English-only, so accents are dropped (José → Jose).
export function defaultOrganizationName(firstname: string | undefined, lastname: string | undefined): string {
	const fullName = [firstname, lastname].filter(Boolean).join(' ');
	const name = `${fullName} Org`.normalize('NFD').replace(/\p{M}/gu, '');
	return fullName && specifiedOrganizationName.safeParse(name).success ? name : FALLBACK_ORGANIZATION_NAME;
}
