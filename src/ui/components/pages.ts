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
    <div class="hero">
      <h1>Open Compliance Kit</h1>
      <p>Browser-only ISMS tool for risk and compliance management</p>
      
      <div class="cta-buttons">
        <button id="btn-new-project" class="btn btn-primary">
          New Project
        </button>
        <button id="btn-view-projects" class="btn btn-secondary">
          View Projects
        </button>
        <button id="btn-import" class="btn btn-tertiary">
          Import Backup
        </button>
      </div>
    </div>

    <div class="info-section">
      <h2>Your data is stored locally in this browser.</h2>
      <p>There is no server copy. Create encrypted backups to avoid data loss.</p>
      
      <div class="storage-info">
        <h3>Storage Options</h3>
        <ul>
          <li><strong>Browser Vault:</strong> Stored privately by your browser for this website. Best for quick local use.</li>
          <li><strong>Encrypted Backup:</strong> Download a password-protected backup that can restore your project and documents on another browser or device.</li>
        </ul>
      </div>
    </div>
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
