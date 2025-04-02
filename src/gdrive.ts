interface Env {
	FOLDER_ID: string;
	GOOGLE_CLIENT_EMAIL: string;
	GOOGLE_PRIVATE_KEY: string;
}

interface DriveFile {
	name: string;
	id: string;
	mimeType: string;
}

interface TokenResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
}

interface DriveResponse {
	files: Array<{
		id?: string;
		name?: string;
		mimeType?: string;
	}>;
}

export interface DriveItem {
	name: string;
	id: string;
	mimeType: string;
	isFolder: boolean;
}

async function getAccessToken(env: Env): Promise<string> {
	try {
		if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
			throw new Error('Missing required environment variables: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY');
		}

		const jwtHeader = {
			alg: 'RS256',
			typ: 'JWT',
		};

		const now = Math.floor(Date.now() / 1000);
		const jwtClaimSet = {
			iss: env.GOOGLE_CLIENT_EMAIL,
			scope: 'https://www.googleapis.com/auth/drive.readonly',
			aud: 'https://oauth2.googleapis.com/token',
			exp: now + 3600,
			iat: now,
		};

		const base64UrlEncode = (str: string): string => {
			return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		};

		const encodedHeader = base64UrlEncode(JSON.stringify(jwtHeader));
		const encodedClaimSet = base64UrlEncode(JSON.stringify(jwtClaimSet));
		const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

		const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

		if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
			throw new Error('Private key is not in PEM format');
		}

		const pemHeader = '-----BEGIN PRIVATE KEY-----\n';
		const pemFooter = '\n-----END PRIVATE KEY-----';
		const pemContents = privateKey
			.substring(privateKey.indexOf(pemHeader) + pemHeader.length, privateKey.indexOf(pemFooter))
			.replace(/\s/g, '');

		try {
			const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

			const keyData = await crypto.subtle.importKey(
				'pkcs8',
				binaryDer,
				{
					name: 'RSASSA-PKCS1-v1_5',
					hash: 'SHA-256',
				},
				false,
				['sign']
			);

			const encoder = new TextEncoder();
			const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyData, encoder.encode(signatureInput));

			const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
			const jwt = `${signatureInput}.${encodedSignature}`;

			const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
			});

			if (!tokenResponse.ok) {
				const errorText = await tokenResponse.text();
				throw new Error(`Token request failed: ${tokenResponse.status} ${tokenResponse.statusText}\n${errorText}`);
			}

			const data = (await tokenResponse.json()) as TokenResponse;
			return data.access_token;
		} catch (e: any) {
			throw new Error(`Failed to process private key: ${e.message}`);
		}
	} catch (error: any) {
		throw error;
	}
}

export async function listDriveFiles(env: Env, folderId: string = env.FOLDER_ID): Promise<DriveFile[]> {
	try {
		const accessToken = await getAccessToken(env);
		const cleanFolderId = folderId.split('?')[0];

		const folderUrl = `https://www.googleapis.com/drive/v3/files/${cleanFolderId}?fields=id,name,mimeType`;

		const folderResponse = await fetch(folderUrl, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!folderResponse.ok) {
			throw new Error(`Folder check failed: ${folderResponse.status} ${folderResponse.statusText}`);
		}

		const url = `https://www.googleapis.com/drive/v3/files?q='${cleanFolderId}' in parents and trashed=false&fields=files(id,name,mimeType,size,modifiedTime,createdTime)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=name`;

		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Drive API error: ${response.status} ${response.statusText}`);
		}

		const data = (await response.json()) as DriveResponse;

		const files = (data.files || []).filter(
			(file): file is DriveFile => typeof file.name === 'string' && typeof file.id === 'string' && typeof file.mimeType === 'string'
		);
		return files;
	} catch (error) {
		throw error;
	}
}

export async function listRootContents(env: Env): Promise<{ name: string; id: string; mimeType: string }[]> {
	const accessToken = await getAccessToken(env);

	const url = `https://www.googleapis.com/drive/v3/files?q='${env.FOLDER_ID}' in parents and trashed=false&fields=files(id,name,mimeType,owners,permissions,shared,parents)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to list folder: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as DriveResponse;

	const files = (data.files || []).map((file) => ({
		name: file.name ?? '',
		id: file.id ?? '',
		mimeType: file.mimeType ?? '',
	}));

	return files;
}

export async function listFilesAndFolders(env: Env, folderId: string = env.FOLDER_ID): Promise<DriveItem[]> {
	const accessToken = await getAccessToken(env);
	const cleanFolderId = folderId.split('?')[0];

	const url = `https://www.googleapis.com/drive/v3/files?q='${cleanFolderId}' in parents and trashed=false&fields=files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=name`;

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to list folder contents: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as DriveResponse;

	return (data.files || []).map((file) => ({
		name: file.name ?? '',
		id: file.id ?? '',
		mimeType: file.mimeType ?? '',
		isFolder: file.mimeType === 'application/vnd.google-apps.folder',
	}));
}

export async function listSubfolders(env: Env, folderId: string = env.FOLDER_ID): Promise<DriveItem[]> {
	const items = await listFilesAndFolders(env, folderId);
	return items.filter((item) => item.isFolder);
}

export async function listFilesInFolder(env: Env, folderId: string = env.FOLDER_ID): Promise<DriveItem[]> {
	const items = await listFilesAndFolders(env, folderId);
	return items.filter((item) => !item.isFolder);
}

export async function listFolders(env: Env, parentFolderId: string = env.FOLDER_ID): Promise<{ name: string; id: string }[]> {
	const folders = await listSubfolders(env, parentFolderId);
	return folders.map(({ name, id }) => ({ name, id }));
}

export async function listFiles(env: Env, parentFolderId: string = env.FOLDER_ID): Promise<{ name: string; id: string }[]> {
	const files = await listFilesInFolder(env, parentFolderId);
	return files.map(({ name, id }) => ({ name, id }));
}

export async function getCurrentFolder(folderId: string, env: Env): Promise<any> {
	const accessToken = await getAccessToken(env);
	const cleanFolderId = folderId.split('?')[0];
	const url = `https://www.googleapis.com/drive/v3/files/${cleanFolderId}?fields=id,name,mimeType,parents`;

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to fetch folder details: ${response.status} ${text}`);
	}

	const data = await response.json();
	return data;
}

export async function listFoldersWithDetails(env: Env): Promise<{ name: string; id: string; mimeType: string }[]> {
	const accessToken = await getAccessToken(env);

	const url = `https://www.googleapis.com/drive/v3/files?q='${env.FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name,mimeType)&pageSize=1000&orderBy=name`;

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to list folders: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as DriveResponse;
	const folders = (data.files || []).map((folder) => ({
		name: folder.name ?? '',
		id: folder.id ?? '',
		mimeType: folder.mimeType ?? '',
	}));

	return folders;
}
