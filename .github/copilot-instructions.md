# GitHub Copilot Agent Instructions - Open Compliance Kit

## Project Context
- Product name: Open Compliance Kit (OCK)
- Domain: OpenComplianceKit.org
- Goal: Build a browser-only, client-side ISMS tool.
- Styling and implementation benchmark: openriskregister.com (and the same architecture style as openriskregister.org where applicable).

## Architecture Goal
Build as a client-side only, local-first web application.

There must be no backend requirement for core functionality. All user data, metadata, documents, images, encryption, import/export, validation, and recovery flows should work entirely in the browser.

Expected general pattern:
- static-site deployable
- browser-only runtime
- refresh-safe client routing (hash routes or equivalent)
- modular step/workspace UI
- centralized state store
- strict schema validation and sanitization
- browser-local persistence
- encrypted import/export
- no passphrase storage
- graceful failure on malformed data and wrong passphrase

Main additional capability:
- local client-side document and image storage

## Non-Negotiable Constraints
- No backend dependency for core functionality.
- No server-side rendering requirement.
- Core features must work offline-first after initial load.
- Do not require user account creation for baseline local usage.
- Keep core functionality working without File System Access API.

## Product Direction
Focus on practical ISMS workflows:
- asset and risk register management
- risk scoring and treatment planning
- control mapping and implementation status tracking
- lightweight audit/readiness views and export-friendly outputs

## Storage Strategy
Use progressive browser storage.

Required baseline:
- IndexedDB for structured app state, project metadata, manifests, indexes, thumbnails, and fallback binary storage
- Web Crypto API for encryption/decryption
- standard browser import via <input type="file">
- standard browser export via downloadable files/blobs

Preferred enhanced mode:
- OPFS via navigator.storage.getDirectory() for larger encrypted document/image bytes and chunks

Optional power-user mode:
- File System Access API with showDirectoryPicker and user-selected local folder storage
- this mode is optional and never required for core app usage

Do not assume File System Access API exists in Firefox, Safari, iOS Safari, or locked-down environments.

## Storage Driver Abstraction
Implement storage behind drivers. UI modules must not directly depend on IndexedDB, OPFS, or File System Access APIs.

Use a driver interface equivalent to:

```ts
export interface BinaryStorageDriver {
	readonly kind: 'opfs' | 'indexeddb-blob' | 'external-folder';

	isAvailable(): Promise<boolean>;

	writeFile(params: {
		projectId: string;
		documentId: string;
		bytes: Blob | ArrayBuffer;
		metadata?: Record<string, unknown>;
	}): Promise<StoredBinaryRef>;

	readFile(ref: StoredBinaryRef): Promise<Blob>;

	deleteFile(ref: StoredBinaryRef): Promise<void>;

	exists(ref: StoredBinaryRef): Promise<boolean>;

	listProjectFiles(projectId: string): Promise<StoredBinaryRef[]>;
}
```

Runtime selection:

```ts
if (await opfsDriver.isAvailable()) {
	use opfsDriver;
} else {
	use indexedDbBlobDriver;
}
```

Only expose user-folder mode when:

```ts
'showDirectoryPicker' in window
```

## Recommended Internal Storage Model
Use IndexedDB as canonical DB for:
- projects and project metadata
- normalized entities
- document/image manifests
- tags, notes, thumbnails
- search/index metadata
- crypto metadata
- import/export history
- storage driver references

Use OPFS or IndexedDB blob fallback for binary content.

Example document manifest:

```ts
export interface DocumentManifest {
	id: string;
	projectId: string;
	name: string;
	mimeType: string;
	sizeBytes: number;
	sha256: string;

	storage: {
		driver: 'opfs' | 'indexeddb-blob' | 'external-folder';
		ref: string;
		chunkSizeBytes?: number;
	};

	crypto: {
		encrypted: true;
		version: number;
		cipher: 'AES-GCM';
		kdf?: 'PBKDF2-SHA256';
		salt?: string;
		iterations?: number;
		iv?: string;
		chunking?: 'none' | 'fixed-size';
	};

	createdAt: string;
	updatedAt: string;
}
```

## Encryption Requirements
Sensitive project data and stored documents/images should support encryption via Web Crypto API.

Preferred primitives:
- PBKDF2 with SHA-256 for key derivation
- AES-GCM for encryption
- random salt per vault/project/export
- random IV per encrypted item or chunk
- no stored passphrases
- clean errors for wrong passphrase and malformed envelopes

Passphrases must:
- have minimum length enforcement
- never be stored, logged, or included in telemetry
- never be persisted in localStorage, IndexedDB, OPFS, sessionStorage, or URL fragments

Use versioned crypto envelopes.

```ts
export interface CryptoEnvelope {
	version: number;
	cipher: 'AES-GCM';
	kdf: 'PBKDF2-SHA256';
	salt: string;
	iv: string;
	iterations: number;
	ciphertext: string;
}
```

For large files, prefer chunked encryption to avoid high memory use.

## Import/Export Requirements
Import/export is first-class because browser-private storage is not a normal user-visible folder and can be cleared.

Support:
- encrypted full-project export/import
- plain metadata-only export for diagnostics/interoperability
- schema and app versioning
- integrity hashes
- import preview before restore
- duplicate project handling
- clean rollback on import failure

Default export should be a single downloadable file, e.g. project-name.localvault.

Export package should include:
- project metadata
- manifests
- encrypted document/image bytes or chunks
- thumbnails where needed
- schema version
- crypto metadata
- integrity hashes
- export timestamp

Import flow:
1. User selects backup file.
2. App detects format/version.
3. App validates outer envelope.
4. App prompts for passphrase if encrypted.
5. App decrypts.
6. App validates schemas.
7. App scans for unsupported versions/missing files.
8. App shows summary.
9. App writes metadata to IndexedDB.
10. App writes binaries to OPFS or IndexedDB fallback.
11. App reports success or rolls back cleanly.

Never trust imported data.

## Schema and Sanitization Requirements
All data loaded from IndexedDB, OPFS manifests, localStorage preferences, imports, user JSON, and prior versions must pass strict validation and normalization.

Validation layer requirements:
- reject unknown fields unless explicitly allowed
- reject prototype-pollution keys (__proto__, constructor, prototype)
- validate enums, IDs, MIME types, file sizes, counts, nesting depth, and string lengths
- drop malformed records where safe
- fail closed for dangerous or ambiguous data
- never directly hydrate untrusted objects into app state

Use a schema validation library or dedicated internal validator.

## File Handling Requirements
When importing documents/images:
- validate file size before processing
- validate MIME type and extension
- compute SHA-256
- generate stable internal document ID
- create safe display names
- never trust file names as paths
- prevent path traversal
- never execute imported content
- never inject document content into DOM without sanitization
- generate thumbnails safely
- store metadata separate from binary content
- store original bytes encrypted when encryption is enabled

Do not use user-provided file names as OPFS paths. Use generated IDs, such as:
- /projects/{projectId}/documents/{documentId}.bin
- /projects/{projectId}/thumbnails/{documentId}.webp

## Browser Compatibility and Progressive Enhancement
Check support with:

```ts
const supportsIndexedDB = 'indexedDB' in window;
const supportsWebCrypto = !!crypto?.subtle;
const supportsOPFS = !!navigator.storage?.getDirectory;
const supportsFileSystemAccess = 'showDirectoryPicker' in window;
```

Behavior:
- if IndexedDB is unavailable, show unsupported-browser message
- if Web Crypto is unavailable, disable encrypted vault features and warn
- if OPFS is unavailable, use IndexedDB blob storage
- if File System Access API is unavailable, hide folder mode
- do not break core app when OPFS/folder mode is unavailable

Target test coverage at minimum:
- Chrome/Chromium
- Edge
- Firefox
- Safari desktop
- iOS Safari when mobile support is in scope

## Quota and Persistence Requirements
Implement quota checks via navigator.storage.estimate() and request persistence via navigator.storage.persist() where appropriate.

UX should warn when storage is near full and clearly explain:
- data is local to this browser
- browser storage is not a normal folder
- clearing site data can remove data
- encrypted exports are the recovery mechanism
- no backend copy exists unless user creates one

Add backup reminders, such as:
- You have never exported a backup.
- You added documents since your last backup.
- Your local browser storage is getting full.
- Create encrypted backup.

## Routing and State Structure
Keep a modular client-side structure similar to:

```text
/src
	/app
		router.ts
		orchestrator.ts
	/state
		store.ts
		projectStore.ts
		documentStore.ts
	/storage
		indexedDb.ts
		opfsDriver.ts
		indexedDbBlobDriver.ts
		externalFolderDriver.ts
		storageManager.ts
	/crypto
		deriveKey.ts
		encrypt.ts
		decrypt.ts
		envelopes.ts
	/schema
		projectSchema.ts
		documentSchema.ts
		importSchema.ts
		sanitize.ts
	/documents
		ingest.ts
		thumbnails.ts
		hashing.ts
		mime.ts
	/import-export
		exportProject.ts
		importProject.ts
		packageFormat.ts
	/ui
		/steps
		/components
	/utils
```

Keep UI modules separate from storage, crypto, schema, import/export packaging, and routing orchestration logic.

## Security Rules
Do not:
- add backend for core functionality
- store passphrases or log secrets
- store sensitive data unencrypted when encryption is enabled
- use localStorage for large binaries
- trust imported JSON or file names as paths
- execute imported content
- bypass schema validation
- expose crypto keys to UI components
- couple analytics/tracking to storage or crypto

Do:
- keep crypto and storage isolated
- use strict types
- validate schemas at all boundaries
- use versioned data formats with migration paths
- fail safely with clear recovery guidance
- make encrypted export/import easy to use

## Analytics Rule
Analytics must be optional and separate from core logic.

Never include in telemetry:
- document names
- file contents
- project contents
- passphrases
- crypto keys
- ciphertext
- decrypted metadata
- personal notes
- imported/exported data

Telemetry may include only coarse anonymous product events when explicitly enabled.

## Technical Expectations
- Prefer TypeScript for all app code.
- Favor modular architecture and composable modules.
- Separate domain logic from UI components.
- Keep calculations deterministic and testable.
- Add focused tests for scoring logic, filtering, import/export parsing, storage fallback, and crypto error handling.
- Prefer explicit types over implicit any-like behavior.
- Keep dependencies minimal and maintained.
- Document major decisions concisely.

## UI/UX Guidelines
- Use openriskregister.com as styling and interaction reference.
- Do not copy proprietary branding, assets, or exact text.
- Keep UI clear, fast, and low-friction for governance tasks.
- Prioritize legibility for dense tabular/form-heavy screens.
- Ensure responsive behavior for desktop and mobile browsers.
- Use accessible semantics, keyboard support, and sensible contrast.
- **Icons and Symbols**: Use a modern minimalistic icon library (e.g., Feather, Lucide, or SVG) for visual clarity. **Never use emoji characters** (🔒, 📥, ✎, etc.) or generic AI symbols (✓, ✗, →, ←) in UI text. Use proper Unicode arrows or CSS-based icon fonts when directional indicators are needed. Button text should be explicit (e.g., "Back to Projects" instead of "← Back to Projects").

## Theme Colors

OCK adopts the color palette from **openriskregister.org** for visual consistency and professional governance aesthetics.

**Primary Colors:**
- **Primary (Navy Blue)**: `#0B1736` — Main UI elements, headers, accents, action highlights
- **Primary Hover**: `#060e22` — Darker shade for interactive states
- **Primary Light**: `#d0d7e8` — Lighter tint for backgrounds, borders, disabled states
- **Primary Lighter**: `#edf0f7` — Very light tint for hover backgrounds, info boxes

**Accent Colors:**
- **Accent (Orange)**: `#FEB15C` — Primary CTA buttons, active states, highlights
- **Accent Hover**: `#fd9f35` — Darker orange for button hover states
- **Accent Light**: `#fff4e6` — Light orange for background highlights, suggestions

**CSS Variables** (defined in `src/style.css`):
```css
:root {
  --primary-color: #0B1736;
  --primary-color-hover: #060e22;
  --primary-color-light: #d0d7e8;
  --primary-color-lighter: #edf0f7;
  --accent-color: #FEB15C;
  --accent-color-hover: #fd9f35;
  --accent-color-light: #fff4e6;
}
```

**Usage Guidelines:**
- Use primary blue for headers, navigation, body text, and default buttons
- Use orange accent for CTAs ("Create Project", "Export", "Save"), active tabs, highlights
- Use light variants for hover states, backgrounds, and disabled elements
- Maintain high contrast for accessibility (navy + white, orange + navy)
- Apply shadows sparingly; prefer direct color interactions

**Consistency Rule:** When adding new UI components, always reference these theme variables. Never hardcode color hex values directly in component styles.

## Acceptance Criteria
Implementation is acceptable when:
- app runs from static hosting with no backend
- project metadata persists locally
- documents/images can be added locally
- OPFS is used when available
- IndexedDB blob fallback works
- encrypted export produces restorable backup
- encrypted import restores projects and documents
- wrong passphrases fail cleanly
- malformed imports fail safely
- imported data is schema-validated
- prototype pollution payloads are rejected
- storage quota is checked and surfaced
- app explains local browser-managed storage behavior
- app works without File System Access API
- folder mode is optional only

## Product Language for UI
Use language like:

Your data is stored locally in this browser.
There is no server copy.
Create encrypted backups to avoid data loss.

Browser vault:
Stored privately by your browser for this website. Best for quick local use. Not visible as a normal folder.

Encrypted backup:
Download a password-protected backup that can restore your project and documents on another browser or device.

Local folder:
Choose a folder on this device. Available only in supported browsers.

## Decision Heuristics for Agents
- If a choice conflicts with browser-only operation, choose browser-only.
- If a feature adds complexity without improving core ISMS workflows, defer it.
- If uncertain between visual options, choose clarity over decoration.
- If uncertain between storage approaches, prefer robust local persistence with migration support.

## Brand and Naming
- Use Open Compliance Kit in product-facing copy.
- Use OCK only as internal shorthand.
- Respect domain context: OpenComplianceKit.org.
