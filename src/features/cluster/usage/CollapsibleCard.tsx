import { ChevronRight } from 'lucide-react';
import { ReactNode, useState } from 'react';

export function CollapsibleCard(
	{ id, header, aside, defaultOpen = true, open: controlledOpen, onOpenChange, children }: {
		id?: string;
		header: ReactNode;
		aside?: ReactNode;
		defaultOpen?: boolean;
		/** Pass with `onOpenChange` to have the parent own the open state. */
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		children: ReactNode;
	},
) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
	const open = controlledOpen ?? uncontrolledOpen;
	const toggle = () => {
		if (controlledOpen === undefined) { setUncontrolledOpen(!open); }
		onOpenChange?.(!open);
	};
	return (
		<section id={id} className="scroll-mt-4 overflow-hidden rounded-xl border border-border">
			<button
				type="button"
				onClick={toggle}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
			>
				<ChevronRight
					className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
				/>
				<div className="min-w-0 flex-1">{header}</div>
				{aside && (
					<span className="shrink-0 self-start pt-0.5 font-mono text-[11px] text-muted-foreground/70">{aside}</span>
				)}
			</button>
			{open && <div className="border-t border-border px-4 py-4">{children}</div>}
		</section>
	);
}

export function HeaderText({ title, meta, children }: { title: string; meta?: string; children?: ReactNode }) {
	return (
		<>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<span className="text-sm font-medium text-foreground">{title}</span>
				{children}
			</div>
			{meta && <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>}
		</>
	);
}
