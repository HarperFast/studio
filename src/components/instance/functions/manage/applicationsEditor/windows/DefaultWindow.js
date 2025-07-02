import React from 'react';
import { AddProjectButton } from '../FileMenu';
import { InstallPackageButton } from '../EditorMenu';

export default function DefaultWindow({ active, AddProjectButtonClick, InstallPackageButtonClick }) {
	return !active ? null : (
		<div className="content-window">
			<h4 className="mb-5">Add A New Application</h4>
			<AddProjectButton
				text="Create A New Application Using The Default Template"
				extraClasses="btn btn-block btn-success"
				onClick={AddProjectButtonClick}
			/>
			<InstallPackageButton
				text="Import Or Deploy A Remote Application Package"
				extraClasses="btn btn-block btn-outline-success mt-2"
				onClick={InstallPackageButtonClick}
			/>
		</div>
	);
}
