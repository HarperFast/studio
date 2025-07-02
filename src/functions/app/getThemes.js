import appState from '../state/appState';

export default (theme) => {
  const is_akamai = window.location.host.indexOf('akamai') >= 0;
  const themes = is_akamai ? ['akamai'] : ['purple', 'light', 'dark'];
  const defaultTheme = 'dark';

  appState.update((s) => {
    s.theme = themes.length === 1 ? themes[0] : themes.indexOf(theme) >= 0 ? theme : defaultTheme;
    s.themes = themes;
    s.is_akamai = is_akamai;
  });
};
