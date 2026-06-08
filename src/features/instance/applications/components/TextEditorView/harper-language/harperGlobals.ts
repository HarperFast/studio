/**
 * Curated ambient type declarations for Harper, fed to the Monaco TypeScript /
 * JavaScript worker via `addExtraLib`. This gives the Applications editor
 * IntelliSense for the Harper globals (`tables`, `server`, `Resource`, …) and
 * the `harper` module, and stops them from being flagged as undefined.
 *
 * This is a deliberately simplified, hand-maintained mirror of the public
 * surface in `harper/dist/index.d.ts` (and the files it re-exports such as
 * `resources/Resource.d.ts`, `resources/databases.d.ts`, `server/Server.d.ts`,
 * and `utility/logging/logger.d.ts`). We do not bundle Harper's full ~289-file
 * declaration graph; we model the members component authors use most.
 *
 * It is intentionally NOT a real `.d.ts` file: keeping it as a string constant
 * prevents its `declare`/global types from leaking into Studio's own `tsc`
 * build. It is only ever loaded into the in-browser Monaco worker.
 */
export const harperGlobalsDeclaration: string = `
/** Harper structured logger. Each level accepts any number of arguments. */
interface HarperLogger {
	notify(...args: any[]): void;
	fatal(...args: any[]): void;
	error(...args: any[]): void;
	warn(...args: any[]): void;
	info(...args: any[]): void;
	debug(...args: any[]): void;
	trace(...args: any[]): void;
}

/**
 * Base class for any Harper resource. Database tables extend it, and you can
 * extend it to define custom data sources, caching sources, messaging
 * endpoints, and RESTful endpoints. Override the instance methods (get, put,
 * post, patch, delete, subscribe, …) to provide behavior; the static methods
 * are the entry points that wrap calls in a transaction.
 */
declare class Resource<RecordType extends object = any> {
	constructor(identifier?: any, source?: any);

	/** Directly get a resource. Called for HTTP GET requests. */
	static get(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	/** Store the provided record by id. If no id is provided, one is generated. */
	static put(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static patch(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static delete(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static post(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static update(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static invalidate(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static connect(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static subscribe(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static publish(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static search(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static query(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static copy(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	static move(idOrQuery?: any, dataOrContext?: any, context?: any): any;
	/** Create a new resource. If no id is provided, one is generated. */
	static create(record: any, context?: any): Promise<any>;
	static create(idPrefix: any, record: any, context: any): Promise<any>;
	/** Generate a new primary key (a UUID by default). */
	static getNewId(): string;
	static getResource(target: any, request: any, options?: any): Resource | Promise<Resource>;

	/** Get the primary key value for this resource. */
	getId(): any;
	/** Get the context (transaction, user, and more) for this resource. */
	getContext(): any;
	/** Get the current user for the request, or undefined if not logged in. */
	getCurrentUser(): any;

	get?(target?: any): any;
	search?(target?: any): AsyncIterable<RecordType>;
	create?(newRecord?: Partial<RecordType>, target?: any): Promise<any>;
	put?(record?: RecordType, target?: any): any;
	patch?(record?: Partial<RecordType>, target?: any): any;
	post?(target?: any, newRecord?: Partial<RecordType>): any;
	delete?(target?: any): boolean | Promise<boolean>;
	invalidate?(target?: any): void | Promise<void>;
	publish?(target?: any, record?: RecordType, options?: any): void;
	subscribe?(request?: any): AsyncIterable<RecordType>;
	connect?(target?: any, incomingMessages?: any): AsyncIterable<RecordType>;

	allowRead?(user?: any, target?: any, context?: any): boolean | Promise<boolean>;
	allowUpdate?(user?: any, record?: any, context?: any): boolean | Promise<boolean>;
	allowCreate?(user?: any, record?: any, context?: any): boolean | Promise<boolean>;
	allowDelete?(user?: any, target?: any, context?: any): boolean | Promise<boolean>;
}

/** The set of tables in a database, keyed by table name. */
interface HarperTables {
	[tableName: string]: typeof Resource;
}

/** All Harper databases, keyed by database name; each holds its tables. */
interface HarperDatabases {
	[databaseName: string]: HarperTables;
}

/** Central interface for registering server protocol handlers. */
interface HarperServer {
	/** Register an HTTP request handler. */
	http(listener: (request: any, nextLayer: (request: any) => any) => void, options?: any): void;
	/** Register a request handler (alias surface of http). */
	request(listener: (request: any, nextLayer: (request: any) => any) => void, options?: any): void;
	/** Register a WebSocket handler. */
	ws(listener: (ws: any, request: any, requestCompletion: Promise<any>) => any, options?: any): void;
	/** Register a connection upgrade handler. */
	upgrade(listener: (request: any, socket: any, head: any, nextLayer: (...args: any[]) => Promise<void>) => Promise<void>, options?: any): void;
	/** Register a raw socket handler. */
	socket(listener: (socket: any) => void, options: any): void;
	/** Register a custom operation. */
	registerOperation(operationDefinition: any): void;
	/** Run a Harper operation. */
	operation(operation: any, context?: any, authorize?: boolean): Promise<any>;
	/** Record an analytics metric. */
	recordAnalytics(value: any, metric: string, path?: string, method?: string, type?: string): void;
	getUser(username: string, password: string | null, request: any): any;
	authenticateUser(username: string, password: string, request: any): any;
	contentTypes: Map<string, any>;
	hostname: string;
	resources: any;
	nodes: any[];
	replication: any;
	[key: string]: any;
}

/** The default database's tables, keyed by table name. */
declare const tables: HarperTables;
/** All Harper databases, keyed by database name. */
declare const databases: HarperDatabases;
/** The Harper server: register HTTP/WS/socket handlers and operations. */
declare const server: HarperServer;
/** Harper structured logger. */
declare const logger: HarperLogger;
/** Registry of content-type (de)serializers, keyed by media type. */
declare const contentTypes: Record<string, any>;
/** Run a callback inside a Harper transaction. */
declare const transaction: <T = any>(callback: (transaction: any) => T | Promise<T>) => Promise<T>;
/** Create a Blob from binary data or a stream. */
declare const createBlob: (source?: any) => any;
/** Invoke a Harper operation directly. */
declare const operation: (operation: any, context?: any) => Promise<any>;
/** Worker threads available to this resource. */
declare const threads: unknown[];

declare module 'harper' {
	export { Resource, tables, databases, server, logger, contentTypes, transaction, createBlob, operation, threads };

	// Additional value exports from harper's entry point.
	export class RequestTarget {
		constructor(path?: any, query?: any);
		[key: string]: any;
	}
	export function getContext(): any;
	export function getResponse(): any;
	export function getUser(): any;

	// Commonly imported types (modeled loosely; see harper/dist/index.d.ts).
	export type Logger = HarperLogger;
	export type Table = typeof Resource;
	export type Attribute = any;
	export type Context = any;
	export type SourceContext = any;
	export type Query = any;
	export type Session = any;
	export type SubscriptionRequest = any;
	export type RequestTargetOrId = any;
	export type ResourceInterface<RecordType = any> = any;
	export type RecordObject = any;
	export type IterableEventQueue<T = any> = any;
	export type User = any;
}

// Harper components historically import from 'harperdb'; alias it to 'harper'.
declare module 'harperdb' {
	export * from 'harper';
}
`;
