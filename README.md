# Open Compliance Kit (OCK)

A browser-only, client-side ISMS (Information Security Management System) tool for risk and compliance management.

**Website:** [OpenComplianceKit.org](https://opencompliancekit.org)

## Key Features

- **Local-First**: All data stored locally in your browser. No backend required.
- **Encrypted Backups**: Export projects as encrypted, password-protected backups.
- **Risk Management**: Asset and risk register management, scoring, and treatment planning.
- **Control Mapping**: Map and track control implementation status.
- **Responsive**: Works on desktop and mobile browsers.
- **Progressive Enhancement**: Uses modern browser APIs (IndexedDB, Web Crypto, OPFS) with graceful fallbacks.

## Architecture

```
/src
  /app               # Router and orchestrator
  /state             # Centralized store
  /storage           # Storage drivers (abstraction layer)
  /crypto            # Web Crypto API primitives
  /schema            # Validation and sanitization
  /documents         # File ingest and processing
  /import-export     # Backup/restore logic
  /ui                # Components and pages
  /utils             # Helper functions
```

## Browser Support

- **Chrome/Chromium** Supported
- **Edge** Supported
- **Firefox** Supported
- **Safari** Supported (with degraded storage options)
- **iOS Safari** Supported (with limitations)

## Tech Stack

- **TypeScript** for type safety
- **Vite** for build tooling
- **IndexedDB** for structured data storage
- **Web Crypto API** for encryption
- **OPFS** (Origin Private File System) for larger binaries when available

## Development

### Install dependencies

```bash
npm install
```

### Start dev server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Security

- No backend required — all data stays in your browser
- No user accounts or logins
- Passphrases never stored or logged
- AES-GCM encryption with PBKDF2-SHA256 key derivation
- Strict schema validation prevents prototype pollution
- Imported data is never executed or trusted directly

## Storage Strategy

### Required Baseline
- **IndexedDB** for project metadata, documents, manifests
- Standard browser file import/export

### Preferred Enhancement
- **OPFS** (Origin Private File System) for larger binary storage

### Optional Power-User Mode
- **File System Access API** for local folder integration (optional, never required)

## Import/Export

- Export projects as encrypted `.localvault` files
- Export metadata-only JSON for diagnostics
- Import restores projects and documents
- Integrity verification with SHA-256
- Clean rollback on import failure

## Schema Validation

All data loaded from storage, imports, or prior versions passes through strict validation:
- Reject unknown fields
- Detect prototype pollution attempts
- Validate MIME types, file sizes, UUIDs
- Fail closed for ambiguous data

## Language & UX

### Product Language

> Your data is stored locally in this browser.
> There is no server copy.
> Create encrypted backups to avoid data loss.

**Browser Vault:** Stored privately by your browser. Best for quick local use.

**Encrypted Backup:** Download a password-protected backup restorable on another browser or device.

**Local Folder:** Choose a folder (optional, supported browsers only).

## Contributing

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for architecture guidelines and standards.

## License

(License to be specified)

## Support

For issues, questions, or feature requests, please check the project repository or documentation.
