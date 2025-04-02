# ISE MCP Server

A Google Drive integration server built with Cloudflare Workers and MCP (Model-Controller-Presenter) architecture. This project serves as a learning implementation of the MCP pattern and Cloudflare Workers.

## Features

- Google Drive file/folder operations
- Secure API endpoints with environment-based authentication
- Clean MCP architecture implementation

## Project Structure

```
src/
  ├── index.ts     # Main worker entrypoint
  └── gdrive.ts    # Google Drive integration logic
```

## Environment Variables

Required environment variables:

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID`
- `FOLDER_ID`
- `SHARED_SECRET`

## Future Scope

This project is primarily for learning MCP architecture and may be expanded with:

- Additional Google Drive operations
- Enhanced file management capabilities
- More sophisticated authentication mechanisms
- Extended MCP pattern implementations
