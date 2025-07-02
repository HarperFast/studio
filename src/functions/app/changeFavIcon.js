export default (theme) => {
	document.getElementById('dynamic-favicon').href = `/images/favicon_${theme || 'purple'}.png`;
};
