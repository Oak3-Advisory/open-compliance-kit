import type { Control, ControlReview, DocumentManifest } from '../../types';
import type { ProjectStore } from '../../state/projectStore';

interface ReviewDialogOptions {
  projectStore: ProjectStore;
  projectId: string;
  controls: Control[];
  documents?: DocumentManifest[];
  review?: ControlReview;
  onSuccess?: (reviewId: string) => void;
  onCancel?: () => void;
}

export class ReviewDialog {
  private container: HTMLElement | null = null;
  private dialogElement: HTMLDialogElement | null = null;
  private projectStore: ProjectStore;
  private projectId: string;
  private controls: Control[];
  private documents: DocumentManifest[];
  private review: ControlReview | null;
  private onSuccess: ((reviewId: string) => void) | null;
  private onCancel: (() => void) | null;

  constructor(options: ReviewDialogOptions) {
    this.projectStore = options.projectStore;
    this.projectId = options.projectId;
    this.controls = options.controls;
    this.documents = options.documents || [];
    this.review = options.review || null;
    this.onSuccess = options.onSuccess || null;
    this.onCancel = options.onCancel || null;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private renderHTML(): string {
    const isEditing = !!this.review;
    const title = isEditing ? 'Edit Control Review' : 'Schedule Control Review';

    return `
      <dialog class="review-dialog" aria-modal="true" aria-labelledby="review-dialog-title">
        <div class="dialog-content">
          <div class="dialog-header">
            <h2 id="review-dialog-title">${title}</h2>
            <button type="button" class="modal-close-btn" id="btn-close" aria-label="Close dialog">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <form id="review-form" class="dialog-form-long">
            <section class="dialog-section">
              <h3 class="dialog-section-title">Review Setup</h3>
            <div class="form-group">
              <label for="review-linked-control">Control *</label>
              <select id="review-linked-control" name="linkedControlId" required>
                <option value="">Select control...</option>
                ${this.controls
                  .map(
                    (control) => `<option value="${this.escapeHtml(control.id)}" ${this.review?.linkedControlId === control.id ? 'selected' : ''}>${this.escapeHtml(control.controlId || control.name)} - ${this.escapeHtml(control.name)}</option>`
                  )
                  .join('')}
              </select>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="review-type">Review Type *</label>
                <select id="review-type" name="reviewType" required>
                  <option value="">Select type...</option>
                  <option value="design_review" ${this.review?.reviewType === 'design_review' ? 'selected' : ''}>Design Review</option>
                  <option value="operational_test" ${this.review?.reviewType === 'operational_test' ? 'selected' : ''}>Operational Test</option>
                  <option value="compliance_review" ${this.review?.reviewType === 'compliance_review' ? 'selected' : ''}>Compliance Review</option>
                </select>
              </div>

              <div class="form-group">
                <label for="review-status">Status *</label>
                <select id="review-status" name="status" required>
                  <option value="scheduled" ${!this.review || this.review.status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                  <option value="in_progress" ${this.review?.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                  <option value="passed" ${this.review?.status === 'passed' ? 'selected' : ''}>Passed</option>
                  <option value="failed" ${this.review?.status === 'failed' ? 'selected' : ''}>Failed</option>
                  <option value="needs_evidence" ${this.review?.status === 'needs_evidence' ? 'selected' : ''}>Needs Evidence</option>
                  <option value="not_applicable" ${this.review?.status === 'not_applicable' ? 'selected' : ''}>Not Applicable</option>
                  <option value="blocked" ${this.review?.status === 'blocked' ? 'selected' : ''}>Blocked</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="review-scheduled-date">Scheduled Date *</label>
                <input type="date" id="review-scheduled-date" name="scheduledDate" value="${this.escapeHtml(this.review?.scheduledDate || '')}" required />
              </div>

              <div class="form-group">
                <label for="review-actual-date">Actual Date</label>
                <input type="date" id="review-actual-date" name="actualDate" value="${this.escapeHtml(this.review?.actualDate || '')}" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="review-reviewer">Reviewer</label>
                <input type="text" id="review-reviewer" name="reviewer" maxlength="255" value="${this.escapeHtml(this.review?.reviewer || '')}" placeholder="e.g., Internal Auditor" />
              </div>

              <div class="form-group">
                <label for="review-effectiveness">Effectiveness *</label>
                <select id="review-effectiveness" name="effectivenessRating" required>
                  <option value="not_tested" ${!this.review || this.review.effectivenessRating === 'not_tested' ? 'selected' : ''}>Not Tested</option>
                  <option value="ineffective" ${this.review?.effectivenessRating === 'ineffective' ? 'selected' : ''}>Ineffective</option>
                  <option value="partially_effective" ${this.review?.effectivenessRating === 'partially_effective' ? 'selected' : ''}>Partially Effective</option>
                  <option value="effective" ${this.review?.effectivenessRating === 'effective' ? 'selected' : ''}>Effective</option>
                </select>
              </div>
            </div>
            </section>

            <section class="dialog-section">
              <h3 class="dialog-section-title">Execution Details</h3>
            <div class="form-group">
              <label for="review-test-plan">Test Plan</label>
              <textarea id="review-test-plan" name="testPlan" maxlength="2000" rows="3" placeholder="How will this review be conducted?">${this.escapeHtml(this.review?.testPlan || '')}</textarea>
            </div>

            <div class="form-group">
              <label for="review-test-result">Test Result</label>
              <textarea id="review-test-result" name="testResult" maxlength="2000" rows="3" placeholder="Summary of pass/fail outcome">${this.escapeHtml(this.review?.testResult || '')}</textarea>
            </div>

            <div class="form-group">
              <label for="review-linked-evidence">Linked Evidence</label>
              <select id="review-linked-evidence" name="linkedEvidenceIds" multiple size="4">
                ${this.documents
                  .map(
                    (doc) => `<option value="${this.escapeHtml(doc.id)}" ${this.review?.linkedEvidenceIds?.includes(doc.id) ? 'selected' : ''}>${this.escapeHtml(doc.name)}</option>`
                  )
                  .join('')}
              </select>
              <p class="form-hint">Reference reusable evidence used during this review.</p>
            </div>

            <div class="form-group">
              <label for="review-observations">Observations</label>
              <textarea id="review-observations" name="observations" maxlength="2000" rows="3" placeholder="Auditor observations">${this.escapeHtml(this.review?.observations || '')}</textarea>
            </div>

            <div class="form-group">
              <label for="review-next-date">Next Review Date</label>
              <input type="date" id="review-next-date" name="nextReviewScheduledDate" value="${this.escapeHtml(this.review?.nextReviewScheduledDate || '')}" />
            </div>
            </section>

            <section class="dialog-section">
              <h3 class="dialog-section-title">Notes</h3>
            <div class="form-group">
              <label for="review-notes">Notes</label>
              <textarea id="review-notes" name="notes" maxlength="2000" rows="2" placeholder="Optional notes">${this.escapeHtml(this.review?.notes || '')}</textarea>
            </div>
            </section>

            <div class="form-errors" style="display: none;"></div>

            <div class="dialog-actions">
              <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
              <button type="submit" class="btn btn-primary">${isEditing ? 'Update Review' : 'Create Review'}</button>
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
    const errorDiv = this.dialogElement.querySelector('.form-errors') as HTMLElement;

    errorDiv.textContent = '';
    errorDiv.style.display = 'none';

    const linkedControlId = (formData.get('linkedControlId') as string || '').trim();
    const reviewType = formData.get('reviewType') as ControlReview['reviewType'];
    const status = formData.get('status') as ControlReview['status'];
    const scheduledDate = (formData.get('scheduledDate') as string || '').trim();
    const actualDate = (formData.get('actualDate') as string || '').trim() || undefined;
    const reviewer = (formData.get('reviewer') as string || '').trim() || undefined;
    const effectivenessRating = formData.get('effectivenessRating') as ControlReview['effectivenessRating'];
    const testPlan = (formData.get('testPlan') as string || '').trim() || undefined;
    const testResult = (formData.get('testResult') as string || '').trim() || undefined;
    const linkedEvidenceSelect = this.dialogElement.querySelector('#review-linked-evidence') as HTMLSelectElement;
    const linkedEvidenceIds = Array.from(linkedEvidenceSelect?.selectedOptions || []).map((option) => option.value);
    const observations = (formData.get('observations') as string || '').trim() || undefined;
    const nextReviewScheduledDate = (formData.get('nextReviewScheduledDate') as string || '').trim() || undefined;
    const notes = (formData.get('notes') as string || '').trim() || undefined;

    if (!linkedControlId) {
      errorDiv.textContent = 'Control is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (!reviewType) {
      errorDiv.textContent = 'Review type is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (!scheduledDate) {
      errorDiv.textContent = 'Scheduled date is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (!status) {
      errorDiv.textContent = 'Status is required';
      errorDiv.style.display = 'block';
      return;
    }

    if (!effectivenessRating) {
      errorDiv.textContent = 'Effectiveness rating is required';
      errorDiv.style.display = 'block';
      return;
    }

    try {
      let savedReviewId = this.review?.id || '';

      if (this.review) {
        const updated = await this.projectStore.updateControlReview(this.projectId, this.review.id, {
          linkedControlId,
          reviewType,
          scheduledDate,
          actualDate,
          reviewer,
          status,
          effectivenessRating,
          testPlan,
          linkedEvidenceIds,
          testResult,
          observations,
          nextReviewScheduledDate,
          notes,
        });
        savedReviewId = updated.id;
      } else {
        const created = await this.projectStore.createControlReview(this.projectId, {
          linkedControlId,
          reviewType,
          scheduledDate,
          actualDate,
          reviewer,
          status,
          effectivenessRating,
          testPlan,
          linkedEvidenceIds,
          testResult,
          observations,
          nextReviewScheduledDate,
          notes,
        });
        savedReviewId = created.id;
      }

      this.close();
      if (this.onSuccess) {
        this.onSuccess(savedReviewId);
      }
    } catch (error) {
      console.error('Failed to save review:', error);
      errorDiv.textContent = 'Failed to save review. Please try again.';
      errorDiv.style.display = 'block';
    }
  }

  open(): void {
    this.dialogElement?.showModal();
    const firstField = this.dialogElement?.querySelector('#review-linked-control') as HTMLSelectElement | null;
    firstField?.focus();
  }

  close(): void {
    this.dialogElement?.close();
  }

  mount(container: HTMLElement): void {
    this.container = container;

    const template = document.createElement('template');
    template.innerHTML = this.renderHTML();
    this.container.appendChild(template.content.cloneNode(true));

    this.dialogElement = this.container.querySelector('.review-dialog');
    if (!this.dialogElement) return;

    const form = this.dialogElement.querySelector('#review-form') as HTMLFormElement;
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