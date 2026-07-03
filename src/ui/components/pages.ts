/**
 * HomePage component: initial landing page.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderHomePage(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'page home-page';

  container.innerHTML = `
    <section class="home-hero-layout">
      <div class="home-hero-panel">
        <p class="home-kicker">Free · Open Source · Browser-based</p>
        <p class="home-eyebrow">Local-first ISMS workspace</p>
        <h1>Open Compliance Kit</h1>
        <p class="home-subtitle">Build a structured ISMS workspace directly in your browser. No account. No data upload. No server dependency for core use.</p>

        <div class="cta-buttons home-cta-buttons">
          <button id="btn-new-project" class="btn btn-primary">
            Create Project
          </button>
          <button id="btn-view-projects" class="btn btn-secondary">
            Open Projects
          </button>
          <button id="btn-import" class="btn btn-tertiary">
            Import Backup
          </button>
        </div>

        <p class="home-note">No account required. No data upload. Works from static hosting.</p>

        <ul class="home-proof-points" aria-label="Key homepage claims">
          <li>Local browser storage</li>
          <li>Encrypted backup and restore</li>
          <li>Offline-first after load</li>
          <li>OPFS with IndexedDB fallback</li>
        </ul>
      </div>

      <aside class="home-trust-panel" aria-label="Data storage overview">
        <p class="home-panel-label">Privacy and security</p>
        <h2>Your data stays local.</h2>
        <p>Data is stored in browser-managed storage for this website and never sent to a server by default.</p>
        <ul>
          <li><strong>Browser vault:</strong> Fast local project work in this browser profile.</li>
          <li><strong>Encrypted backup:</strong> Export a passphrase-protected file for recovery and transfer.</li>
          <li><strong>Progressive storage:</strong> Uses OPFS when available with IndexedDB fallback.</li>
        </ul>
      </aside>
    </section>

    <section class="home-highlights" aria-label="Core capabilities">
      <p class="home-section-label">How it works</p>
      <p class="home-section-intro">Move from project setup to risk treatment and implementation tracking with a structured, repeatable workflow.</p>
      <article class="home-feature-card">
        <p class="home-step-number" aria-hidden="true">01</p>
        <h3>Risk and treatment flow</h3>
        <p>Track identified risks, score consistently, and plan treatment actions with clear ownership.</p>
      </article>
      <article class="home-feature-card">
        <p class="home-step-number" aria-hidden="true">02</p>
        <h3>Control implementation tracking</h3>
        <p>Map controls, monitor status, and link evidence across reviews and operational activities.</p>
      </article>
      <article class="home-feature-card">
        <p class="home-step-number" aria-hidden="true">03</p>
        <h3>Portable project backups</h3>
        <p>Create encrypted exports you can restore on another browser or device without backend lock-in.</p>
      </article>
    </section>
  `;

  return container;
}

/**
 * ProjectsPage component: list all projects.
 */
export function renderProjectsPage(projects: any[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'page projects-page';

  container.innerHTML = `
    <header class="page-header">
      <h1>Projects</h1>
      <button id="btn-new-project" class="btn btn-primary">+ New Project</button>
    </header>

    <div class="projects-list">
      ${
        projects.length === 0
          ? '<p class="empty-state">No projects yet. Create one to get started.</p>'
          : projects
              .map(
                (p) => `
        <div class="project-card" data-project-id="${escapeHtml(String(p.id))}">
          <h3>${escapeHtml(String(p.name))}</h3>
          <p>${escapeHtml(String(p.description || 'No description'))}</p>
          <div class="project-meta">
            <span class="date">Created ${new Date(p.createdAt).toLocaleDateString()}</span>
            ${p.encrypted ? '<span class="badge badge-encrypted">Encrypted</span>' : ''}
          </div>
          <div class="project-actions">
            <button class="btn btn-sm btn-primary btn-open">Open</button>
            <button class="btn btn-sm btn-secondary btn-export">Export</button>
            <button class="btn btn-sm btn-danger btn-delete">Delete</button>
          </div>
        </div>
      `
              )
              .join('')
      }
    </div>
  `;

  return container;
}

/**
 * SettingsPage component.
 */
export function renderSettingsPage(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'page settings-page';

  container.innerHTML = `
    <header class="page-header">
      <h1>Settings</h1>
    </header>

    <div class="settings-section">
      <h2>Appearance</h2>
      <label>
        <input type="checkbox" id="toggle-dark-mode" />
        Dark Mode
      </label>
    </div>

    <div class="settings-section">
      <h2>Storage</h2>
      <div id="storage-info">Loading storage info...</div>
    </div>

    <div class="settings-section">
      <h2>About</h2>
      <p>Open Compliance Kit v0.1.0</p>
      <p>Browser-only ISMS tool for risk and compliance management.</p>
    </div>
  `;

  return container;
}
