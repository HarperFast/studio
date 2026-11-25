import { ReactNode } from 'react';

export function PageNotice({ children }: { children: ReactNode }) {
	return <p className="rounded-md border p-4 text-sm text-muted-foreground">{children}</p>;
}
