import type { Asset } from '../../types';
import type { ProjectStore } from '../../state/projectStore';

interface AssetDialogOptions {
  projectStore: ProjectStore;
  projectId: string;
  onSuccess?: (assetId: string) => void;
  onCancel?: () => void;
  asset?: Asset;
}

export class AssetDialog {
  private container: HTMLElement | null = null;
  private dialogElement: HTMLDialogElement | null = null;
  private projectStore: ProjectStore;
  private projectId: string;
  private onSuccess: ((assetId: string) => void) | null;
  private onCancel: (() => void) | null;
  private asset: Asset | null;

  constructor(options: AssetDialogOptions) {
    this.projectStore = options.projectStore;
    this.projectId = options.projectId;
    this.onSuccess = options.onSuccess || null;
    this.onCancel = options.onCancel || null;
    this.asset = options.asset || null;
  }

  private renderHTML(): string {
    const isEditing = !!this.asset;
    const title = isEditing ? 'Edit Asset' : 'Create Asset';

    return `
      <dialog class="asset-dialog" aria-modal="true" aria-labelledby="asset-dialog-title">
        <div class="dialog-content">
          <div class="dialog-header">
            <h2 id="asset-dialog-title">${title}</h2>
            <button type="button" class="modal-close-btn" id="btn-close" aria-label="Close dialog">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <form id="asset-form">
            <div class="form-group">
              <label for="asset-name">Asset Name *</label>
              <input
                type="text"
                id="asset-name"
                name="name"
                placeholder="e.g., Customer Database, Production Server"
                maxlength="255"
                value="${this.escapeHtml(this.asset?.name || '')}"
                required
              />
            </div>

            <div class="form-group">
              <label for="asset-description">Description</label>
              <textarea
                id="asset-description"
                name="description"
                placeholder="Describe the asset and its purpose"
                maxlength="1000"
              >${this.escapeHtml(this.asset?.description || '')}</textarea>
            </div>

            <div class="form-group">
              <label for="asset-type">Asset Type *</label>
              <select id="asset-type" name="type" required>
                <option value="">Select asset type...</option>
                <option value="application" ${this.asset?.type === 'application' ? 'selected' : ''}>Application</option>
                <option value="infrastructure" ${this.asset?.type === 'infrastructure' ? 'selected' : ''}>Infrastructure</option>
                <option value="data" ${this.asset?.type === 'data' ? 'selected' : ''}>Data</option>
                <option value="process" ${this.asset?.type === 'process' ? 'selected' : ''}>Process</option>
                <option value="people" ${this.asset?.type === 'people' ? 'selected' : ''}>People</option>
                <option value="other" ${this.asset?.type === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>

            <div class="form-group">
              <label for="asset-criticality">Criticality *</label>
              <select id="asset-criticality" name="criticality" required>
                <option value="">Select criticality...</option>
                <option value="low" ${this.asset?.criticality === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${this.asset?.criticality === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${this.asset?.criticality === 'high' ? 'selected' : ''}>High</option>
                <option value="critical" ${this.asset?.criticality === 'critical' ? 'selected' : ''}>Critical</option>
              </select>
            </div>

            <div class="form-group">
              <label for="asset-owner">Owner</label>
              <input
                type="text"
                id="asset-owner"
                name="owner"
                placeholder="e.g., John Doe, IT Team"
                maxlength="255"
                value="${this.escapeHtml(this.asset?.owner || '')}"
              />
            </div>

            <div class="form-group">
              <label for="asset-location">Location</label>
              <input
                type="text"
                id="asset-location"
                name="location"
                placeholder="e.g., AWS us-east-1, On-premises"
                maxlength="255"
                value="${this.escapeHtml(this.asset?.location || '')}"
              />
            </div>

            <div class="form-errors" style="display: none;"></div>

            <div class="dialog-actions">
              <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
              <button type="submit" class="btn btn-primary">${isEditing ? 'Update Asset' : 'Create Asset'}</button>
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

    const name = (formData.get('name') as string || '').trim();
    const description = (formData.get('description') as string || '').trim();
    const type = formData.get('type') as Asset['type'];
    const criticality = formData.get('criticality') as Asset['criticality'];
    const owner = (formData.get('owner') as string || '').trim() || undefined;
    const location = (formData.get('location') as string || '').trim() || undefined;

    const errorDiv = this.dialogElement.querySelector('.form-errors') as HTMLElement;
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';

    // Validation
    if (!name) {
      errorDiv.textContent = 'Asset name is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (name.length < 3) {
      errorDiv.textContent = 'Asset name must be at least 3 characters';
      errorDiv.style.display = 'block';
      return;
    }

    if (!type) {
      errorDiv.textContent = 'Asset type is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (!criticality) {
      errorDiv.textContent = 'Criticality is required';
      errorDiv.style.display = 'block';
      return;
    }

    try {
      if (this.asset) {
        await this.projectStore.updateAsset(this.projectId, this.asset.id, {
          name,
          description: description || undefined,
          type,
          criticality,
          owner,
          location,
        });
      } else {
        await this.projectStore.createAsset(this.projectId, {
          name,
          description: description || undefined,
          type,
          criticality,
          owner,
          location,
        });
      }

      this.close();

      if (this.onSuccess) {
        this.onSuccess(this.asset?.id || '');
      }
    } catch (error) {
      console.error('Failed to save asset:', error);
      errorDiv.textContent = 'Failed to save asset. Please try again.';
      errorDiv.style.display = 'block';
    }
  }

  open(): void {
    this.dialogElement?.showModal();
    const firstInput = this.dialogElement?.querySelector('#asset-name') as HTMLInputElement | null;
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

    this.dialogElement = this.container.querySelector('.asset-dialog');

    if (!this.dialogElement) return;

    const form = this.dialogElement.querySelector('#asset-form') as HTMLFormElement;
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
