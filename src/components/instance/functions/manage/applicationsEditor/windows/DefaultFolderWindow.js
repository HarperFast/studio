import React from 'react';

export default function DefaultFolderWindow({ active, type }) {
	return !active ? null : (
		<div className="content-window text-nowrap">
			<i className="fa fa-exclamation-triangle mt-5 pt-5" />
			&nbsp;<span>You have selected a {type}. Nothing to see here!</span>
		</div>
	);
}
