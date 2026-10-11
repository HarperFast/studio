import {
	parseRolePermissionText,
	serializeRolePermission,
} from '@/features/instance/config/roles/editor/rolePermissionModel';
import { LocalRolePermission } from '@/integrations/api/api.patch';
import { orderPermissionKeys } from '@/integrations/api/localRolePermission';
import { useCallback, useState } from 'react';

export interface RolePermissionDraft {
	/** The source of truth, as the JSON view shows it. */
	text: string;
	/** `text` parsed, or null while it isn't a JSON object. */
	permission: LocalRolePermission | null;
	setText: (text: string) => void;
	setPermission: (permission: LocalRolePermission) => void;
}

/**
 * The role editor's draft. A visual edit keeps the document it produced instead of re-parsing the
 * text it serializes to, so every database and table the edit did not touch keeps its object
 * identity — which is what lets the editor skip re-rendering them on a large schema.
 */
export function useRolePermissionDraft(initial: LocalRolePermission): RolePermissionDraft {
	const [draft, setDraft] = useState<Pick<RolePermissionDraft, 'text' | 'permission'>>(() => fromPermission(initial));
	const setText = useCallback((text: string) => setDraft({ text, permission: parseRolePermissionText(text) }), []);
	const setPermission = useCallback((permission: LocalRolePermission) => setDraft(fromPermission(permission)), []);
	return { ...draft, setText, setPermission };
}

function fromPermission(permission: LocalRolePermission) {
	return { text: serializeRolePermission(permission), permission: orderPermissionKeys(permission) };
}
