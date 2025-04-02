import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';
import { listFiles, listDriveFiles, listRootContents, getCurrentFolder, listFoldersWithDetails, listFilesAndFolders } from './gdrive';

interface Env {
	GOOGLE_CLIENT_EMAIL: string;
	GOOGLE_PRIVATE_KEY: string;
	GOOGLE_PROJECT_ID: string;
	FOLDER_ID: string;
	SHARED_SECRET: string;
}

function initializeEnv(env: Env) {
	if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_PROJECT_ID || !env.FOLDER_ID || !env.SHARED_SECRET) {
		throw new Error('Missing required environment variables');
	}
}

export default class MyWorker extends WorkerEntrypoint<Env> {
	/**
	 * A warm, friendly greeting from your new Workers MCP server.
	 * @param name {string} the name of the person we are greeting.
	 * @return {string} the contents of our greeting.
	 */
	async sayHello(name: string): Promise<string> {
		initializeEnv(this.env);
		return `Hello ${name}!`;
	}

	/**
	 * @ignore
	 **/
	async fetch(request: Request): Promise<Response> {
		initializeEnv(this.env);
		const proxy = new ProxyToSelf(this);
		return proxy.fetch(request);
	}

	/**
	 * List all files in the root folder or specified folder
	 * @return {string} JSON string containing list of files with their metadata. Each object contains {name: string, id: string}
	 */
	async listFiles(): Promise<string> {
		initializeEnv(this.env);
		const files = await listFiles(this.env);
		return JSON.stringify(files);
	}

	/**
	 * List all files and folders in a specific folder
	 * @param {string} folderId - The ID of the folder to list contents from
	 * @return {string} JSON string containing list of files and folders. Each object contains {name: string, id: string, mimeType: string, isFolder: boolean}
	 */
	async listFilesInFolder(folderId: string): Promise<string> {
		initializeEnv(this.env);
		console.log('Listing contents in folder:', folderId);
		const contents = await listFilesAndFolders(this.env, folderId);
		console.log('Found contents:', contents);
		return JSON.stringify(contents);
	}

	/**
	 * List all contents (files and folders) in the root directory
	 * @return {string} JSON string containing list of all items. Each object contains {name: string, id: string, mimeType: string}
	 */
	async listRootContents(): Promise<string> {
		initializeEnv(this.env);
		console.log('Listing root contents...');
		const contents = await listRootContents(this.env);
		console.log('Root contents:', contents);
		return JSON.stringify(
			contents.map((item) => ({
				name: item.name,
				id: item.id,
				mimeType: item.mimeType,
			}))
		);
	}

	/**
	 * Get details about the current folder
	 * @return {string} JSON string containing details of the current folder with {id: string, name: string, mimeType: string, parents?: Array<string>}
	 */
	async getCurrentFolder(): Promise<string> {
		initializeEnv(this.env);
		console.log('Getting current folder...');
		const folder = await getCurrentFolder(this.env.FOLDER_ID, this.env);
		console.log('Current folder:', folder);
		return JSON.stringify(folder);
	}

	/**
	 * List all folders with their details
	 * @return {string} JSON string containing list of folders. Each object contains {name: string, id: string, mimeType: string}
	 */
	async listFoldersWithDetails(): Promise<string> {
		initializeEnv(this.env);
		console.log('Listing all folders...');
		const folders = await listFoldersWithDetails(this.env);
		console.log('Found folders:', folders);
		return JSON.stringify(
			folders.map((folder) => ({
				name: folder.name,
				id: folder.id,
				mimeType: folder.mimeType,
			}))
		);
	}
}
