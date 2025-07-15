import { SidebarContext } from '@/components/ui/sidebar/sidebarContext';
import * as React from 'react';

export function useSidebar() {
	const context = React.useContext(SidebarContext);
	if (!context) {
		throw new Error('useSidebar must be used within a SidebarProvider.');
	}

	return context;
}
