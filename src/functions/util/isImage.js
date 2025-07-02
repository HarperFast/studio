export default (string) =>
	string && (string.match(/^https?.*\.(jpeg|jpg|gif|png)$/) || string.indexOf('data:image') !== -1);
