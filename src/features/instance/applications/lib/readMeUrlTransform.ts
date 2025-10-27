import { currentUrlIncludingHash } from '@/lib/urls/currentUrlIncludingHash';
import { useCallback } from 'react';
import { UrlTransform } from 'react-markdown';

export function useReadMeUrlTransformer(project?: string) {
	return useCallback((url: string, key: string, node: Parameters<UrlTransform>['2']): string | null | undefined => {
		if (key !== 'href') {
			return url;
		}
		if (url.startsWith('http')) {
			node.properties['target'] = '_blank';
			return url;
		} else {
			const urlSansSearch = currentUrlIncludingHash().split('?')[0];
			switch (url) {
				case './apis':
				case './config':
				case './config/roles':
				case './config/users':
				case './databases':
				case './logs':
				case './status':
					return `${urlSansSearch}/${url.slice(2)}`;
			}
			return `${urlSansSearch}?open=${project}/${url.slice(2)}`;
		}
	}, [project]);
}
