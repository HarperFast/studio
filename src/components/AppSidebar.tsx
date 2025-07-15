import { Sidebar } from '@/components/ui/sidebar/Sidebar';
import { SidebarContent } from '@/components/ui/sidebar/SidebarContent';
import { SidebarFooter } from '@/components/ui/sidebar/SidebarFooter';
import { SidebarGroup } from '@/components/ui/sidebar/SidebarGroup';
import { SidebarHeader } from '@/components/ui/sidebar/SidebarHeader';

export function AppSidebar() {
	return (
		<Sidebar>
			<SidebarHeader />
			<SidebarContent>
				<SidebarGroup />
				<SidebarGroup />
			</SidebarContent>
			<SidebarFooter />
		</Sidebar>
	);
}
