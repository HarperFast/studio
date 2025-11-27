export const forceBasicAuth = import.meta.env.VITE_FORCE_BASIC_AUTH === 'true';
export const isLocalStudio = import.meta.env.VITE_LOCAL_STUDIO === 'true';
export const localStudioDevUrl = import.meta.env.VITE_LOCAL_STUDIO_DEV_URL;
export const defaultOperationsApiPort = 9925;
export const defaultOperationsApiSecure = true;
export const defaultClusterUsername = 'HDB_ADMIN';

export const defaultInstanceRoute = '/';
export const defaultInstanceRouteUpOne = '../';

export const maxUploadFileSize = 1024 /* mb */ * 1024 /* kb */ * 1024 /* b */;
export const maxFabricConnectUploadFileSize = 100 /* mb */ * 1024 /* kb */ * 1024 /* b */;
