import { isLocalStudio } from '@/config/constants';
import { useEffect } from 'react';

let initialized = false;
const enabled = !import.meta.env.DEV && !isLocalStudio;

export function useGTM() {
	useEffect(() => {
		if (initialized) {
			return;
		}
		initialized = true;
		if (enabled) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(function(w: any, d: any, s, l, i) {
				w[l] = w[l] || [];
				w[l].push({
					'gtm.start':
						new Date().getTime(), event: 'gtm.js',
				});
				const f = d.getElementsByTagName(s)[0];
				const j = d.createElement(s);
				const dl = l !== 'dataLayer' ? `&l=${l}` : '';
				j.async = true;
				j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
				f.parentNode.insertBefore(j, f);
			})(window, document, 'script', 'dataLayer', 'GTM-5QQX432');
		}
		}, []);
	}
