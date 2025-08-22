import pdfParse from 'pdf-parse';

declare global {
	var Buffer: BufferConstructor;
}

if (typeof Buffer === 'undefined') {
	(globalThis as any).Buffer = {
		from(input: ArrayBuffer | Uint8Array): any {
			if (input instanceof ArrayBuffer) {
				return new Uint8Array(input);
			}
			return input;
		},
	};
}

interface PDFInfo {
	Author?: string;
	Title?: string;
	Subject?: string;
	Creator?: string;
	Producer?: string;
	CreationDate?: string;
	ModDate?: string;
}

interface PDFParseResult {
	numpages: number;
	text: string;
	info: PDFInfo;
}

interface Env {
	FOLDER_ID: string;
	GOOGLE_CLIENT_EMAIL: string;
	GOOGLE_PRIVATE_KEY: string;
	GOOGLE_PROJECT_ID: string;
}

interface ParsedContent {
	content: string;
	metadata: {
		fileType: string;
		fileName: string;
		fileSize?: number;
		pageCount?: number;
		author?: string;
		title?: string;
		subject?: string;
		creator?: string;
		producer?: string;
		creationDate?: Date;
		modificationDate?: Date;
	};
}

interface FileParseResult {
	success: boolean;
	data?: ParsedContent;
	error?: string;
}

export class FileParser {
	private static readonly SUPPORTED_MIME_TYPES = [
		'application/pdf',
		'text/plain',
		'text/csv',
		'application/json',
		'text/markdown',
		'application/vnd.google-apps.document',
		'application/vnd.google-apps.spreadsheet',
		'application/vnd.google-apps.presentation',
	];

	/**
	 * Check if a file type is supported for parsing
	 * @param mimeType - The MIME type of the file
	 * @returns boolean indicating if the file type is supported
	 */
	static isSupportedFileType(mimeType: string): boolean {
		return this.SUPPORTED_MIME_TYPES.includes(mimeType);
	}

	/**
	 * Get list of supported file types
	 * @returns Array of supported MIME types
	 */
	static getSupportedFileTypes(): string[] {
		return [...this.SUPPORTED_MIME_TYPES];
	}

	/**
	 * Parse a file from binary data
	 * @param fileData - Binary data of the file
	 * @param fileName - Name of the file
	 * @param mimeType - MIME type of the file
	 * @returns Promise<FileParseResult> - Parsed content and metadata
	 */
	static async parseFile(fileData: ArrayBuffer, fileName: string, mimeType: string): Promise<FileParseResult> {
		try {
			if (!this.isSupportedFileType(mimeType)) {
				return {
					success: false,
					error: `Unsupported file type: ${mimeType}. Supported types: ${this.SUPPORTED_MIME_TYPES.join(', ')}`,
				};
			}

			switch (mimeType) {
				case 'application/pdf':
					return await this.parsePDF(fileData, fileName);
				case 'text/plain':
				case 'text/csv':
				case 'text/markdown':
					return await this.parseTextFile(fileData, fileName, mimeType);
				case 'application/json':
					return await this.parseJSONFile(fileData, fileName);
				case 'application/vnd.google-apps.document':
				case 'application/vnd.google-apps.spreadsheet':
				case 'application/vnd.google-apps.presentation':
					return {
						success: false,
						error: `Google Apps files (${mimeType}) need to be exported to a supported format first. Use Google Drive API export functionality.`,
					};
				default:
					return {
						success: false,
						error: `Parser not implemented for file type: ${mimeType}`,
					};
			}
		} catch (error) {
			return {
				success: false,
				error: `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	/**
	 * Parse PDF file using pdf-parse library
	 * @param fileData - Binary data of the PDF
	 * @param fileName - Name of the file
	 * @returns Promise<FileParseResult> - Parsed PDF content and metadata
	 */
	private static async parsePDF(fileData: ArrayBuffer, fileName: string): Promise<FileParseResult> {
		try {
			const buffer = new Uint8Array(fileData);
			const nodeBuffer = Buffer.from(buffer);
			const pdfData: PDFParseResult = await pdfParse(nodeBuffer);

			return {
				success: true,
				data: {
					content: pdfData.text,
					metadata: {
						fileType: 'PDF',
						fileName,
						fileSize: fileData.byteLength,
						pageCount: pdfData.numpages,
						author: pdfData.info?.Author,
						title: pdfData.info?.Title,
						subject: pdfData.info?.Subject,
						creator: pdfData.info?.Creator,
						producer: pdfData.info?.Producer,
						creationDate: pdfData.info?.CreationDate ? new Date(pdfData.info.CreationDate) : undefined,
						modificationDate: pdfData.info?.ModDate ? new Date(pdfData.info.ModDate) : undefined,
					},
				},
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	/**
	 * Parse text-based files (plain text, CSV, markdown)
	 * @param fileData - Binary data of the text file
	 * @param fileName - Name of the file
	 * @param mimeType - MIME type of the file
	 * @returns Promise<FileParseResult> - Parsed text content and metadata
	 */
	private static async parseTextFile(fileData: ArrayBuffer, fileName: string, mimeType: string): Promise<FileParseResult> {
		try {
			const decoder = new TextDecoder('utf-8');
			const content = decoder.decode(fileData);

			const fileTypeMap: Record<string, string> = {
				'text/plain': 'Text',
				'text/csv': 'CSV',
				'text/markdown': 'Markdown',
			};

			return {
				success: true,
				data: {
					content,
					metadata: {
						fileType: fileTypeMap[mimeType] || 'Text',
						fileName,
						fileSize: fileData.byteLength,
					},
				},
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to parse text file: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	/**
	 * Parse JSON files with validation
	 * @param fileData - Binary data of the JSON file
	 * @param fileName - Name of the file
	 * @returns Promise<FileParseResult> - Parsed JSON content and metadata
	 */
	private static async parseJSONFile(fileData: ArrayBuffer, fileName: string): Promise<FileParseResult> {
		try {
			const decoder = new TextDecoder('utf-8');
			const content = decoder.decode(fileData);

			JSON.parse(content);

			return {
				success: true,
				data: {
					content,
					metadata: {
						fileType: 'JSON',
						fileName,
						fileSize: fileData.byteLength,
					},
				},
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to parse JSON file: ${error instanceof Error ? error.message : 'Invalid JSON format'}`,
			};
		}
	}

	/**
	 * Extract key information from parsed content using simple heuristics
	 * Useful for academic/ISE documents
	 * @param parsedContent - The parsed content object
	 * @returns Object with extracted key information
	 */
	static extractKeyInformation(parsedContent: ParsedContent): {
		summary: string;
		keywords: string[];
		headings: string[];
		potentialTables: boolean;
		wordCount: number;
		lineCount: number;
	} {
		const { content } = parsedContent;
		const lines = content.split('\n');

		const headings = lines
			.filter((line) => {
				const trimmed = line.trim();
				return (
					trimmed.length > 0 &&
					trimmed.length < 100 &&
					(trimmed === trimmed.toUpperCase() || /^[A-Z][^.]*$/.test(trimmed) || /^\d+\.?\s+[A-Z]/.test(trimmed))
				);
			})
			.slice(0, 10);

		const academicKeywords = [
			'analysis',
			'research',
			'study',
			'method',
			'approach',
			'system',
			'design',
			'implementation',
			'evaluation',
			'results',
			'conclusion',
			'abstract',
			'introduction',
			'methodology',
			'framework',
			'model',
			'algorithm',
			'performance',
			'optimization',
			'requirements',
			'architecture',
		];

		const foundKeywords = academicKeywords.filter((keyword) => content.toLowerCase().includes(keyword));

		const potentialTables = lines.some((line) => line.split('\t').length > 3 || /\s{4,}\S+\s{4,}\S+/.test(line));

		const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 20);
		const summary = sentences.slice(0, 3).join('. ').substring(0, 300) + '...';

		return {
			summary: summary || content.substring(0, 300) + '...',
			keywords: foundKeywords,
			headings,
			potentialTables,
			wordCount: content.split(/\s+/).filter((word) => word.length > 0).length,
			lineCount: lines.length,
		};
	}

	/**
	 * Fetch and parse a file from Google Drive
	 * @param fileId - Google Drive file ID
	 * @param env - Environment variables for Google API
	 * @returns Promise<FileParseResult> - Parsed file content and metadata
	 */
	static async parseFileFromDrive(fileId: string, env: Env): Promise<FileParseResult> {
		try {
			const fileMetadata = await this.getFileMetadata(fileId, env);
			if (!fileMetadata.success) {
				return {
					success: false,
					error: fileMetadata.error,
				};
			}

			const { name, mimeType } = fileMetadata.data!;

			if (!this.isSupportedFileType(mimeType)) {
				return {
					success: false,
					error: `Unsupported file type: ${mimeType}. Supported types: ${this.SUPPORTED_MIME_TYPES.join(', ')}`,
				};
			}

			const fileContent = await this.downloadFileFromDrive(fileId, env);
			if (!fileContent.success) {
				return {
					success: false,
					error: fileContent.error,
				};
			}

			return await this.parseFile(fileContent.data!, name, mimeType);
		} catch (error) {
			return {
				success: false,
				error: `Failed to fetch and parse file from Drive: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	/**
	 * Get file metadata from Google Drive
	 * @param fileId - Google Drive file ID
	 * @param env - Environment variables for Google API
	 * @returns Promise with file metadata
	 */
	private static async getFileMetadata(
		fileId: string,
		env: Env
	): Promise<{
		success: boolean;
		data?: { name: string; mimeType: string; size?: number };
		error?: string;
	}> {
		try {
			const accessToken = await this.getAccessToken(env);
			const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`;

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (!response.ok) {
				return {
					success: false,
					error: `Failed to get file metadata: ${response.status} ${response.statusText}`,
				};
			}

			const data: any = await response.json();
			return {
				success: true,
				data: {
					name: data.name,
					mimeType: data.mimeType,
					size: data.size ? parseInt(data.size) : undefined,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to fetch file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	/**
	 * Download file content from Google Drive
	 * @param fileId - Google Drive file ID
	 * @param env - Environment variables for Google API
	 * @returns Promise with file content as ArrayBuffer
	 */
	private static async downloadFileFromDrive(
		fileId: string,
		env: Env
	): Promise<{
		success: boolean;
		data?: ArrayBuffer;
		error?: string;
	}> {
		try {
			const accessToken = await this.getAccessToken(env);
			const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (!response.ok) {
				return {
					success: false,
					error: `Failed to download file: ${response.status} ${response.statusText}`,
				};
			}

			const arrayBuffer = await response.arrayBuffer();
			return {
				success: true,
				data: arrayBuffer,
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	/**
	 * Get access token for Google Drive API (copied from gdrive.ts)
	 * @param env - Environment variables
	 * @returns Promise<string> - Access token
	 */
	private static async getAccessToken(env: Env): Promise<string> {
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

			const data: any = await tokenResponse.json();
			return data.access_token;
		} catch (error: any) {
			throw error;
		}
	}
}

export default FileParser;
