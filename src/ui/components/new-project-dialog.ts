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
  onImportRequested?: () => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

interface WizardData {
  organizationName: string;
  projectName: string;
  owner: string;
  scopeSummary: string;
  locations: string;
  framework: 'ISO 27001' | 'NIS2' | 'Custom';
  customFramework: string;
  startMode: 'blank' | 'starter' | 'import';
}

export class NewProjectDialog {
  private dialog: HTMLDialogElement | null = null;
  private isSubmitting = false;
  private currentStep: WizardStep = 1;
  private data: WizardData = {
    organizationName: '',
    projectName: '',
    owner: '',
    scopeSummary: '',
    locations: '',
    framework: 'ISO 27001',
    customFramework: '',
    startMode: 'starter',
  };
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
        <div class="dialog-content create-project-wizard">
          <div class="dialog-header">
            <h2 id="new-project-dialog-title">Create ISMS Project</h2>
            <button type="button" class="modal-close-btn" id="btn-close" aria-label="Close dialog">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <p class="wizard-summary">A project is a local ISMS workspace containing your scope, risks, controls, documents, evidence, actions, and reports.</p>
          <div id="wizard-step-indicator" class="wizard-step-indicator" aria-live="polite"></div>
          <form id="new-project-form"></form>
        </div>
      </dialog>
    `;
  }

  private renderStepContent(): string {
    const step = this.currentStep;

    if (step === 1) {
      return `
        <section class="wizard-step" aria-label="Organization">
          <h3>Step 1 of 6: Organization</h3>
          <div class="form-group">
            <label for="organization-name">Organization name *</label>
            <input id="organization-name" name="organizationName" type="text" maxlength="255" value="${this.escapeHtml(this.data.organizationName)}" required />
          </div>
          <div class="form-group">
            <label for="project-name">Project name *</label>
            <input id="project-name" name="projectName" type="text" maxlength="255" value="${this.escapeHtml(this.data.projectName)}" required />
          </div>
          <div class="form-group">
            <label for="project-owner">Project owner</label>
            <input id="project-owner" name="owner" type="text" maxlength="255" value="${this.escapeHtml(this.data.owner)}" />
          </div>
        </section>
      `;
    }

    if (step === 2) {
      return `
        <section class="wizard-step" aria-label="Scope">
          <h3>Step 2 of 6: Scope</h3>
          <div class="form-group">
            <label for="scope-summary">ISMS scope *</label>
            <textarea id="scope-summary" name="scopeSummary" rows="4" maxlength="2000" placeholder="Example: SaaS product, production cloud environment, support processes, and customer data handling." required>${this.escapeHtml(this.data.scopeSummary)}</textarea>
            <p class="form-hint">The scope defines which organization, systems, processes, and locations are covered by this ISMS project.</p>
          </div>
          <div class="form-group">
            <label for="locations">Locations or business units</label>
            <input id="locations" name="locations" type="text" maxlength="500" value="${this.escapeHtml(this.data.locations)}" />
          </div>
        </section>
      `;
    }

    if (step === 3) {
      return `
        <section class="wizard-step" aria-label="Framework">
          <h3>Step 3 of 6: Framework</h3>
          <div class="form-group">
            <label for="framework">Primary framework *</label>
            <select id="framework" name="framework" required>
              <option value="ISO 27001" ${this.data.framework === 'ISO 27001' ? 'selected' : ''}>ISO 27001</option>
              <option value="NIS2" ${this.data.framework === 'NIS2' ? 'selected' : ''}>NIS2</option>
              <option value="Custom" ${this.data.framework === 'Custom' ? 'selected' : ''}>Custom</option>
            </select>
          </div>
          <div class="form-group ${this.data.framework === 'Custom' ? '' : 'hidden'}" id="custom-framework-group">
            <label for="custom-framework">Custom framework name *</label>
            <input id="custom-framework" name="customFramework" type="text" maxlength="255" value="${this.escapeHtml(this.data.customFramework)}" />
          </div>
        </section>
      `;
    }

    if (step === 4) {
      return `
        <section class="wizard-step" aria-label="Starting point">
          <h3>Step 4 of 6: Starting point</h3>
          <div class="form-group">
            <label for="start-mode">How do you want to start? *</label>
            <select id="start-mode" name="startMode" required>
              <option value="blank" ${this.data.startMode === 'blank' ? 'selected' : ''}>Blank project</option>
              <option value="starter" ${this.data.startMode === 'starter' ? 'selected' : ''}>Use recommended starter structure</option>
              <option value="import" ${this.data.startMode === 'import' ? 'selected' : ''}>Import from backup</option>
            </select>
          </div>
        </section>
      `;
    }

    if (step === 5) {
      return `
        <section class="wizard-step" aria-label="Backup reminder">
          <h3>Step 5 of 6: Backup reminder</h3>
          <div class="wizard-note">
            <p>Your project is stored in this browser. Clearing site data or changing devices may remove access unless you export a backup.</p>
            <p>Export an encrypted backup to restore this project on another browser or device.</p>
          </div>
        </section>
      `;
    }

    const frameworkLabel = this.data.framework === 'Custom'
      ? this.data.customFramework
      : this.data.framework;

    return `
      <section class="wizard-step" aria-label="Review">
        <h3>Step 6 of 6: Review and create</h3>
        <dl class="info-list wizard-review">
          <dt>Organization</dt><dd>${this.escapeHtml(this.data.organizationName || '—')}</dd>
          <dt>Project</dt><dd>${this.escapeHtml(this.data.projectName || '—')}</dd>
          <dt>Owner</dt><dd>${this.escapeHtml(this.data.owner || '—')}</dd>
          <dt>Scope</dt><dd>${this.escapeHtml(this.data.scopeSummary || '—')}</dd>
          <dt>Locations</dt><dd>${this.escapeHtml(this.data.locations || '—')}</dd>
          <dt>Framework</dt><dd>${this.escapeHtml(frameworkLabel || '—')}</dd>
          <dt>Starting point</dt><dd>${this.escapeHtml(this.data.startMode === 'starter' ? 'Use recommended starter structure' : this.data.startMode === 'import' ? 'Import from backup' : 'Blank project')}</dd>
        </dl>
      </section>
    `;
  }

  private renderStep(): void {
    if (!this.dialog) return;

    const indicator = this.dialog.querySelector('#wizard-step-indicator') as HTMLElement | null;
    const form = this.dialog.querySelector('#new-project-form') as HTMLFormElement | null;
    if (!indicator || !form) return;

    indicator.textContent = `Step ${this.currentStep} of 6`;
    form.innerHTML = `
      ${this.renderStepContent()}
      <div class="form-errors" style="display: none;" role="alert" aria-live="polite"></div>
      <div class="dialog-actions wizard-actions">
        <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
        ${this.currentStep > 1 ? '<button type="button" class="btn btn-tertiary" id="btn-back">Back</button>' : ''}
        ${this.currentStep < 6 ? '<button type="button" class="btn btn-primary" id="btn-next">Continue</button>' : '<button type="submit" class="btn btn-primary" id="btn-submit">Create Project</button>'}
      </div>
    `;

    this.attachStepEventListeners(form);
  }

  /**
   * Mount dialog to DOM and attach event listeners
   */
  mount(container: HTMLElement): void {
    const fragment = document.createElement('template');
    fragment.innerHTML = this.renderHTML();
    container.appendChild(fragment.content.cloneNode(true));

    this.dialog = container.querySelector('.new-project-dialog');

    if (!this.dialog) {
      throw new Error('Failed to mount NewProjectDialog');
    }

    this.renderStep();
    this.attachEventListeners();
  }

  /**
   * Attach event listeners to dialog elements
   */
  private attachEventListeners(): void {
    if (!this.dialog) return;

    // Close button
    const closeBtn = this.dialog.querySelector('#btn-close');
    closeBtn?.addEventListener('click', () => this.close());

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

  private attachStepEventListeners(form: HTMLFormElement): void {
    form.addEventListener('submit', (e) => this.handleSubmit(e));

    const cancelBtn = form.querySelector('#btn-cancel');
    cancelBtn?.addEventListener('click', () => this.close());

    const backBtn = form.querySelector('#btn-back');
    backBtn?.addEventListener('click', () => {
      this.persistStepInputs(form);
      this.currentStep = Math.max(1, this.currentStep - 1) as WizardStep;
      this.renderStep();
    });

    const nextBtn = form.querySelector('#btn-next');
    nextBtn?.addEventListener('click', () => {
      this.persistStepInputs(form);
      const validationError = this.validateStep(this.currentStep);
      if (validationError) {
        this.showError(validationError);
        return;
      }

      this.clearErrors();
      this.currentStep = Math.min(6, this.currentStep + 1) as WizardStep;
      this.renderStep();
    });

    const frameworkSelect = form.querySelector('#framework') as HTMLSelectElement | null;
    frameworkSelect?.addEventListener('change', () => {
      this.persistStepInputs(form);
      this.renderStep();
    });
  }

  private persistStepInputs(form: HTMLFormElement): void {
    const formData = new FormData(form);

    this.data.organizationName = (formData.get('organizationName') as string || this.data.organizationName).trim();
    this.data.projectName = (formData.get('projectName') as string || this.data.projectName).trim();
    this.data.owner = (formData.get('owner') as string || this.data.owner).trim();
    this.data.scopeSummary = (formData.get('scopeSummary') as string || this.data.scopeSummary).trim();
    this.data.locations = (formData.get('locations') as string || this.data.locations).trim();

    const framework = (formData.get('framework') as string || this.data.framework) as WizardData['framework'];
    if (framework === 'ISO 27001' || framework === 'NIS2' || framework === 'Custom') {
      this.data.framework = framework;
    }

    this.data.customFramework = (formData.get('customFramework') as string || this.data.customFramework).trim();

    const startMode = (formData.get('startMode') as string || this.data.startMode) as WizardData['startMode'];
    if (startMode === 'blank' || startMode === 'starter' || startMode === 'import') {
      this.data.startMode = startMode;
    }
  }

  private validateStep(step: WizardStep): string | null {
    if (step === 1) {
      if (!this.data.organizationName) return 'Organization name is required.';
      if (!this.data.projectName) return 'Project name is required.';
      if (this.data.projectName.length < 3) return 'Project name must be at least 3 characters.';
    }

    if (step === 2) {
      if (!this.data.scopeSummary) return 'ISMS scope is required.';
      if (this.data.scopeSummary.length < 10) return 'ISMS scope should be at least 10 characters.';
    }

    if (step === 3 && this.data.framework === 'Custom' && !this.data.customFramework) {
      return 'Custom framework name is required.';
    }

    return null;
  }

  /**
   * Handle form submission
   */
  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    if (!this.dialog || this.isSubmitting) return;

    const form = this.dialog.querySelector('#new-project-form') as HTMLFormElement | null;
    if (!form) return;

    this.persistStepInputs(form);
    const validationError = this.validateStep(6);
    if (validationError) {
      this.showError(validationError);
      return;
    }

    try {
      this.isSubmitting = true;
      this.clearErrors();

      // Show loading state
      this.setSubmitButtonLoading(true);

      const selectedFramework = this.data.framework === 'Custom'
        ? this.data.customFramework
        : this.data.framework;

      const lifecycleStatus = this.data.scopeSummary ? 'scope_defined' : 'draft';

      // Create project
      const project = await this.options.projectStore.createProject({
        name: this.data.projectName,
        description: this.data.scopeSummary || undefined,
        organizationName: this.data.organizationName,
        owner: this.data.owner || undefined,
        primaryFramework: selectedFramework,
        lifecycleStatus,
      });

      await this.options.projectStore.createOrganizationProfile(project.id, {
        name: this.data.organizationName,
        regulatoryFrameworks: selectedFramework ? [selectedFramework] : undefined,
      });

      if (this.data.scopeSummary) {
        await this.options.projectStore.createIsmScope(project.id, {
          scopeStatement: this.data.scopeSummary,
          locations: this.data.locations
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
        });
      }

      if (selectedFramework) {
        const currentFrameworks = await this.options.projectStore.getControlFrameworks(project.id);
        await this.options.projectStore.updateControlFrameworks(project.id, [
          ...currentFrameworks,
          selectedFramework,
        ]);
      }

      // Success
      this.setSubmitButtonLoading(false);
      this.options.onSuccess?.(project.id);
      this.close();

      if (this.data.startMode === 'import') {
        this.options.onImportRequested?.();
      }
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

    const errorContainer = this.dialog.querySelector('#new-project-form .form-errors');
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

    const errorContainer = this.dialog.querySelector('#new-project-form .form-errors');
    if (errorContainer) {
      errorContainer.textContent = '';
      (errorContainer as HTMLElement).style.display = 'none';
    }
  }

  /**
   * Set submit button loading state
   */
  private setSubmitButtonLoading(isLoading: boolean): void {
    if (!this.dialog) return;

    const submitBtn = this.dialog.querySelector('#btn-submit') as HTMLButtonElement | null;
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
      this.currentStep = 1;
      this.renderStep();
      const firstInput = this.dialog.querySelector('#new-project-form input') as HTMLInputElement | null;
      firstInput?.focus();
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
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
