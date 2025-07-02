import appState from '../state/appState';

export default () => {
	appState.update((s) => {
		s.orgSearch = '';
	});
};
