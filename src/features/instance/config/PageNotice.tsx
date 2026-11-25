import { ReactNode } from 'react';

/** A config page's bordered, muted notice, such as why the page has nothing to show. */
export function PageNotice({ children }: { children: ReactNode }) {
	return <p className="rounded-md border p-4 text-sm text-muted-foreground">{children}</p>;
}
