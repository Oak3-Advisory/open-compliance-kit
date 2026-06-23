/**
 * Projects List Page
 *
 * Main page displaying all ISMS projects.
 * Allows creating new projects, opening existing ones, and managing project lifecycle.
 */

import type { Project } from '../../types';
import type { ProjectStore } from '../../state/projectStore';
import { NewProjectDialog } from '../components/new-project-dialog';
import { formatDate, formatBytes } from '../../utils/helpers';

export interface ProjectsPageOptions {
  projectStore: ProjectStore;
  onProjectSelected?: (projectId: string) => void;
  onNewProject?: (projectId: string) => void;
}

export class ProjectsPage {
  private container: HTMLElement | null = null;
  private projectStore: ProjectStore;
  private newProjectDialog: NewProjectDialog | null = null;
  private unsubscribe: (() => void) | null = null;
  private projects: Project[] = [];
  private options: ProjectsPageOptions;

  constructor(options: ProjectsPageOptions) {
    this.options = options;
    this.projectStore = options.projectStore;
  }

  /**
   * Render the projects page HTML
   */
  private renderHTML(): string {
    const projectsHtml =
      this.projects.length === 0
        ? `
          <div class="projects-empty-state">
            <h2>No ISMS projects yet</h2>
            <p>Create your first ISMS project to get started.</p>
          </div>
        `
        : `
          <div class="list-table">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Description</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Storage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.projects
                  .map(
                    (project) => `
                  <tr data-project-id="${project.id}">
                    <td><strong>${this.escapeHtml(project.name)}</strong></td>
                    <td>${this.escapeHtml(project.description || '—')}</td>
                    <td>${formatDate(project.createdAt)}</td>
                    <td>${formatDate(project.updatedAt)}</td>
                    <td>${formatBytes(project.storageUsageBytes)}</td>
                    <td>
                      <button class="btn btn-primary btn-sm project-open" data-project-id="${project.id}">
                        Open
                      </button>
                      <button class="btn btn-danger btn-sm project-delete" data-project-id="${project.id}">
                        Delete
                      </button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `;

    return `
      <div class="page projects-page">
        <div class="page-header">
          <h1>ISMS Projects</h1>
          <button class="btn btn-primary" id="btn-new-project">+ New Project</button>
        </div>
        ${projectsHtml}
      </div>
    `;
  }

  /**
   * Mount page to DOM and attach event listeners
   */
  async mount(container: HTMLElement): Promise<void> {
    this.container = container;

    // Load projects
    await this.loadProjects();

    // Render page
    const template = document.createElement('template');
    template.innerHTML = this.renderHTML();
    container.appendChild(template.content.cloneNode(true));

    // Setup dialog
    this.newProjectDialog = new NewProjectDialog({
      projectStore: this.projectStore,
      onSuccess: (projectId: string) => this.handleProjectCreated(projectId),
      onCancel: () => {},
      onError: (error: Error) => {
        console.error('Failed to create project:', error);
        this.showError(error.message);
      },
    });

    this.newProjectDialog.mount(container);

    // Attach event listeners
    this.attachEventListeners();

    // Subscribe to store events
    this.unsubscribe = this.projectStore.subscribe((event: any) => {
      if (event.type === 'projectCreated' || event.type === 'projectDeleted') {
        this.loadProjects();
      }
    });
  }

  /**
   * Load all projects from store
   */
  private async loadProjects(): Promise<void> {
    try {
      this.projects = await this.projectStore.getAllProjects();
    } catch (error) {
      console.error('Failed to load projects:', error);
      this.showError('Failed to load projects');
    }
  }

  /**
   * Attach event listeners to page
   */
  private attachEventListeners(): void {
    if (!this.container) return;

    // New project button
    const newProjectBtn = this.container.querySelector('#btn-new-project');
    newProjectBtn?.addEventListener('click', () => {
      this.newProjectDialog?.open();
    });

    // Project open buttons
    this.container.querySelectorAll('.project-open').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const projectId = (e.target as HTMLElement).getAttribute('data-project-id');
        if (projectId) {
          this.projectStore.setCurrentProjectId(projectId);
          this.options.onProjectSelected?.(projectId);
        }
      });
    });

    // Project delete buttons
    this.container.querySelectorAll('.project-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const projectId = (e.target as HTMLElement).getAttribute('data-project-id');
        if (projectId) {
          this.handleProjectDelete(projectId);
        }
      });
    });
  }

  /**
   * Handle project creation
   */
  private async handleProjectCreated(projectId: string): Promise<void> {
    console.log('Project created:', projectId);
    this.options.onNewProject?.(projectId);
  }

  /**
   * Handle project deletion
   */
  private async handleProjectDelete(projectId: string): Promise<void> {
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return;

    if (confirm(`Are you sure you want to delete "${project.name}"? This cannot be undone.`)) {
      try {
        await this.projectStore.deleteProject(projectId);
        await this.loadProjects();
        this.rerender();
        this.showSuccess(`Project "${project.name}" deleted.`);
      } catch (error) {
        console.error('Failed to delete project:', error);
        this.showError('Failed to delete project');
      }
    }
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    alert(`Error: ${message}`);
  }

  /**
   * Show success message
   */
  private showSuccess(message: string): void {
    console.log('Success:', message);
    // TODO: Toast notification
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Re-render the page (after data changes)
   */
  private rerender(): void {
    if (!this.container) return;

    // Clear entire container
    this.container.innerHTML = '';

    // Re-render
    const template = document.createElement('template');
    template.innerHTML = this.renderHTML();
    this.container.appendChild(template.content.cloneNode(true));

    // Recreate dialog
    if (this.newProjectDialog) {
      this.newProjectDialog.unmount();
    }

    this.newProjectDialog = new NewProjectDialog({
      projectStore: this.projectStore,
      onSuccess: (projectId: string) => this.handleProjectCreated(projectId),
      onCancel: () => {},
      onError: (error: Error) => {
        console.error('Failed to create project:', error);
        this.showError(error.message);
      },
    });

    this.newProjectDialog.mount(this.container);

    // Re-attach event listeners
    this.attachEventListeners();
  }

  /**
   * Unmount page and cleanup
   */
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
