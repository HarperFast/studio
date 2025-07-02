import React from 'react';
import { Card, CardBody } from 'reactstrap';

export {
	DefaultWindow,
	DefaultFolderWindow,
	GithubRepoSelector,
	NpmPackageSelector,
	PackageInstallWindow,
	UrlInstallField,
	NameProjectWindow,
	NameProjectFolderWindow,
	NameFileWindow,
	DeleteFileWindow,
	DeleteFolderWindow,
	DeletePackageWindow,
} from './windows';

export const EDITOR_WINDOWS = {
	DEFAULT_WINDOW: 'DEFAULT_WINDOW',
	DEFAULT_FOLDER_WINDOW: 'DEFAULT_FOLDER_WINDOW',
	CODE_EDITOR_WINDOW: 'CODE_EDITOR_WINDOW',
	NAME_FILE_WINDOW: 'NAME_FILE_WINDOW',
	NAME_PROJECT_WINDOW: 'NAME_PROJECT_WINDOW',
	NAME_PROJECT_FOLDER_WINDOW: 'NAME_PROJECT_FOLDER_WINDOW',
	RENAME_FILE_WINDOW: 'RENAME_FILE_WINDOW',
	RENAME_FOLDER_WINDOW: 'RENAME_FOLDER_WINDOW',
	DEPLOY_COMPONENT_WINDOW: 'DEPLOY_COMPONENT_WINDOW',
	INSTALL_PACKAGE_WINDOW: 'INSTALL_PACKAGE_WINDOW',
	PACKAGE_DETAILS_WINDOW: 'PACKAGE_DETAILS_WINDOW',
	DELETE_FILE_WINDOW: 'DELETE_FILE_WINDOW',
	DELETE_FOLDER_WINDOW: 'DELETE_FOLDER_WINDOW',
	DELETE_PACKAGE_WINDOW: 'DELETE_PACKAGE_WINDOW',
};

export default function EditorWindow({ children }) {
	return (
		<Card className="editor-window">
			<CardBody>{children}</CardBody>
		</Card>
	);
}
