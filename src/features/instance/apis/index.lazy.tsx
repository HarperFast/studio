import { APIDocs } from '@/features/instance/apis/APIDocs';
import { createLazyRoute } from '@tanstack/react-router';

export const route = createLazyRoute('/apis')({
	component: APIDocs,
});
