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
        <p class="home-eyebrow">Local-first ISMS workspace</p>
        <h1>Open Compliance Kit</h1>
        <p class="home-subtitle">Build and maintain your ISMS directly in this browser.</p>

        <div class="cta-buttons home-cta-buttons">
          <button id="btn-new-project" class="btn btn-primary">
            Create ISMS project
          </button>
          <button id="btn-view-projects" class="btn btn-secondary">
            Open existing project
          </button>
          <button id="btn-import" class="btn btn-tertiary">
            Import encrypted backup
          </button>
        </div>

        <p class="home-note">No account. No default upload. Export backups when needed.</p>
      </div>

      <aside class="home-trust-panel" aria-label="Data storage overview">
        <p class="home-panel-label">Storage and recovery</p>
        <h2>Your data stays local.</h2>
        <p>Stored in browser-managed storage for this site.</p>
        <ul>
          <li><strong>Browser vault:</strong> fast local project work.</li>
          <li><strong>Encrypted backup:</strong> passphrase-protected recovery file.</li>
          <li><strong>Progressive storage:</strong> OPFS or IndexedDB fallback.</li>
        </ul>
      </aside>
    </section>

    <section class="home-highlights" aria-label="Core capabilities">
      <p class="home-section-label">How local-first storage works</p>
      <p class="home-section-intro">Set up a project, assess risk, and track implementation.</p>
      <article class="home-feature-card">
        <p class="home-step-number" aria-hidden="true">01</p>
        <h3>Risk and treatment flow</h3>
        <p>Identify, score, and treat risks with clear ownership.</p>
      </article>
      <article class="home-feature-card">
        <p class="home-step-number" aria-hidden="true">02</p>
        <h3>Control implementation tracking</h3>
        <p>Map controls, track status, and link evidence.</p>
      </article>
      <article class="home-feature-card">
        <p class="home-step-number" aria-hidden="true">03</p>
        <h3>Portable project backups</h3>
        <p>Export encrypted backups for restore on another browser or device.</p>
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
