import appState from '../state/appState';

export default (e) => {
	appState.update((s) => {
		s.orgSearch = e.target.value;
	});
};
