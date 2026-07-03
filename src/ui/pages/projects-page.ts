/**
 * Projects List Page
 *
 * Professional workspace management screen for local ISMS projects.
 */

import type { Project } from '../../types';
import type { ProjectStore } from '../../state/projectStore';
import { NewProjectDialog } from '../components/new-project-dialog';
import { formatDate } from '../../utils/helpers';

export interface ProjectsPageOptions {
  projectStore: ProjectStore;
  onHome?: () => void;
  onImportBackup?: () => void;
  onProjectSelected?: (projectId: string) => void;
  onNewProject?: (projectId: string) => void;
}

interface ProjectWorkspaceMeta {
  organization: string;
  framework: string;
  riskCount: number;
  openActions: number;
  evidenceLinkedControls: number;
  controlCount: number;
  backupStatus: 'missing' | 'recent';
}

export class ProjectsPage {
  private container: HTMLElement | null = null;
  private projectStore: ProjectStore;
  private newProjectDialog: NewProjectDialog | null = null;
  private unsubscribe: (() => void) | null = null;
  private projects: Project[] = [];
  private projectMeta: Map<string, ProjectWorkspaceMeta> = new Map();
  private searchQuery = '';
  private statusFilter = 'all';
  private sortBy = 'updated_desc';
  private options: ProjectsPageOptions;

  constructor(options: ProjectsPageOptions) {
    this.options = options;
    this.projectStore = options.projectStore;
  }

  private renderHTML(): string {
    const visibleProjects = this.getVisibleProjects();
    const primaryProject = this.getPrimaryProject();
    const primaryProjectId = primaryProject?.id || '';
    const secondaryProjects = visibleProjects.filter((project) => project.id !== primaryProjectId);
    const hasMultipleProjects = this.projects.length > 1;

    const projectsHtml =
      this.projects.length === 0
        ? `
          <div class="projects-empty-state">
            <h2>Create your first ISMS project</h2>
            <p>Set up one workspace for your full ISMS lifecycle.</p>
            <div class="page-header-actions">
              <button class="btn btn-primary" id="btn-empty-create-project">Create project</button>
              <button class="btn btn-secondary" id="btn-empty-import-backup">Import backup</button>
            </div>
          </div>
        `
        : `
          ${primaryProject ? this.renderProjectCard(primaryProject, true) : ''}

          ${hasMultipleProjects
            ? `
              <section class="secondary-projects-section" aria-label="Additional projects">
                <div class="secondary-projects-header">
                  <h2>Other projects</h2>
                  <p class="text-muted">Most teams keep one active project. Use this area only when needed.</p>
                </div>

                <div class="projects-toolbar">
                  <div class="form-group">
                    <label for="projects-search">Search</label>
                    <input id="projects-search" type="text" placeholder="Search project or organization" value="${this.escapeHtml(this.searchQuery)}" />
                  </div>

                  <div class="form-group">
                    <label for="projects-status-filter">Filter by status</label>
                    <select id="projects-status-filter">
                      <option value="all" ${this.statusFilter === 'all' ? 'selected' : ''}>All statuses</option>
                      <option value="draft" ${this.statusFilter === 'draft' ? 'selected' : ''}>Draft</option>
                      <option value="scope_defined" ${this.statusFilter === 'scope_defined' ? 'selected' : ''}>Scope defined</option>
                      <option value="risks_assessed" ${this.statusFilter === 'risks_assessed' ? 'selected' : ''}>Risks assessed</option>
                      <option value="controls_selected" ${this.statusFilter === 'controls_selected' ? 'selected' : ''}>Controls selected</option>
                      <option value="evidence_in_progress" ${this.statusFilter === 'evidence_in_progress' ? 'selected' : ''}>Evidence in progress</option>
                      <option value="ready_for_review" ${this.statusFilter === 'ready_for_review' ? 'selected' : ''}>Ready for review</option>
                      <option value="audit_ready" ${this.statusFilter === 'audit_ready' ? 'selected' : ''}>Audit-ready</option>
                      <option value="archived" ${this.statusFilter === 'archived' ? 'selected' : ''}>Archived</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label for="projects-sort">Sort</label>
                    <select id="projects-sort">
                      <option value="updated_desc" ${this.sortBy === 'updated_desc' ? 'selected' : ''}>Last updated (newest)</option>
                      <option value="updated_asc" ${this.sortBy === 'updated_asc' ? 'selected' : ''}>Last updated (oldest)</option>
                      <option value="name_asc" ${this.sortBy === 'name_asc' ? 'selected' : ''}>Name (A-Z)</option>
                      <option value="name_desc" ${this.sortBy === 'name_desc' ? 'selected' : ''}>Name (Z-A)</option>
                    </select>
                  </div>
                </div>

                ${secondaryProjects.length === 0
                  ? '<p class="projects-filter-empty text-muted">No additional projects match your current filter.</p>'
                  : `<div class="projects-card-grid">${secondaryProjects.map((project) => this.renderProjectCard(project, false)).join('')}</div>`
                }
              </section>
            `
            : ''}
        `;

    return `
      <div class="page projects-page">
        <div class="page-header">
          <div>
            <h1>ISMS Projects</h1>
            <p class="text-muted">Single-project-first workspace with optional multi-project support.</p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-tertiary" id="btn-home">Home</button>
            <button class="btn btn-secondary" id="btn-import-backup">Import backup</button>
            <button class="btn btn-primary" id="btn-new-project">Create project</button>
          </div>
        </div>
        <div class="local-safety-notice">Your data is stored in this browser. There is no server copy. Export encrypted backups regularly.</div>

        ${projectsHtml}
      </div>
    `;
  }

  private renderProjectCard(project: Project, isPrimary: boolean): string {
    const meta = this.projectMeta.get(project.id);
    const status = project.lifecycleStatus || 'draft';
    const backupText = meta?.backupStatus === 'recent' ? 'Backup exported recently' : 'No backup exported yet';
    const articleClass = isPrimary ? 'workspace-card workspace-card-primary' : 'workspace-card workspace-card-secondary';

    return `
      <article class="${articleClass}" data-project-id="${project.id}">
        ${isPrimary ? '<p class="workspace-card-kicker">Continue project</p>' : ''}
        <div class="workspace-card-header">
          <h3>${this.escapeHtml(project.name)}</h3>
          <span class="badge badge-status project-status ${this.getLifecycleStatusClass(status)}">${this.formatLifecycleStatus(status)}</span>
        </div>
        <p class="workspace-card-subtitle">${this.escapeHtml(meta?.organization || project.organizationName || 'Organization profile not set')}</p>
        <dl class="workspace-meta-list">
          <div><dt>Framework</dt><dd>${this.escapeHtml(meta?.framework || project.primaryFramework || 'Not selected')}</dd></div>
          <div><dt>Updated</dt><dd>${formatDate(project.updatedAt)}</dd></div>
          <div><dt>Risks</dt><dd>${meta?.riskCount || 0}</dd></div>
          <div><dt>Open actions</dt><dd>${meta?.openActions || 0}</dd></div>
          <div><dt>Evidence progress</dt><dd>${this.formatEvidenceProgress(meta)}</dd></div>
        </dl>
        <p class="workspace-backup ${meta?.backupStatus === 'recent' ? 'status-good' : 'status-warning'}">${this.escapeHtml(backupText)}</p>
        <div class="workspace-actions">
          <button class="btn btn-primary btn-sm project-open" data-project-id="${project.id}">Open</button>
          <button class="btn btn-secondary btn-sm project-export" data-project-id="${project.id}">Export backup</button>
          <details class="project-manage-menu">
            <summary>Manage</summary>
            <div class="project-manage-menu-items">
              <button class="btn btn-tertiary btn-sm project-rename" data-project-id="${project.id}">Rename</button>
              <button class="btn btn-tertiary btn-sm project-duplicate" data-project-id="${project.id}">Duplicate</button>
              <button class="btn btn-tertiary btn-sm project-archive" data-project-id="${project.id}">Archive</button>
              <button class="btn btn-danger btn-sm project-delete" data-project-id="${project.id}">Delete</button>
            </div>
          </details>
        </div>
      </article>
    `;
  }

  private getPrimaryProject(): Project | null {
    if (this.projects.length === 0) {
      return null;
    }

    const sorted = [...this.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sorted[0];
  }

  async mount(container: HTMLElement): Promise<void> {
    this.container = container;

    await this.loadProjects();

    const template = document.createElement('template');
    template.innerHTML = this.renderHTML();
    container.appendChild(template.content.cloneNode(true));

    this.newProjectDialog = new NewProjectDialog({
      projectStore: this.projectStore,
      onSuccess: (projectId: string) => this.handleProjectCreated(projectId),
      onImportRequested: () => this.options.onImportBackup?.(),
      onCancel: () => {},
      onError: (error: Error) => {
        console.error('Failed to create project:', error);
        this.showError(error.message);
      },
    });

    this.newProjectDialog.mount(container);
    this.attachEventListeners();

    this.unsubscribe = this.projectStore.subscribe((event: any) => {
      if (event.type === 'projectCreated' || event.type === 'projectDeleted') {
        this.loadProjects().then(() => this.rerender());
      }
    });
  }

  private async loadProjects(): Promise<void> {
    try {
      this.projects = await this.projectStore.getAllProjects();
      await this.loadProjectMetadata();
    } catch (error) {
      console.error('Failed to load projects:', error);
      this.showError('Failed to load projects');
    }
  }

  private async loadProjectMetadata(): Promise<void> {
    const entries = await Promise.all(
      this.projects.map(async (project) => {
        const [org, risks, controls, actions] = await Promise.all([
          this.projectStore.getOrganizationProfile(project.id),
          this.projectStore.getRisks(project.id),
          this.projectStore.getControls(project.id),
          this.projectStore.getActions(project.id),
        ]);

        const backupAt = localStorage.getItem(`ock:last-backup:${project.id}`);
        const backupStatus: ProjectWorkspaceMeta['backupStatus'] = backupAt ? 'recent' : 'missing';
        const evidenceLinkedControls = controls.filter((control) => (control.linkedEvidenceIds?.length || 0) > 0).length;
        const openActions = actions.filter((action) => action.status !== 'completed').length;

        return [project.id, {
          organization: org?.name || project.organizationName || 'Organization profile not set',
          framework: project.primaryFramework || project.controlFrameworks?.[0] || 'Not selected',
          riskCount: risks.length,
          openActions,
          evidenceLinkedControls,
          controlCount: controls.length,
          backupStatus,
        } satisfies ProjectWorkspaceMeta] as const;
      })
    );

    this.projectMeta = new Map(entries);
  }

  private getVisibleProjects(): Project[] {
    const query = this.searchQuery.toLowerCase();

    const filtered = this.projects.filter((project) => {
      const meta = this.projectMeta.get(project.id);
      const status = project.lifecycleStatus || 'draft';

      if (this.statusFilter !== 'all' && this.statusFilter !== status) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [project.name, project.organizationName, meta?.organization]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });

    return filtered.sort((a, b) => {
      if (this.sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (this.sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (this.sortBy === 'updated_asc') return a.updatedAt.localeCompare(b.updatedAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    const newProjectBtn = this.container.querySelector('#btn-new-project');
    newProjectBtn?.addEventListener('click', () => this.newProjectDialog?.open());

    const homeBtn = this.container.querySelector('#btn-home');
    homeBtn?.addEventListener('click', () => this.options.onHome?.());

    const importBtn = this.container.querySelector('#btn-import-backup');
    importBtn?.addEventListener('click', () => this.options.onImportBackup?.());

    const emptyCreateBtn = this.container.querySelector('#btn-empty-create-project');
    emptyCreateBtn?.addEventListener('click', () => this.newProjectDialog?.open());

    const emptyImportBtn = this.container.querySelector('#btn-empty-import-backup');
    emptyImportBtn?.addEventListener('click', () => this.options.onImportBackup?.());

    const searchInput = this.container.querySelector('#projects-search') as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim();
      this.rerender();
    });

    const statusFilter = this.container.querySelector('#projects-status-filter') as HTMLSelectElement | null;
    statusFilter?.addEventListener('change', () => {
      this.statusFilter = statusFilter.value;
      this.rerender();
    });

    const sortSelect = this.container.querySelector('#projects-sort') as HTMLSelectElement | null;
    sortSelect?.addEventListener('change', () => {
      this.sortBy = sortSelect.value;
      this.rerender();
    });

    this.container.querySelectorAll('.project-open').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const projectId = (e.target as HTMLElement).getAttribute('data-project-id');
        if (projectId) {
          this.projectStore.setCurrentProjectId(projectId);
          this.options.onProjectSelected?.(projectId);
        }
      });
    });

    this.container.querySelectorAll('.project-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const projectId = (e.target as HTMLElement).getAttribute('data-project-id');
        if (projectId) this.handleProjectDelete(projectId);
      });
    });

    this.container.querySelectorAll('.project-archive').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const projectId = (e.target as HTMLElement).getAttribute('data-project-id');
        if (projectId) this.handleProjectArchive(projectId);
      });
    });

    this.container.querySelectorAll('.project-rename').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const projectId = (e.target as HTMLElement).getAttribute('data-project-id');
        if (projectId) this.handleProjectRename(projectId);
      });
    });

    this.container.querySelectorAll('.project-duplicate').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const projectId = (e.target as HTMLElement).getAttribute('data-project-id');
        if (projectId) this.handleProjectDuplicate(projectId);
      });
    });

    this.container.querySelectorAll('.project-export').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const projectId = (e.target as HTMLElement).getAttribute('data-project-id');
        if (projectId) this.handleProjectExportBackup(projectId);
      });
    });
  }

  private async handleProjectCreated(projectId: string): Promise<void> {
    this.options.onNewProject?.(projectId);
  }

  private async handleProjectDelete(projectId: string): Promise<void> {
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return;

    const confirmation = prompt(`Type the project name to confirm deletion:\n${project.name}`);
    if (confirmation !== project.name) return;

    try {
      await this.projectStore.deleteProject(projectId);
      await this.loadProjects();
      this.rerender();
    } catch (error) {
      console.error('Failed to delete project:', error);
      this.showError('Failed to delete project');
    }
  }

  private async handleProjectArchive(projectId: string): Promise<void> {
    try {
      await this.projectStore.updateProject(projectId, { lifecycleStatus: 'archived' });
      await this.loadProjects();
      this.rerender();
    } catch (error) {
      console.error('Failed to archive project:', error);
      this.showError('Failed to archive project');
    }
  }

  private async handleProjectRename(projectId: string): Promise<void> {
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return;

    const nextName = prompt('Enter a new project name', project.name)?.trim();
    if (!nextName || nextName === project.name) return;

    try {
      await this.projectStore.updateProject(projectId, { name: nextName });
      await this.loadProjects();
      this.rerender();
    } catch (error) {
      console.error('Failed to rename project:', error);
      this.showError('Failed to rename project');
    }
  }

  private async handleProjectDuplicate(projectId: string): Promise<void> {
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return;

    try {
      const duplicate = await this.projectStore.createProject({
        name: `${project.name} Copy`,
        description: project.description,
        organizationName: project.organizationName,
        owner: project.owner,
        primaryFramework: project.primaryFramework,
        lifecycleStatus: project.lifecycleStatus || 'draft',
      });

      const orgProfile = await this.projectStore.getOrganizationProfile(projectId);
      if (orgProfile) {
        await this.projectStore.createOrganizationProfile(duplicate.id, {
          name: orgProfile.name,
          description: orgProfile.description,
          industry: orgProfile.industry,
          regulatoryFrameworks: orgProfile.regulatoryFrameworks,
        });
      }

      await this.loadProjects();
      this.rerender();
    } catch (error) {
      console.error('Failed to duplicate project:', error);
      this.showError('Failed to duplicate project');
    }
  }

  private async handleProjectExportBackup(projectId: string): Promise<void> {
    const passphrase = prompt('Enter backup passphrase (minimum 8 characters)')?.trim() || '';
    if (passphrase.length < 8) {
      this.showError('Passphrase must be at least 8 characters');
      return;
    }

    const confirmPassphrase = prompt('Confirm backup passphrase')?.trim() || '';
    if (passphrase !== confirmPassphrase) {
      this.showError('Passphrases do not match');
      return;
    }

    try {
      const { blob, fileName } = await this.projectStore.exportProjectBackup(projectId, passphrase);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      localStorage.setItem(`ock:last-backup:${projectId}`, new Date().toISOString());
      await this.loadProjects();
      this.rerender();
    } catch (error) {
      console.error('Failed to export backup:', error);
      this.showError('Failed to export encrypted backup');
    }
  }

  private showError(message: string): void {
    alert(`Error: ${message}`);
  }

  private formatEvidenceProgress(meta?: ProjectWorkspaceMeta): string {
    if (!meta || meta.controlCount === 0) {
      return '0%';
    }

    const percent = Math.round((meta.evidenceLinkedControls / meta.controlCount) * 100);
    return `${percent}%`;
  }

  private formatLifecycleStatus(status: string): string {
    return status
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private getLifecycleStatusClass(status: string): string {
    switch (status) {
      case 'audit_ready':
        return 'status-complete';
      case 'ready_for_review':
      case 'controls_selected':
      case 'risks_assessed':
      case 'scope_defined':
      case 'evidence_in_progress':
        return 'status-planned';
      case 'archived':
        return 'status-neutral';
      default:
        return 'status-assessed';
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private rerender(): void {
    if (!this.container) return;

    this.container.innerHTML = '';

    const template = document.createElement('template');
    template.innerHTML = this.renderHTML();
    this.container.appendChild(template.content.cloneNode(true));

    if (this.newProjectDialog) {
      this.newProjectDialog.unmount();
    }

    this.newProjectDialog = new NewProjectDialog({
      projectStore: this.projectStore,
      onSuccess: (projectId: string) => this.handleProjectCreated(projectId),
      onImportRequested: () => this.options.onImportBackup?.(),
      onCancel: () => {},
      onError: (error: Error) => {
        console.error('Failed to create project:', error);
        this.showError(error.message);
      },
    });

    this.newProjectDialog.mount(this.container);
    this.attachEventListeners();
  }

  unmount(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.newProjectDialog) {
      this.newProjectDialog.unmount();
      this.newProjectDialog = null;
    }

    if (this.container) {
      const page = this.container.querySelector('.projects-page');
      if (page) {
        page.remove();
      }
      this.container = null;
    }
  }
}
