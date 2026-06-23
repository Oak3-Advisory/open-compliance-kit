/**
 * New Project Dialog
 *
 * Modal dialog for creating a new ISMS project.
 * Captures project name and description, validates, and saves to storage.
 */

import type { ProjectStore } from '../../state/projectStore';

export interface NewProjectDialogOptions {
  projectStore: ProjectStore;
  onSuccess?: (projectId: string) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

export class NewProjectDialog {
  private dialog: HTMLDialogElement | null = null;
  private formElement: HTMLFormElement | null = null;
  private isSubmitting = false;
  private options: NewProjectDialogOptions;

  constructor(options: NewProjectDialogOptions) {
    this.options = options;
  }

  /**
   * Render the dialog HTML
   */
  private renderHTML(): string {
    return `
      <dialog class="new-project-dialog" aria-modal="true" aria-labelledby="new-project-dialog-title">
        <div class="dialog-content">
          <div class="dialog-header">
            <h2 id="new-project-dialog-title">Create New ISMS Project</h2>
            <button type="button" class="modal-close-btn" id="btn-close" aria-label="Close dialog">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <form id="new-project-form">
            <div class="form-group">
              <label for="project-name">Project Name *</label>
              <input
                id="project-name"
                type="text"
                name="name"
                placeholder="e.g., ACME Corp ISMS"
                required
                maxlength="255"
                autocomplete="off"
              />
              <p class="form-hint">Required. Will appear in project list.</p>
            </div>

            <div class="form-group">
              <label for="project-description">Description</label>
              <textarea
                id="project-description"
                name="description"
                placeholder="Optional. Scope, context, or key notes."
                maxlength="2000"
                rows="4"
              ></textarea>
              <p class="form-hint">Optional. Helps you remember project context later.</p>
            </div>

            <div class="form-errors" style="display: none;" role="alert" aria-live="polite"></div>

            <div class="dialog-actions">
              <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
              <button type="submit" class="btn btn-primary">Create Project</button>
            </div>
          </form>
        </div>
      </dialog>
    `;
  }

  /**
   * Mount dialog to DOM and attach event listeners
   */
  mount(container: HTMLElement): void {
    const fragment = document.createElement('template');
    fragment.innerHTML = this.renderHTML();
    container.appendChild(fragment.content.cloneNode(true));

    this.dialog = container.querySelector('.new-project-dialog');
    this.formElement = this.dialog?.querySelector('form') || null;

    if (!this.dialog || !this.formElement) {
      throw new Error('Failed to mount NewProjectDialog');
    }

    this.attachEventListeners();
  }

  /**
   * Attach event listeners to dialog elements
   */
  private attachEventListeners(): void {
    if (!this.dialog || !this.formElement) return;

    // Form submission
    this.formElement.addEventListener('submit', (e) => this.handleSubmit(e));

    // Close button
    const closeBtn = this.dialog.querySelector('#btn-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Cancel button
    const cancelBtn = this.dialog.querySelector('#btn-cancel');
    cancelBtn?.addEventListener('click', () => this.close());

    // Backdrop click
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) {
        this.close();
      }
    });

    // Escape key
    this.dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  /**
   * Handle form submission
   */
  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    if (!this.formElement || this.isSubmitting) return;

    try {
      this.isSubmitting = true;
      this.clearErrors();

      // Get form data
      const formData = new FormData(this.formElement);
      const name = (formData.get('name') as string || '').trim();
      const description = (formData.get('description') as string || '').trim();

      // Validate
      if (!name) {
        this.showError('Project name is required.');
        return;
      }

      if (name.length < 3) {
        this.showError('Project name must be at least 3 characters.');
        return;
      }

      if (name.length > 255) {
        this.showError('Project name must be 255 characters or less.');
        return;
      }

      // Show loading state
      this.setSubmitButtonLoading(true);

      // Create project
      const project = await this.options.projectStore.createProject({
        name,
        description: description || undefined,
      });

      // Success
      this.setSubmitButtonLoading(false);
      this.options.onSuccess?.(project.id);
      this.close();
    } catch (error) {
      this.setSubmitButtonLoading(false);
      const message =
        error instanceof Error ? error.message : 'Failed to create project. Please try again.';
      this.showError(message);
      this.options.onError?.(error as Error);
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    if (!this.dialog) return;

    const errorContainer = this.dialog.querySelector('.form-errors');
    if (errorContainer) {
      errorContainer.textContent = '';
      const errorMessage = document.createElement('div');
      errorMessage.className = 'error-message';
      const strong = document.createElement('strong');
      strong.textContent = 'Error:';
      errorMessage.append(strong, document.createTextNode(` ${message}`));
      errorContainer.appendChild(errorMessage);
      (errorContainer as HTMLElement).style.display = 'block';
    }
  }

  /**
   * Clear error messages
   */
  private clearErrors(): void {
    if (!this.dialog) return;

    const errorContainer = this.dialog.querySelector('.form-errors');
    if (errorContainer) {
      errorContainer.textContent = '';
      (errorContainer as HTMLElement).style.display = 'none';
    }
  }

  /**
   * Set submit button loading state
   */
  private setSubmitButtonLoading(isLoading: boolean): void {
    if (!this.formElement) return;

    const submitBtn = this.formElement.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
    if (!submitBtn) return;

    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? 'Creating...' : 'Create Project';
  }

  /**
   * Open the dialog
   */
  open(): void {
    if (this.dialog && 'showModal' in this.dialog) {
      (this.dialog as any).showModal();
      this.formElement?.querySelector('input')?.focus();
    }
  }

  /**
   * Close the dialog
   */
  close(): void {
    if (this.dialog && 'close' in this.dialog) {
      (this.dialog as any).close();
      this.options.onCancel?.();
    }
  }

  /**
   * Check if dialog is currently open
   */
  isOpen(): boolean {
    return this.dialog?.open || false;
  }

  /**
   * Unmount and cleanup
   */
  unmount(): void {
    if (this.dialog) {
      this.dialog.remove();
      this.dialog = null;
      this.formElement = null;
    }
  }
}
