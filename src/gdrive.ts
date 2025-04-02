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

async function getAccessToken(env: Env): Promise<string> {
	try {
		if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
			throw new Error('Missing required environment variables: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY');
		}

		console.log('Creating JWT...');
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

		console.log('Processing private key...');
		const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
		console.log('Private key starts with:', privateKey.substring(0, 27));

		if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
			throw new Error('Private key is not in PEM format');
		}

		const pemHeader = '-----BEGIN PRIVATE KEY-----\n';
		const pemFooter = '\n-----END PRIVATE KEY-----';
		const pemContents = privateKey
			.substring(privateKey.indexOf(pemHeader) + pemHeader.length, privateKey.indexOf(pemFooter))
			.replace(/\s/g, '');

		console.log('Extracted base64 length:', pemContents.length);

		try {
			const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
			console.log('Converted to binary, length:', binaryDer.length);

			console.log('Importing key...');
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

			console.log('Key imported successfully');
			const encoder = new TextEncoder();
			const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyData, encoder.encode(signatureInput));

			const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
			const jwt = `${signatureInput}.${encodedSignature}`;

			console.log('Requesting token...');
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
			console.log('Got token successfully');
			return data.access_token;
		} catch (e: any) {
			console.error('Error processing private key:', e);
			throw new Error(`Failed to process private key: ${e.message}`);
		}
	} catch (error: any) {
		console.error('Error in getAccessToken:', error);
		throw error;
	}
}

export async function listDriveFiles(env: Env, folderId: string = env.FOLDER_ID): Promise<DriveFile[]> {
	try {
		console.log('Getting access token...');
		const accessToken = await getAccessToken(env);
		console.log('Got access token:', accessToken.substring(0, 10) + '...');

		const cleanFolderId = folderId.split('?')[0];
		console.log('Using folder ID:', cleanFolderId);

		const folderUrl = `https://www.googleapis.com/drive/v3/files/${cleanFolderId}?fields=id,name,mimeType`;
		console.log('Checking folder:', folderUrl);

		const folderResponse = await fetch(folderUrl, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!folderResponse.ok) {
			const errorText = await folderResponse.text();
			console.error('Folder check error:', {
				status: folderResponse.status,
				statusText: folderResponse.statusText,
				body: errorText,
			});
			throw new Error(`Folder check failed: ${folderResponse.status} ${folderResponse.statusText}`);
		}

		const folderData = await folderResponse.json();
		console.log('Folder details:', folderData);

		const url = `https://www.googleapis.com/drive/v3/files?q='${cleanFolderId}' in parents and trashed=false&fields=files(id,name,mimeType,size,modifiedTime,createdTime)&pageSize=1000`;
		console.log('Fetching from URL:', url);

		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Drive API error:', {
				status: response.status,
				statusText: response.statusText,
				body: errorText,
			});
			throw new Error(`Drive API error: ${response.status} ${response.statusText}`);
		}

		const data = (await response.json()) as DriveResponse;
		console.log('Drive API response:', JSON.stringify(data, null, 2));

		const files = (data.files || []).filter(
			(file): file is DriveFile => typeof file.name === 'string' && typeof file.id === 'string' && typeof file.mimeType === 'string'
		);
		console.log('Filtered files:', files.length, 'files found');
		return files;
	} catch (error) {
		console.error('Error listing drive files:', error);
		throw error;
	}
}

export async function listRootContents(env: Env): Promise<{ name: string; id: string; mimeType: string }[]> {
	console.log('Listing contents of ISE Resources folder...');
	const accessToken = await getAccessToken(env);

	const url = `https://www.googleapis.com/drive/v3/files?q='${env.FOLDER_ID}' in parents and trashed=false&fields=files(id,name,mimeType,owners,permissions,shared,parents)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
	console.log('Fetching folder contents from:', url);

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('Folder listing error:', {
			status: response.status,
			statusText: response.statusText,
			body: errorText,
		});
		throw new Error(`Failed to list folder: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as DriveResponse;
	console.log('Folder contents response:', JSON.stringify(data, null, 2));

	const files = (data.files || []).map((file) => ({
		name: file.name || '',
		id: file.id || '',
		mimeType: file.mimeType || '',
	}));

	console.log(`Found ${files.length} files/folders in ISE Resources:`);
	files.forEach((f) => {
		console.log(`- ${f.name} (${f.mimeType})`);
	});

	return files;
}

export async function listFolders(env: Env, parentFolderId: string = env.FOLDER_ID): Promise<{ name: string; id: string }[]> {
	const files = await listDriveFiles(env, parentFolderId);
	const folders = files.filter((file) => file.mimeType === 'application/vnd.google-apps.folder').map(({ name, id }) => ({ name, id }));
	console.log('Found folders:', folders);
	return folders;
}

export async function listFiles(env: Env, parentFolderId: string = env.FOLDER_ID): Promise<{ name: string; id: string }[]> {
	console.log('listFiles called with folderId:', parentFolderId);
	const files = await listDriveFiles(env, parentFolderId);
	const nonFolderFiles = files
		.filter((file) => file.mimeType !== 'application/vnd.google-apps.folder')
		.map(({ name, id }) => ({ name, id }));
	console.log('Non-folder files:', nonFolderFiles);
	return nonFolderFiles;
}

export async function getCurrentFolder(folderId: string, env: Env): Promise<any> {
	const accessToken = await getAccessToken(env);
	const cleanFolderId = folderId.split('?')[0];
	const url = `https://www.googleapis.com/drive/v3/files/${cleanFolderId}?fields=id,name,mimeType,parents`;

	console.log('Fetching current folder details...');
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		console.error('Error fetching folder details:', text);
		throw new Error(`Failed to fetch folder details: ${response.status} ${text}`);
	}

	const data = await response.json();
	console.log('Current folder details:', data);
	return data;
}

export async function listFoldersWithDetails(env: Env): Promise<{ name: string; id: string; mimeType: string }[]> {
	console.log('Listing all folders...');
	const accessToken = await getAccessToken(env);

	const url = `https://www.googleapis.com/drive/v3/files?q='${env.FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name,mimeType)&pageSize=1000&orderBy=name`;
	console.log('Fetching folders from:', url);

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('Folder listing error:', {
			status: response.status,
			statusText: response.statusText,
			body: errorText,
		});
		throw new Error(`Failed to list folders: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as DriveResponse;
	const folders = (data.files || []).map((folder) => ({
		name: folder.name || '',
		id: folder.id || '',
		mimeType: folder.mimeType || '',
	}));

	console.log('Found folders:', folders);
	return folders;
}
