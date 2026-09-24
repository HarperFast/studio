import { SubNavMenu } from '@/components/SubNavMenu';
import { NewOrgForm } from '@/features/organizations/components/NewOrgForm';
import { Building2 } from 'lucide-react';

export function NewOrg() {
	return (
		<>
			<SubNavMenu />
			<section className="mx-auto mt-32 w-full max-w-6xl px-4 py-8 md:px-12 md:py-10">
				<header className="mb-8 flex items-center gap-4">
					<div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary dark:text-violet-300">
						<Building2 className="size-6" aria-hidden="true" />
					</div>
					<div>
						<p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Your workspace</p>
						<h1 className="text-3xl font-semibold tracking-tight">Create an organization</h1>
						<p className="mt-2 text-sm text-muted-foreground">A home for your team and clusters in Harper Fabric.</p>
					</div>
				</header>
				<NewOrgForm />
			</section>
		</>
	);
}
