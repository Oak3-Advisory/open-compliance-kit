import type { Control, ControlIdSettings, DocumentManifest, Risk } from '../../types';
import type { ProjectStore } from '../../state/projectStore';

interface ControlDialogOptions {
  projectStore: ProjectStore;
  projectId: string;
  risks?: Risk[];
  onSuccess?: (controlId: string) => void;
  onCancel?: () => void;
  control?: Control;
  controlIdSettings?: ControlIdSettings;
  suggestedControlId?: string;
  documents?: DocumentManifest[];
}

export class ControlDialog {
  private container: HTMLElement | null = null;
  private dialogElement: HTMLDialogElement | null = null;
  private projectStore: ProjectStore;
  private projectId: string;
  private risks: Risk[];
  private onSuccess: ((controlId: string) => void) | null;
  private onCancel: (() => void) | null;
  private control: Control | null;
  private controlIdSettings: ControlIdSettings;
  private suggestedControlId: string;
  private documents: DocumentManifest[];

  constructor(options: ControlDialogOptions) {
    this.projectStore = options.projectStore;
    this.projectId = options.projectId;
    this.risks = options.risks || [];
    this.onSuccess = options.onSuccess || null;
    this.onCancel = options.onCancel || null;
    this.control = options.control || null;
    this.controlIdSettings = options.controlIdSettings || {
      mode: 'auto',
      prefix: 'CTL',
      separator: '-',
      padding: 3,
      nextSequence: 1,
    };
    this.suggestedControlId = options.suggestedControlId || '';
    this.documents = options.documents || [];
  }

  private renderHTML(): string {
    const isEditing = !!this.control;
    const title = isEditing ? 'Edit Control' : 'Create Control';
    const isAutoCreate = !isEditing && this.controlIdSettings.mode === 'auto';
    const initialControlId = this.control?.controlId || (isAutoCreate ? this.suggestedControlId : '');
    const controlIdHelpText = isAutoCreate
      ? 'Control ID is generated from project settings. Update numbering in Settings.'
      : 'Use a unique ID such as CTL-001.';

    return `
      <dialog class="control-dialog" aria-modal="true" aria-labelledby="control-dialog-title">
        <div class="dialog-content">
          <div class="dialog-header">
            <h2 id="control-dialog-title">${title}</h2>
            <button type="button" class="modal-close-btn" id="btn-close" aria-label="Close dialog">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <form id="control-form" class="dialog-form-long">
            <section class="dialog-section">
              <h3 class="dialog-section-title">Control Definition</h3>
            <div class="form-group">
              <label for="control-control-id">Control ID ${isAutoCreate ? '(Auto-generated)' : ''}</label>
              <input
                type="text"
                id="control-control-id"
                name="controlId"
                placeholder="e.g., CTL-001"
                maxlength="50"
                value="${this.escapeHtml(initialControlId)}"
                ${isAutoCreate ? 'readonly aria-readonly="true"' : ''}
              />
              <p class="form-hint">${this.escapeHtml(controlIdHelpText)}</p>
            </div>

            <div class="form-group">
              <label for="control-name">Control Name *</label>
              <input
                type="text"
                id="control-name"
                name="name"
                placeholder="e.g., Quarterly Access Review"
                maxlength="255"
                value="${this.escapeHtml(this.control?.name || '')}"
                required
              />
            </div>

            <div class="form-group">
              <label for="control-objective">Objective *</label>
              <textarea
                id="control-objective"
                name="objective"
                placeholder="What does this control achieve?"
                maxlength="2000"
                required
              >${this.escapeHtml(this.control?.objective || '')}</textarea>
            </div>

            <div class="form-group">
              <label for="control-description">Description</label>
              <textarea
                id="control-description"
                name="description"
                placeholder="Describe how this control is performed"
                maxlength="2000"
              >${this.escapeHtml(this.control?.description || '')}</textarea>
            </div>
            </section>

            <section class="dialog-section">
              <h3 class="dialog-section-title">Implementation</h3>
            <div class="form-row">
              <div class="form-group">
                <label for="control-type">Control Type *</label>
                <select id="control-type" name="controlType" required>
                  <option value="">Select control type...</option>
                  <option value="preventive" ${this.control?.controlType === 'preventive' ? 'selected' : ''}>Preventive</option>
                  <option value="detective" ${this.control?.controlType === 'detective' ? 'selected' : ''}>Detective</option>
                  <option value="corrective" ${this.control?.controlType === 'corrective' ? 'selected' : ''}>Corrective</option>
                </select>
              </div>

              <div class="form-group">
                <label for="control-frequency">Frequency *</label>
                <select id="control-frequency" name="frequency" required>
                  <option value="">Select frequency...</option>
                  <option value="manual" ${this.control?.frequency === 'manual' ? 'selected' : ''}>Manual</option>
                  <option value="daily" ${this.control?.frequency === 'daily' ? 'selected' : ''}>Daily</option>
                  <option value="weekly" ${this.control?.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                  <option value="monthly" ${this.control?.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                  <option value="quarterly" ${this.control?.frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
                  <option value="annually" ${this.control?.frequency === 'annually' ? 'selected' : ''}>Annually</option>
                  <option value="as_needed" ${this.control?.frequency === 'as_needed' ? 'selected' : ''}>As Needed</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="control-owner">Owner</label>
                <input
                  type="text"
                  id="control-owner"
                  name="owner"
                  placeholder="e.g., Security Team"
                  maxlength="255"
                  value="${this.escapeHtml(this.control?.owner || '')}"
                />
              </div>

              <div class="form-group">
                <label for="control-status">Implementation Status *</label>
                <select id="control-status" name="implementationStatus" required>
                  <option value="">Select status...</option>
                  <option value="not_started" ${this.control?.implementationStatus === 'not_started' ? 'selected' : ''}>Not Started</option>
                  <option value="planned" ${this.control?.implementationStatus === 'planned' ? 'selected' : ''}>Planned</option>
                  <option value="implemented" ${this.control?.implementationStatus === 'implemented' ? 'selected' : ''}>Implemented</option>
                  <option value="partially_implemented" ${this.control?.implementationStatus === 'partially_implemented' ? 'selected' : ''}>Partially Implemented</option>
                  <option value="not_applicable" ${this.control?.implementationStatus === 'not_applicable' ? 'selected' : ''}>Not Applicable</option>
                </select>
              </div>
            </div>
            </section>

            <section class="dialog-section">
              <h3 class="dialog-section-title">Testing And Mapping</h3>
            <div class="form-group">
              <label for="control-test-method">Test Method *</label>
              <textarea
                id="control-test-method"
                name="testMethod"
                placeholder="How is control effectiveness verified?"
                maxlength="500"
                required
              >${this.escapeHtml(this.control?.testMethod || '')}</textarea>
            </div>

            <div class="form-group">
              <label for="control-linked-risks">Linked Risks</label>
              <select id="control-linked-risks" name="linkedRiskIds" multiple size="4">
                ${this.risks
                  .map(
                    (risk) => `<option value="${risk.id}" ${this.control?.linkedRiskIds?.includes(risk.id) ? 'selected' : ''}>${this.escapeHtml(risk.title)}</option>`
                  )
                  .join('')}
              </select>
              <p class="form-hint">Hold Cmd/Ctrl to select multiple risks.</p>
            </div>

            <div class="form-group">
              <label for="control-linked-requirements">Linked ISO Requirement IDs</label>
              <input
                type="text"
                id="control-linked-requirements"
                name="linkedRequirements"
                placeholder="Comma-separated (e.g., A.5.1, A.8.2, A.8.16)"
                maxlength="500"
                value="${this.escapeHtml(this.control?.linkedRequirementIds?.join(', ') || '')}"
              />
              <p class="form-hint">Use Annex A control identifiers for quick mapping.</p>
            </div>

            <div class="form-group">
              <label for="control-linked-evidence">Linked Evidence</label>
              <select id="control-linked-evidence" name="linkedEvidenceIds" multiple size="4">
                ${this.documents
                  .map(
                    (doc) => `<option value="${doc.id}" ${this.control?.linkedEvidenceIds?.includes(doc.id) ? 'selected' : ''}>${this.escapeHtml(doc.name)}</option>`
                  )
                  .join('')}
              </select>
              <p class="form-hint">Link reusable evidence files to this control.</p>
            </div>
            </section>

            <div class="form-errors" style="display: none;"></div>

            <div class="dialog-actions">
              <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
              <button type="submit" class="btn btn-primary">${isEditing ? 'Update Control' : 'Create Control'}</button>
            </div>
          </form>
        </div>
      </dialog>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    if (!this.dialogElement) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const linkedRisksSelect = this.dialogElement.querySelector('#control-linked-risks') as HTMLSelectElement;
    const linkedRiskIds = Array.from(linkedRisksSelect?.selectedOptions || []).map((option) => option.value);
    const linkedEvidenceSelect = this.dialogElement.querySelector('#control-linked-evidence') as HTMLSelectElement;
    const linkedEvidenceIds = Array.from(linkedEvidenceSelect?.selectedOptions || []).map((option) => option.value);
    const linkedRequirementsRaw = (formData.get('linkedRequirements') as string || '').trim();
    const linkedRequirementIds = linkedRequirementsRaw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const controlId = (formData.get('controlId') as string || '').trim() || undefined;
    const name = (formData.get('name') as string || '').trim();
    const objective = (formData.get('objective') as string || '').trim();
    const description = (formData.get('description') as string || '').trim() || undefined;
    const frequency = formData.get('frequency') as Control['frequency'];
    const controlType = formData.get('controlType') as Control['controlType'];
    const owner = (formData.get('owner') as string || '').trim() || undefined;
    const testMethod = (formData.get('testMethod') as string || '').trim();
    const implementationStatus = formData.get('implementationStatus') as Control['implementationStatus'];

    const errorDiv = this.dialogElement.querySelector('.form-errors') as HTMLElement;
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';

    if (!name) {
      errorDiv.textContent = 'Control name is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (name.length < 3) {
      errorDiv.textContent = 'Control name must be at least 3 characters';
      errorDiv.style.display = 'block';
      return;
    }

    if (!objective) {
      errorDiv.textContent = 'Control objective is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (!controlType) {
      errorDiv.textContent = 'Control type is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (!frequency) {
      errorDiv.textContent = 'Control frequency is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (!testMethod) {
      errorDiv.textContent = 'Test method is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (!implementationStatus) {
      errorDiv.textContent = 'Implementation status is required';
      errorDiv.style.display = 'block';
      return;
    }

    try {
      let savedControlId = this.control?.id || '';

      if (this.control) {
        const updated = await this.projectStore.updateControl(this.projectId, this.control.id, {
          controlId,
          name,
          objective,
          description,
          frequency,
          controlType,
          owner,
          testMethod,
          implementationStatus,
          linkedRiskIds,
          linkedRequirementIds,
          linkedEvidenceIds,
        });
        savedControlId = updated.id;
      } else {
        const created = await this.projectStore.createControl(this.projectId, {
          controlId,
          name,
          objective,
          description,
          frequency,
          controlType,
          owner,
          testMethod,
          implementationStatus,
          linkedRiskIds,
          linkedRequirementIds,
          linkedEvidenceIds,
        });
        savedControlId = created.id;
      }

      this.close();

      if (this.onSuccess) {
        this.onSuccess(savedControlId);
      }
    } catch (error) {
      console.error('Failed to save control:', error);
      errorDiv.textContent = 'Failed to save control. Please try again.';
      errorDiv.style.display = 'block';
    }
  }

  open(): void {
    this.dialogElement?.showModal();
    const firstInput = this.dialogElement?.querySelector('#control-name') as HTMLInputElement | null;
    firstInput?.focus();
  }

  close(): void {
    this.dialogElement?.close();
  }

  mount(container: HTMLElement): void {
    this.container = container;

    const template = document.createElement('template');
    template.innerHTML = this.renderHTML();
    this.container.appendChild(template.content.cloneNode(true));

    this.dialogElement = this.container.querySelector('.control-dialog');

    if (!this.dialogElement) return;

    const form = this.dialogElement.querySelector('#control-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => this.handleSubmit(e));

    const cancelBtn = this.dialogElement.querySelector('#btn-cancel');
    cancelBtn?.addEventListener('click', () => {
      this.close();
      if (this.onCancel) {
        this.onCancel();
      }
    });

    const closeBtn = this.dialogElement.querySelector('#btn-close');
    closeBtn?.addEventListener('click', () => {
      this.close();
      if (this.onCancel) {
        this.onCancel();
      }
    });
  }

  unmount(): void {
    this.dialogElement?.remove();
    this.dialogElement = null;
    this.container = null;
  }
}