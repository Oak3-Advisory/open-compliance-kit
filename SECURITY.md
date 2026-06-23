# Security

Open Compliance Kit is a browser-only, local-first application. Core data is stored in browser-managed persistence and must be treated as untrusted when it is loaded back into the app.

## Validation rules

- Validate all imported JSON, encrypted backups, and browser-stored records before use.
- Reject prototype-pollution keys such as `__proto__`, `constructor`, and `prototype`.
- Reject unknown fields unless a schema explicitly allows them.
- Validate storage references, MIME types, file sizes, IDs, and relationship links.
- Regenerate safe storage references from validated IDs when restoring data.

## Import and export

- Check file size before reading a backup into memory.
- Validate the outer package, then decrypt and validate the inner payload.
- Fail safely on malformed data, hash mismatches, and wrong passphrases.

## Storage

- Use validated IDs to build OPFS and IndexedDB blob references.
- Do not trust path-like strings from imported or persisted data.

## UI rendering

- Do not inject user-controlled values into `innerHTML` without escaping.
- Prefer DOM APIs and `textContent` for error output and dynamic content.

## Reporting issues

If you find a security issue, report it through the project issue tracker with clear reproduction steps and affected browser details.