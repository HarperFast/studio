/**
 * Renders a role's name alongside its unique id. Role names are not guaranteed to be unique, so the
 * id is shown (muted, monospace) to let users tell apart roles that share a name. Used inside role
 * `<SelectItem>`s — the same markup also renders in the select trigger once a role is chosen.
 */
export function RoleOptionLabel({ name, id }: { name: string; id: string }) {
	return (
		<span className="flex items-baseline gap-2 truncate">
			<span className="truncate">{name}</span>
			<span className="text-muted-foreground font-mono text-xs">{id}</span>
		</span>
	);
}
