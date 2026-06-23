import type { DocumentManifest, Risk } from '../../types';
import type { ProjectStore } from '../../state/projectStore';

interface RiskDialogOptions {
  projectStore: ProjectStore;
  projectId: string;
  onSuccess?: (riskId: string) => void;
  onCancel?: () => void;
  risk?: Risk;
  documents?: DocumentManifest[];
}

export class RiskDialog {
  private container: HTMLElement | null = null;
  private dialogElement: HTMLDialogElement | null = null;
  private projectStore: ProjectStore;
  private projectId: string;
  private onSuccess: ((riskId: string) => void) | null;
  private onCancel: (() => void) | null;
  private risk: Risk | null;
  private documents: DocumentManifest[];

  constructor(options: RiskDialogOptions) {
    this.projectStore = options.projectStore;
    this.projectId = options.projectId;
    this.onSuccess = options.onSuccess || null;
    this.onCancel = options.onCancel || null;
    this.risk = options.risk || null;
    this.documents = options.documents || [];
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private renderHTML(): string {
    const isEditing = !!this.risk;
    const title = isEditing ? 'Edit Risk' : 'Create Risk';

    return `
      <dialog class="risk-dialog" aria-modal="true" aria-labelledby="risk-dialog-title">
        <div class="dialog-content">
          <div class="dialog-header">
            <h2 id="risk-dialog-title">${title}</h2>
            <button type="button" class="modal-close-btn" id="btn-close" aria-label="Close dialog">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <form id="risk-form">
            <div class="form-group">
              <label for="risk-title">Risk Title *</label>
              <input
                type="text"
                id="risk-title"
                name="title"
                placeholder="e.g., Data Breach, System Outage"
                maxlength="255"
                value="${this.escapeHtml(this.risk?.title || '')}"
                required
              />
            </div>

            <div class="form-group">
              <label for="risk-description">Description</label>
              <textarea
                id="risk-description"
                name="description"
                placeholder="Describe the risk and its potential impact"
                maxlength="1000"
              >${this.escapeHtml(this.risk?.description || '')}</textarea>
            </div>

            <div class="form-group">
              <label for="risk-threat">Threat</label>
              <input
                type="text"
                id="risk-threat"
                name="threat"
                placeholder="e.g., Malicious insider, Ransomware attack"
                maxlength="255"
                value="${this.escapeHtml(this.risk?.threat || '')}"
              />
            </div>

            <div class="form-group">
              <label for="risk-vulnerability">Vulnerability</label>
              <input
                type="text"
                id="risk-vulnerability"
                name="vulnerability"
                placeholder="e.g., Weak access controls, Unpatched system"
                maxlength="255"
                value="${this.escapeHtml(this.risk?.vulnerability || '')}"
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="risk-likelihood">Likelihood *</label>
                <select id="risk-likelihood" name="likelihood" required>
                  <option value="">Select likelihood...</option>
                  <option value="low" ${this.risk?.likelihood === 'low' ? 'selected' : ''}>Low</option>
                  <option value="medium" ${this.risk?.likelihood === 'medium' ? 'selected' : ''}>Medium</option>
                  <option value="high" ${this.risk?.likelihood === 'high' ? 'selected' : ''}>High</option>
                  <option value="critical" ${this.risk?.likelihood === 'critical' ? 'selected' : ''}>Critical</option>
                </select>
              </div>

              <div class="form-group">
                <label for="risk-impact">Impact *</label>
                <select id="risk-impact" name="impact" required>
                  <option value="">Select impact...</option>
                  <option value="low" ${this.risk?.impact === 'low' ? 'selected' : ''}>Low</option>
                  <option value="medium" ${this.risk?.impact === 'medium' ? 'selected' : ''}>Medium</option>
                  <option value="high" ${this.risk?.impact === 'high' ? 'selected' : ''}>High</option>
                  <option value="critical" ${this.risk?.impact === 'critical' ? 'selected' : ''}>Critical</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="risk-status">Status</label>
              <select id="risk-status" name="status">
                <option value="identified" ${!this.risk || this.risk.status === 'identified' ? 'selected' : ''}>Identified</option>
                <option value="assessed" ${this.risk?.status === 'assessed' ? 'selected' : ''}>Assessed</option>
                <option value="treated" ${this.risk?.status === 'treated' ? 'selected' : ''}>Treated</option>
                <option value="closed" ${this.risk?.status === 'closed' ? 'selected' : ''}>Closed</option>
              </select>
            </div>

            <div class="form-group">
              <label for="risk-treatment">Treatment Option</label>
              <select id="risk-treatment" name="treatmentOption">
                <option value="">Select treatment...</option>
                <option value="mitigate" ${this.risk?.treatmentOption === 'mitigate' ? 'selected' : ''}>Mitigate</option>
                <option value="accept" ${this.risk?.treatmentOption === 'accept' ? 'selected' : ''}>Accept</option>
                <option value="avoid" ${this.risk?.treatmentOption === 'avoid' ? 'selected' : ''}>Avoid</option>
                <option value="transfer" ${this.risk?.treatmentOption === 'transfer' ? 'selected' : ''}>Transfer</option>
              </select>
            </div>

            <div class="form-group">
              <label for="risk-linked-evidence">Linked Evidence</label>
              <select id="risk-linked-evidence" name="linkedEvidenceIds" multiple size="4">
                ${this.documents
                  .map(
                    (doc) => `<option value="${this.escapeHtml(doc.id)}" ${this.risk?.linkedEvidenceIds?.includes(doc.id) ? 'selected' : ''}>${this.escapeHtml(doc.name)}</option>`
                  )
                  .join('')}
              </select>
              <p class="form-hint">Link reusable evidence files to this risk.</p>
            </div>

            <div class="form-errors" style="display: none;"></div>

            <div class="dialog-actions">
              <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
              <button type="submit" class="btn btn-primary">${isEditing ? 'Update Risk' : 'Create Risk'}</button>
            </div>
          </form>
        </div>
      </dialog>
    `;
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    if (!this.dialogElement) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const title = (formData.get('title') as string || '').trim();
    const description = (formData.get('description') as string || '').trim();
    const threat = (formData.get('threat') as string || '').trim() || undefined;
    const vulnerability = (formData.get('vulnerability') as string || '').trim() || undefined;
    const likelihood = formData.get('likelihood') as Risk['likelihood'];
    const impact = formData.get('impact') as Risk['impact'];
    const status = (formData.get('status') as Risk['status']) || 'identified';
    const treatmentOption = (formData.get('treatmentOption') as Risk['treatmentOption']) || undefined;
    const linkedEvidenceSelect = this.dialogElement.querySelector('#risk-linked-evidence') as HTMLSelectElement;
    const linkedEvidenceIds = Array.from(linkedEvidenceSelect?.selectedOptions || []).map((option) => option.value);

    const errorDiv = this.dialogElement.querySelector('.form-errors') as HTMLElement;
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';

    // Validation
    if (!title) {
      errorDiv.textContent = 'Risk title is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (title.length < 3) {
      errorDiv.textContent = 'Risk title must be at least 3 characters';
      errorDiv.style.display = 'block';
      return;
    }

    if (!likelihood) {
      errorDiv.textContent = 'Likelihood is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (!impact) {
      errorDiv.textContent = 'Impact is required';
      errorDiv.style.display = 'block';
      return;
    }

    try {
      let savedRiskId = this.risk?.id || '';

      if (this.risk) {
        const updated = await this.projectStore.updateRisk(this.projectId, this.risk.id, {
          title,
          description: description || undefined,
          threat,
          vulnerability,
          likelihood,
          impact,
          status,
          treatmentOption,
          linkedEvidenceIds,
        });
        savedRiskId = updated.id;
      } else {
        const created = await this.projectStore.createRisk(this.projectId, {
          title,
          description: description || undefined,
          threat,
          vulnerability,
          likelihood,
          impact,
          status,
          treatmentOption,
          linkedEvidenceIds,
        });
        savedRiskId = created.id;
      }

      this.close();

      if (this.onSuccess) {
        this.onSuccess(savedRiskId);
      }
    } catch (error) {
      console.error('Failed to save risk:', error);
      errorDiv.textContent = 'Failed to save risk. Please try again.';
      errorDiv.style.display = 'block';
    }
  }

  open(): void {
    this.dialogElement?.showModal();
    const firstInput = this.dialogElement?.querySelector('#risk-title') as HTMLInputElement | null;
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

    this.dialogElement = this.container.querySelector('.risk-dialog');

    if (!this.dialogElement) return;

    const form = this.dialogElement.querySelector('#risk-form') as HTMLFormElement;
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
