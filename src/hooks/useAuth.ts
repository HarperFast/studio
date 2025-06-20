// import apiClient from '@/config/apiClient';
// import { queryKeys } from '@/react-query/constants';
// import { useQuery, useMutation, useQueryClient, QueryCache } from '@tanstack/react-query';
// type OrgRoles = {
// 	id: string;
// 	organizationId: string;
// 	organizationName: string;
// 	roleName: 'admin' | 'member';
// };
// type User = {
// 	id: string;
// 	email: string;
// 	firstname: string;
// 	lastname: string;
// 	roles?: OrgRoles[];
// };

// type SignInCredentials = {
// 	email: string;
// 	password: string;
// };

// export function useAuth {
// 	const queryClient = useQueryClient();
// 	const queryCache = new QueryCache();
//
// 	// const {data: user, isLoading: isUserLoading} = useQuery<User | null>({
// 	// 	queryKey: ['user'],
// 	// 	queryFn: async () => {
// 	// 		const response = await apiClient.get('/User/current' as '/User/{id}');
// 	// 		if (response.status == 200 && response.data) {
// 	// 			return response.data as User;
// 	// 		}
// 	// 		return null;
// 	// 	},
// 	// 	retry: false,
// 	// });
//
// 	const login = useMutation({
// 		mutationFn: async ({ email, password }: SignInCredentials) => {
//      // TODO: The OpenAPI types for /Login/ aren't very comprehensive.
// 			const { status, data } = await apiClient.post('/Login/', {
// 				email,
// 				password,
// 			});
// 			if (status === 200 && data) {
// 				// return data as User;
// 				return console.log('Login successful');
// 			}
// 			throw new Error('Login failed');
// 		},
// 		// onSuccess: (data: User) => {
// 		// 	queryClient.setQueryData(['user'], data);
// 		// },
// 	});
//
// 	const logout = useQuery<User | null>({
// 		queryKey: [queryKeys.user],
// 		queryFn: async () => {
//      // TODO: Pretty sure this is a POST, not a GET...
// 			const response = await apiClient.post('/Logout/');
// 			if (response.status == 200 && response.data) {
// 				queryClient.setQueryData(['user'], null);
// 				queryCache.clear();
// 				return null;
// 			}
// 			throw new Error('Logout failed');
// 		},
// 		retry: false,
// 	});
//
// 	return { login, logout };
// 	// return { user, isPending, isSuccess, login, logout, isAuthenticated };
// }
