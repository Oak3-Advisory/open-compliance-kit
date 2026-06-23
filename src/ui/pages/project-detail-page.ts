/**
 * Project Detail Page
 *
 * Main workspace for a single ISMS project.
 * Displays project metadata and tabs for different ISMS areas:
 * Scope, Assets, Risks, Controls, Evidence, Reviews, Findings, etc.
 */

import type {
  Project,
  ControlIdSettings,
  OrganizationProfile,
  ISmsScope,
  Asset,
  Risk,
  Control,
  DocumentManifest,
  ControlReview,
} from '../../types';
import type { ProjectStore } from '../../state/projectStore';
import { formatDate, formatBytes } from '../../utils/helpers';
import { AssetDialog } from '../components/asset-dialog';
import { RiskDialog } from '../components/risk-dialog';
import { ControlDialog } from '../components/control-dialog';
import { ReviewDialog } from '../components/review-dialog';

export interface ProjectDetailPageOptions {
  projectStore: ProjectStore;
  projectId: string;
  onBack?: () => void;
}

type TabName = 'overview' | 'scope' | 'assets' | 'risks' | 'controls' | 'evidence' | 'reviews' | 'settings';

export class ProjectDetailPage {
  private container: HTMLElement | null = null;
  private projectStore: ProjectStore;
  private projectId: string;
  private project: Project | null = null;
  private orgProfile: OrganizationProfile | null = null;
  private ismScope: ISmsScope | null = null;
  private assets: Asset[] = [];
  private risks: Risk[] = [];
  private controls: Control[] = [];
  private documents: DocumentManifest[] = [];
  private reviews: ControlReview[] = [];
  private storageEstimate: { usage: number; quota: number; percentUsed: number } | null = null;
  private currentTab: TabName = 'overview';
  private showOrganizationForm = false;
  private unsubscribe: (() => void) | null = null;
  private options: ProjectDetailPageOptions;
  private assetDialog: AssetDialog | null = null;
  private riskDialog: RiskDialog | null = null;
  private controlDialog: ControlDialog | null = null;
  private reviewDialog: ReviewDialog | null = null;
  private backupDialogElement: HTMLDialogElement | null = null;
  private staticListenersBound = false;
  private controlIdSettings: ControlIdSettings = {
    mode: 'auto',
    prefix: 'CTL',
    separator: '-',
    padding: 3,
    nextSequence: 1,
  };
  private nextControlIdSuggestion = '';

  constructor(options: ProjectDetailPageOptions) {
    this.options = options;
    this.projectStore = options.projectStore;
    this.projectId = options.projectId;
  }

  /**
   * Render the project detail page HTML
   */
  private renderHTML(): string {
    if (!this.project) {
      return '<div class="page"><p>Loading...</p></div>';
    }

    return `
      <div class="page project-detail-page">
        <div class="project-detail-header">
          <button class="btn-back" id="btn-back">Back to Projects</button>
          <div class="project-title">
            <h1>${this.escapeHtml(this.project.name)}</h1>
            ${
              this.project.description
                ? `<p>${this.escapeHtml(this.project.description)}</p>`
                : ''
            }
          </div>
          <div class="project-stats">
            <div class="stat">
              <span class="stat-label">Created</span>
              <span class="stat-value">${formatDate(this.project.createdAt)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Storage</span>
              <span class="stat-value">${formatBytes(this.project.storageUsageBytes)}</span>
            </div>
          </div>
        </div>

        <div class="project-tabs">
          <nav class="tabs-nav" role="tablist">
            <button class="tab-button ${this.currentTab === 'overview' ? 'active' : ''}" 
                    data-tab="overview" role="tab">
              Overview
            </button>
            <button class="tab-button ${this.currentTab === 'scope' ? 'active' : ''}" 
                    data-tab="scope" role="tab">
              ISMS Scope
            </button>
            <button class="tab-button ${this.currentTab === 'assets' ? 'active' : ''}" 
                    data-tab="assets" role="tab">
              Assets
            </button>
            <button class="tab-button ${this.currentTab === 'risks' ? 'active' : ''}" 
                    data-tab="risks" role="tab">
              Risks
            </button>
            <button class="tab-button ${this.currentTab === 'controls' ? 'active' : ''}" 
                    data-tab="controls" role="tab">
              Controls
            </button>
            <button class="tab-button ${this.currentTab === 'evidence' ? 'active' : ''}" 
                    data-tab="evidence" role="tab">
              Evidence
            </button>
            <button class="tab-button ${this.currentTab === 'reviews' ? 'active' : ''}" 
                    data-tab="reviews" role="tab">
              Reviews
            </button>
            <button class="tab-button ${this.currentTab === 'settings' ? 'active' : ''}" 
                    data-tab="settings" role="tab">
              Settings
            </button>
          </nav>

          <div class="tabs-content">
            ${this.renderTabContent()}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render content for the current tab
   */
  private renderTabContent(): string {
    switch (this.currentTab) {
      case 'overview':
        return this.renderOverviewTab();
      case 'scope':
        return this.renderScopeTab();
      case 'assets':
        return this.renderAssetsTab();
      case 'risks':
        return this.renderRisksTab();
      case 'controls':
        return this.renderControlsTab();
      case 'evidence':
        return this.renderEvidenceTab();
      case 'reviews':
        return this.renderReviewsTab();
      case 'settings':
        return this.renderSettingsTab();
      default:
        return '<div class="tab-pane">Unknown tab</div>';
    }
  }

  /**
   * Render Overview tab
   */
  private renderOverviewTab(): string {
    const lastBackupAt = localStorage.getItem(`ock:last-backup:${this.projectId}`);
    const hasBackup = !!lastBackupAt;
    const isStorageNearFull = (this.storageEstimate?.percentUsed || 0) >= 80;

    const organizationSection = this.orgProfile
      ? `
          <div class="overview-section">
            <h2>Organization</h2>
            <dl class="info-list">
              <dt>Name</dt>
              <dd>${this.escapeHtml(this.orgProfile.name)}</dd>
              <dt>Industry</dt>
              <dd>${this.escapeHtml(this.orgProfile.industry || '(Not specified)')}</dd>
              <dt>Frameworks</dt>
              <dd>${
                this.orgProfile.regulatoryFrameworks?.length
                  ? this.escapeHtml(this.orgProfile.regulatoryFrameworks.join(', '))
                  : '(Not specified)'
              }</dd>
            </dl>
          </div>
        `
      : this.showOrganizationForm
        ? `
          <div class="overview-section">
            <h2>Add Organization Profile</h2>
            <form id="organization-form" class="scope-form">
              <div class="form-group">
                <label for="org-name">Organization Name *</label>
                <input
                  id="org-name"
                  name="name"
                  type="text"
                  maxlength="255"
                  placeholder="e.g., Test Company Ltd"
                  required
                />
              </div>
              <div class="form-group">
                <label for="org-description">Description</label>
                <textarea
                  id="org-description"
                  name="description"
                  rows="3"
                  maxlength="1000"
                  placeholder="Brief description of your organization"
                ></textarea>
              </div>
              <div class="form-group">
                <label for="org-industry">Industry</label>
                <input
                  id="org-industry"
                  name="industry"
                  type="text"
                  maxlength="255"
                  placeholder="e.g., SaaS, Healthcare, Manufacturing"
                />
              </div>
              <div class="form-group">
                <label for="org-frameworks">Regulatory Frameworks</label>
                <input
                  id="org-frameworks"
                  name="frameworks"
                  type="text"
                  maxlength="500"
                  placeholder="Comma-separated (e.g., ISO 27001, GDPR, SOC 2)"
                />
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" id="btn-cancel-org">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Organization</button>
              </div>
            </form>
          </div>
        `
        : `
          <div class="overview-section">
            <h2>Organization</h2>
            <p class="text-muted">No organization profile created yet. <a href="#" class="link-primary" id="link-add-org">Add organization</a></p>
          </div>
        `;

    return `
      <div class="tab-pane overview-tab">
        <div class="overview-section">
          <h2>Project Information</h2>
          <dl class="info-list">
            <dt>Name</dt>
            <dd>${this.escapeHtml(this.project?.name || '')}</dd>
            <dt>Description</dt>
            <dd>${this.escapeHtml(this.project?.description || '(Not set)')}</dd>
            <dt>Created</dt>
            <dd>${formatDate(this.project?.createdAt || '')}</dd>
            <dt>Last Updated</dt>
            <dd>${formatDate(this.project?.updatedAt || '')}</dd>
          </dl>
        </div>

        ${organizationSection}

        <div class="overview-section">
          <h2>Backup & Storage</h2>
          ${
            hasBackup
              ? `<p class="text-muted">Last encrypted backup: ${this.escapeHtml(lastBackupAt || '')}</p>`
              : `<p class="text-muted">You have never exported an encrypted backup.</p>`
          }
          ${
            isStorageNearFull
              ? `<p style="color:#b45309;">Storage warning: ${Math.round(this.storageEstimate?.percentUsed || 0)}% of browser storage is used. Create an encrypted backup.</p>`
              : `<p class="text-muted">Storage usage: ${formatBytes(this.storageEstimate?.usage || 0)} / ${formatBytes(this.storageEstimate?.quota || 0)}</p>`
          }
        </div>

        <div class="overview-section">
          <h2>Quick Actions</h2>
          <div class="action-buttons">
            <button class="btn btn-primary" id="btn-download-backup">Download Backup</button>
            <button class="btn btn-secondary" id="btn-export-soa">Export SoA</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render ISMS Scope tab
   */
  private renderScopeTab(): string {
    if (!this.ismScope) {
      return `
        <div class="tab-pane">
          <div class="scope-empty">
            <h2>Define ISMS Scope</h2>
            <p>The ISMS scope defines the organizational boundaries and objectives of your Information Security Management System.</p>
            <form class="scope-form" id="scope-form">
              <div class="form-group">
                <label for="scope-statement">ISMS Scope Statement *</label>
                <textarea
                  id="scope-statement"
                  name="scopeStatement"
                  placeholder="e.g., ACME Corp IT services and infrastructure, all locations"
                  maxlength="2000"
                  rows="4"
                  required
                ></textarea>
                <p class="form-hint">Describe the organizational boundaries, locations, and key business processes in scope.</p>
              </div>

              <div class="form-group">
                <label for="scope-inclusions">Inclusions</label>
                <textarea
                  id="scope-inclusions"
                  name="inclusions"
                  placeholder="One per line. E.g.: Cloud infrastructure, Email systems, Customer databases"
                  rows="3"
                ></textarea>
                <p class="form-hint">What is explicitly included? One item per line.</p>
              </div>

              <div class="form-group">
                <label for="scope-exclusions">Exclusions</label>
                <textarea
                  id="scope-exclusions"
                  name="exclusions"
                  placeholder="One per line. E.g.: Legacy systems, Third-party hosting (separate ISMS)"
                  rows="3"
                ></textarea>
                <p class="form-hint">What is explicitly excluded? One item per line.</p>
              </div>

              <div class="form-actions">
                <button type="submit" class="btn btn-primary">Save Scope</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    return `
      <div class="tab-pane">
        <div class="scope-view">
          <h2>ISMS Scope</h2>
          <div class="scope-info">
            <h3>Scope Statement</h3>
            <p>${this.escapeHtml(this.ismScope.scopeStatement)}</p>

            ${
              this.ismScope.inclusions?.length
                ? `
              <h3>Inclusions</h3>
              <ul>
                ${this.ismScope.inclusions.map((item: string) => `<li>${this.escapeHtml(item)}</li>`).join('')}
              </ul>
            `
                : ''
            }

            ${
              this.ismScope.exclusions?.length
                ? `
              <h3>Exclusions</h3>
              <ul>
                ${this.ismScope.exclusions.map((item: string) => `<li>${this.escapeHtml(item)}</li>`).join('')}
              </ul>
            `
                : ''
            }

            <div class="scope-actions">
              <button class="btn btn-secondary btn-sm" id="btn-edit-scope">Edit Scope</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Assets tab
   */
  private renderAssetsTab(): string {
    const assetsHtml =
      this.assets.length === 0
        ? `
          <div class="empty-state">
            <h3>No assets yet</h3>
            <p>Create your first asset to get started with asset management.</p>
            <button class="btn btn-primary btn-sm" id="btn-new-asset">+ Add Asset</button>
          </div>
        `
        : `
          <div class="list-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Criticality</th>
                  <th>Owner</th>
                  <th>Linked Risks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.assets
                  .map(
                    (asset) => `
                  <tr>
                    <td><strong>${this.escapeHtml(asset.name)}</strong></td>
                    <td>${this.escapeHtml(asset.type)}</td>
                    <td>
                      <span class="badge badge-${asset.criticality}">
                        ${this.escapeHtml(asset.criticality)}
                      </span>
                    </td>
                    <td>${this.escapeHtml(asset.owner || '—')}</td>
                    <td>${asset.linkedRiskIds?.length || 0} risk(s)</td>
                    <td>
                      <button class="btn btn-sm btn-secondary asset-edit" data-asset-id="${asset.id}">Edit</button>
                      <button class="btn btn-sm btn-danger asset-delete" data-asset-id="${asset.id}">Delete</button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top: 20px;">
            <button class="btn btn-primary" id="btn-new-asset">+ Add Asset</button>
          </div>
        `;

    return `
      <div class="tab-pane assets-tab">
        <h2>Assets</h2>
        <p class="text-muted">Manage IT assets and resources in scope for this ISMS project.</p>
        ${assetsHtml}
      </div>
    `;
  }

  /**
   * Render Risks tab
   */
  private renderRisksTab(): string {
    const risksHtml =
      this.risks.length === 0
        ? `
          <div class="empty-state">
            <h3>No risks yet</h3>
            <p>Identify and assess risks to your assets.</p>
            <button class="btn btn-primary btn-sm" id="btn-new-risk">+ Add Risk</button>
          </div>
        `
        : `
          <div class="list-table">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Likelihood</th>
                  <th>Impact</th>
                  <th>Inherent Score</th>
                  <th>Status</th>
                  <th>Treatment</th>
                  <th>Evidence</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.risks
                  .map(
                    (risk) => `
                  <tr>
                    <td><strong>${this.escapeHtml(risk.title)}</strong></td>
                    <td>
                      <span class="badge badge-${risk.likelihood}">
                        ${this.escapeHtml(risk.likelihood)}
                      </span>
                    </td>
                    <td>
                      <span class="badge badge-${risk.impact}">
                        ${this.escapeHtml(risk.impact)}
                      </span>
                    </td>
                    <td>
                      <strong>${risk.inherentScore?.toFixed(1) || '—'}</strong>
                    </td>
                    <td>
                      <span class="badge badge-status ${this.getRiskStatusClass(risk.status)}">
                        ${this.escapeHtml(this.formatEnumLabel(risk.status))}
                      </span>
                    </td>
                    <td>${this.escapeHtml(risk.treatmentOption ? this.formatEnumLabel(risk.treatmentOption) : '—')}</td>
                    <td>${this.renderEvidenceLinkBadge(risk.linkedEvidenceIds?.length || 0)}</td>
                    <td>
                      <button class="btn btn-sm btn-secondary risk-edit" data-risk-id="${risk.id}">Edit</button>
                      <button class="btn btn-sm btn-danger risk-delete" data-risk-id="${risk.id}">Delete</button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top: 20px;">
            <button class="btn btn-primary" id="btn-new-risk">+ Add Risk</button>
          </div>
        `;

    return `
      <div class="tab-pane risks-tab">
        <h2>Risk Register</h2>
        <p class="text-muted">Identify, assess, and manage risks to your information security.</p>
        ${risksHtml}
      </div>
    `;
  }

  /**
   * Render Controls tab
   */
  private renderControlsTab(): string {
    const numberingModeLabel = this.controlIdSettings.mode === 'auto' ? 'Automatic numbering' : 'Manual control IDs';
    const nextIdText = this.nextControlIdSuggestion
      ? `Next suggested ID: ${this.nextControlIdSuggestion}`
      : 'No ID suggestion available yet.';

    const controlsHtml =
      this.controls.length === 0
        ? `
          <div class="empty-state">
            <h3>No controls yet</h3>
            <p>Create your first control to start building your control catalogue.</p>
            <button class="btn btn-primary btn-sm" id="btn-new-control">+ Add Control</button>
          </div>
        `
        : `
          <div class="list-table">
            <table>
              <thead>
                <tr>
                  <th>Control ID</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Frequency</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Linked Risks</th>
                  <th>Linked ISO</th>
                  <th>Evidence</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.controls
                  .map(
                    (control) => `
                  <tr>
                    <td>${this.escapeHtml(control.controlId || '—')}</td>
                    <td><strong>${this.escapeHtml(control.name)}</strong></td>
                    <td>${this.escapeHtml(this.formatEnumLabel(control.controlType))}</td>
                    <td>${this.escapeHtml(this.formatEnumLabel(control.frequency))}</td>
                    <td>
                      <span class="badge badge-status ${this.getControlStatusClass(control.implementationStatus)}">
                        ${this.escapeHtml(this.formatEnumLabel(control.implementationStatus))}
                      </span>
                    </td>
                    <td>${this.escapeHtml(control.owner || '—')}</td>
                    <td>${control.linkedRiskIds?.length || 0} risk(s)</td>
                    <td>${control.linkedRequirementIds?.length || 0} req(s)</td>
                    <td>${this.renderEvidenceLinkBadge(control.linkedEvidenceIds?.length || 0)}</td>
                    <td>
                      <button class="btn btn-sm btn-secondary control-edit" data-control-id="${control.id}">Edit</button>
                      <button class="btn btn-sm btn-danger control-delete" data-control-id="${control.id}">Delete</button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top: 20px;">
            <button class="btn btn-primary" id="btn-new-control">+ Add Control</button>
          </div>
        `;

    return `
      <div class="tab-pane controls-tab">
        <h2>Control Catalogue</h2>
        <p class="text-muted">Define and maintain controls that mitigate your identified risks.</p>
        <p class="form-hint">${this.escapeHtml(numberingModeLabel)}. ${this.escapeHtml(nextIdText)}</p>
        ${controlsHtml}
      </div>
    `;
  }

  /**
   * Render Settings tab
   */
  private renderSettingsTab(): string {
    return `
      <div class="tab-pane settings-tab">
        <div class="settings-section">
          <h2>Control ID Numbering</h2>
          <p class="text-muted">Define how control identifiers are generated and validated for this project.</p>
          <form id="control-id-settings-form" class="scope-form">
            <div class="form-group">
              <label for="control-id-mode">Numbering Mode</label>
              <select id="control-id-mode" name="mode" required>
                <option value="auto" ${this.controlIdSettings.mode === 'auto' ? 'selected' : ''}>Automatic</option>
                <option value="manual" ${this.controlIdSettings.mode === 'manual' ? 'selected' : ''}>Manual</option>
              </select>
              <p class="form-hint">Automatic mode generates sequential IDs. Manual mode requires entering IDs per control.</p>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="control-id-prefix">Prefix</label>
                <input
                  id="control-id-prefix"
                  name="prefix"
                  type="text"
                  maxlength="12"
                  pattern="[A-Za-z0-9]{1,12}"
                  value="${this.escapeHtml(this.controlIdSettings.prefix)}"
                  required
                />
              </div>

              <div class="form-group">
                <label for="control-id-separator">Separator</label>
                <select id="control-id-separator" name="separator" required>
                  <option value="-" ${this.controlIdSettings.separator === '-' ? 'selected' : ''}>Dash (-)</option>
                  <option value="/" ${this.controlIdSettings.separator === '/' ? 'selected' : ''}>Slash (/)</option>
                  <option value="." ${this.controlIdSettings.separator === '.' ? 'selected' : ''}>Dot (.)</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="control-id-padding">Sequence Padding</label>
                <input
                  id="control-id-padding"
                  name="padding"
                  type="number"
                  min="2"
                  max="8"
                  step="1"
                  value="${this.controlIdSettings.padding}"
                  required
                />
              </div>

              <div class="form-group">
                <label for="control-id-next-sequence">Next Sequence</label>
                <input
                  id="control-id-next-sequence"
                  name="nextSequence"
                  type="number"
                  min="1"
                  step="1"
                  value="${this.controlIdSettings.nextSequence}"
                  required
                />
              </div>
            </div>

            <p class="form-hint">Preview: ${this.escapeHtml(this.nextControlIdSuggestion || 'N/A')}</p>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Save Numbering Settings</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  /**
   * Render Evidence tab
   */
  private renderEvidenceTab(): string {
    const documentsHtml =
      this.documents.length === 0
        ? `
          <div class="empty-state">
            <h3>No evidence files yet</h3>
            <p>Upload documents and images that support control operation and audits.</p>
          </div>
        `
        : `
          <div class="list-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>SHA-256</th>
                  <th>Stored With</th>
                  <th>Protection</th>
                  <th>Linked To</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.documents
                  .map(
                    (doc) => `
                  <tr>
                    <td><strong>${this.escapeHtml(doc.name)}</strong></td>
                    <td>${this.escapeHtml(doc.mimeType)}</td>
                    <td>${formatBytes(doc.sizeBytes)}</td>
                    <td><code>${this.escapeHtml(doc.sha256.slice(0, 16))}...</code></td>
                    <td><span class="badge badge-driver badge-driver-${doc.storage.driver}">${this.escapeHtml(this.formatEnumLabel(doc.storage.driver))}</span></td>
                    <td>
                      <span class="badge badge-evidence-security ${doc.crypto?.encrypted === false ? 'status-plain' : 'status-encrypted'}">
                        ${doc.crypto?.encrypted === false ? 'Plain Metadata' : 'Encrypted'}
                      </span>
                    </td>
                    <td>${this.renderEvidenceUsageBadge(doc.id)}</td>
                    <td>
                      <button class="btn btn-sm btn-danger evidence-delete" data-document-id="${doc.id}">Delete</button>
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
      <div class="tab-pane evidence-tab">
        <h2>Evidence Vault</h2>
        <p class="text-muted">Store project evidence files locally in this browser.</p>
        <div class="form-actions" style="margin-bottom: 20px;">
          <input id="evidence-file-input" type="file" multiple style="display: none;" />
          <button class="btn btn-primary" id="btn-upload-evidence">Upload Evidence</button>
        </div>
        ${documentsHtml}
      </div>
    `;
  }

  /**
   * Render Reviews tab
   */
  private renderReviewsTab(): string {
    const reviewsHtml =
      this.reviews.length === 0
        ? `
          <div class="empty-state">
            <h3>No control reviews yet</h3>
            <p>Schedule and execute control reviews to track effectiveness over time.</p>
            <button class="btn btn-primary btn-sm" id="btn-new-review">+ Schedule Review</button>
          </div>
        `
        : `
          <div class="list-table">
            <table>
              <thead>
                <tr>
                  <th>Control</th>
                  <th>Type</th>
                  <th>Scheduled</th>
                  <th>Status</th>
                  <th>Effectiveness</th>
                  <th>Reviewer</th>
                  <th>Evidence</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.reviews
                  .map((review) => {
                    const control = this.controls.find((c) => c.id === review.linkedControlId);
                    const controlName = control
                      ? `${control.controlId || '—'} ${control.name}`
                      : 'Unknown control';

                    return `
                    <tr>
                      <td><strong>${this.escapeHtml(controlName)}</strong></td>
                      <td>${this.escapeHtml(this.formatEnumLabel(review.reviewType))}</td>
                      <td>${this.escapeHtml(review.scheduledDate || '—')}</td>
                      <td><span class="badge badge-status ${this.getReviewStatusClass(review.status)}">${this.escapeHtml(this.formatEnumLabel(review.status))}</span></td>
                      <td>${this.escapeHtml(this.formatEnumLabel(review.effectivenessRating))}</td>
                      <td>${this.escapeHtml(review.reviewer || '—')}</td>
                      <td>${this.renderEvidenceLinkBadge(review.linkedEvidenceIds?.length || 0)}</td>
                      <td>
                        <button class="btn btn-sm btn-secondary review-edit" data-review-id="${review.id}">Edit</button>
                        <button class="btn btn-sm btn-danger review-delete" data-review-id="${review.id}">Delete</button>
                      </td>
                    </tr>
                  `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top: 20px;">
            <button class="btn btn-primary" id="btn-new-review">+ Schedule Review</button>
          </div>
        `;

    return `
      <div class="tab-pane reviews-tab">
        <h2>Control Reviews</h2>
        <p class="text-muted">Schedule and execute reviews to verify control effectiveness and audit readiness.</p>
        ${reviewsHtml}
      </div>
    `;
  }

  private formatEnumLabel(value: string): string {
    return value
      .replace(/_/g, ' ')
      .split(' ')
      .filter((token) => token.length > 0)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');
  }

  private renderEvidenceLinkBadge(count: number): string {
    if (count <= 0) {
      return '<span class="badge badge-evidence-link status-missing">Missing</span>';
    }

    if (count === 1) {
      return '<span class="badge badge-evidence-link status-partial">1 Linked</span>';
    }

    return `<span class="badge badge-evidence-link status-strong">${count} Linked</span>`;
  }

  private renderEvidenceUsageBadge(documentId: string): string {
    const linkedToRisks = this.risks.filter((risk) => risk.linkedEvidenceIds?.includes(documentId)).length;
    const linkedToControls = this.controls.filter((control) => control.linkedEvidenceIds?.includes(documentId)).length;
    const linkedToReviews = this.reviews.filter((review) => review.linkedEvidenceIds?.includes(documentId)).length;
    const usageCount = linkedToRisks + linkedToControls + linkedToReviews;

    return this.renderEvidenceLinkBadge(usageCount);
  }

  private getRiskStatusClass(status: Risk['status']): string {
    switch (status) {
      case 'identified':
        return 'status-identified';
      case 'assessed':
        return 'status-assessed';
      case 'treated':
        return 'status-treated';
      case 'closed':
        return 'status-closed';
      default:
        return 'status-neutral';
    }
  }

  private getControlStatusClass(status: Control['implementationStatus']): string {
    switch (status) {
      case 'not_started':
        return 'status-not-started';
      case 'planned':
        return 'status-planned';
      case 'partially_implemented':
        return 'status-partial';
      case 'implemented':
        return 'status-complete';
      case 'not_applicable':
        return 'status-neutral';
      default:
        return 'status-neutral';
    }
  }

  private getReviewStatusClass(status: ControlReview['status']): string {
    switch (status) {
      case 'scheduled':
        return 'status-planned';
      case 'in_progress':
        return 'status-assessed';
      case 'passed':
        return 'status-complete';
      case 'failed':
        return 'status-failed';
      case 'needs_evidence':
        return 'status-needs-evidence';
      case 'blocked':
        return 'status-blocked';
      case 'not_applicable':
        return 'status-neutral';
      default:
        return 'status-neutral';
    }
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
   * Mount page to DOM and attach event listeners
   */
  async mount(container: HTMLElement): Promise<void> {
    this.container = container;

    // Load project data
    await this.loadProjectData();

    // Render page
    const template = document.createElement('template');
    template.innerHTML = this.renderHTML();
    container.appendChild(template.content.cloneNode(true));

    // Attach event listeners
    this.attachEventListeners(true);

    // Subscribe to store events
    this.unsubscribe = this.projectStore.subscribe((event: any) => {
      if (event.type === 'projectUpdated' && event.payload.projectId === this.projectId) {
        this.loadProjectData();
      }
    });
  }

  /**
   * Load project data from store
   */
  private async loadProjectData(): Promise<void> {
    try {
      this.project = await this.projectStore.getProject(this.projectId);
      this.controlIdSettings = this.project?.controlIdSettings || {
        mode: 'auto',
        prefix: 'CTL',
        separator: '-',
        padding: 3,
        nextSequence: 1,
      };
      this.orgProfile = await this.projectStore.getOrganizationProfile(this.projectId);
      this.ismScope = await this.projectStore.getIsmScope(this.projectId);
      this.assets = await this.projectStore.getAssets(this.projectId);
      this.risks = await this.projectStore.getRisks(this.projectId);
      this.controls = await this.projectStore.getControls(this.projectId);
      this.nextControlIdSuggestion = await this.projectStore.getNextControlIdSuggestion(this.projectId);
      this.documents = await this.projectStore.getDocuments(this.projectId);
      this.reviews = await this.projectStore.getControlReviews(this.projectId);
      this.storageEstimate = await this.projectStore.getStorageEstimate();
    } catch (error) {
      console.error('Failed to load project data:', error);
    }
  }

  /**
   * Attach event listeners to page
   */
  private attachEventListeners(includeStatic = false): void {
    if (!this.container) return;

    if (includeStatic && !this.staticListenersBound) {
      // Back button
      const backBtn = this.container.querySelector('#btn-back');
      backBtn?.addEventListener('click', () => {
        this.options.onBack?.();
      });

      // Tab buttons
      this.container.querySelectorAll('.tab-button').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const tabName = (e.target as HTMLElement).getAttribute('data-tab') as TabName;
          this.switchTab(tabName);
        });
      });

      this.staticListenersBound = true;
    }

    const tabsContent = this.container.querySelector('.tabs-content');
    if (!tabsContent) {
      return;
    }

    // Scope form submission
    const scopeForm = tabsContent.querySelector('#scope-form');
    if (scopeForm) {
      scopeForm.addEventListener('submit', (e) => this.handleScopeSubmit(e));
    }

    // Organization form and actions
    const addOrgLink = tabsContent.querySelector('#link-add-org');
    addOrgLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showOrganizationForm = true;
      this.rerender();
    });

    const organizationForm = tabsContent.querySelector('#organization-form');
    if (organizationForm) {
      organizationForm.addEventListener('submit', (e) => this.handleOrganizationSubmit(e));
    }

    const cancelOrgBtn = tabsContent.querySelector('#btn-cancel-org');
    cancelOrgBtn?.addEventListener('click', () => {
      this.showOrganizationForm = false;
      this.rerender();
    });

    const controlIdSettingsForm = tabsContent.querySelector('#control-id-settings-form');
    if (controlIdSettingsForm) {
      controlIdSettingsForm.addEventListener('submit', (e) => this.handleControlIdSettingsSubmit(e));
    }

    // Edit scope button
    const editScopeBtn = tabsContent.querySelector('#btn-edit-scope');
    editScopeBtn?.addEventListener('click', () => this.switchTab('scope'));

    const downloadBackupBtn = tabsContent.querySelector('#btn-download-backup');
    downloadBackupBtn?.addEventListener('click', () => this.handleDownloadBackup());

    // Asset buttons
    const newAssetBtn = tabsContent.querySelector('#btn-new-asset');
    newAssetBtn?.addEventListener('click', () => this.handleNewAsset());

    tabsContent.querySelectorAll('.asset-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const assetId = (e.target as HTMLElement).getAttribute('data-asset-id');
        if (assetId) this.handleEditAsset(assetId);
      });
    });

    tabsContent.querySelectorAll('.asset-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const assetId = (e.target as HTMLElement).getAttribute('data-asset-id');
        if (assetId) this.handleDeleteAsset(assetId);
      });
    });

    // Risk buttons
    const newRiskBtn = tabsContent.querySelector('#btn-new-risk');
    newRiskBtn?.addEventListener('click', () => this.handleNewRisk());

    tabsContent.querySelectorAll('.risk-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const riskId = (e.target as HTMLElement).getAttribute('data-risk-id');
        if (riskId) this.handleEditRisk(riskId);
      });
    });

    tabsContent.querySelectorAll('.risk-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const riskId = (e.target as HTMLElement).getAttribute('data-risk-id');
        if (riskId) this.handleDeleteRisk(riskId);
      });
    });

    // Control buttons
    const newControlBtn = tabsContent.querySelector('#btn-new-control');
    newControlBtn?.addEventListener('click', () => this.handleNewControl());

    tabsContent.querySelectorAll('.control-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const controlId = (e.target as HTMLElement).getAttribute('data-control-id');
        if (controlId) this.handleEditControl(controlId);
      });
    });

    tabsContent.querySelectorAll('.control-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const controlId = (e.target as HTMLElement).getAttribute('data-control-id');
        if (controlId) this.handleDeleteControl(controlId);
      });
    });

    // Evidence buttons
    const uploadEvidenceBtn = tabsContent.querySelector('#btn-upload-evidence') as HTMLButtonElement | null;
    const evidenceFileInput = tabsContent.querySelector('#evidence-file-input') as HTMLInputElement | null;

    uploadEvidenceBtn?.addEventListener('click', () => {
      evidenceFileInput?.click();
    });

    evidenceFileInput?.addEventListener('change', (e) => this.handleEvidenceUpload(e));

    tabsContent.querySelectorAll('.evidence-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const documentId = (e.target as HTMLElement).getAttribute('data-document-id');
        if (documentId) this.handleDeleteDocument(documentId);
      });
    });

    // Review buttons
    const newReviewBtn = tabsContent.querySelector('#btn-new-review');
    newReviewBtn?.addEventListener('click', () => this.handleNewReview());

    tabsContent.querySelectorAll('.review-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const reviewId = (e.target as HTMLElement).getAttribute('data-review-id');
        if (reviewId) this.handleEditReview(reviewId);
      });
    });

    tabsContent.querySelectorAll('.review-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const reviewId = (e.target as HTMLElement).getAttribute('data-review-id');
        if (reviewId) this.handleDeleteReview(reviewId);
      });
    });
  }

  /**
   * Switch to a different tab
   */
  private switchTab(tabName: TabName): void {
    this.currentTab = tabName;
    this.rerender();
  }

  /**
   * Handle ISMS Scope form submission
   */
  private async handleScopeSubmit(e: Event): Promise<void> {
    e.preventDefault();

    if (!this.container) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const scopeStatement = (formData.get('scopeStatement') as string || '').trim();
    const inclusions = (formData.get('inclusions') as string || '')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const exclusions = (formData.get('exclusions') as string || '')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (!scopeStatement) {
      alert('Scope statement is required');
      return;
    }

    try {
      await this.projectStore.createIsmScope(this.projectId, {
        scopeStatement,
        inclusions: inclusions.length > 0 ? inclusions : undefined,
        exclusions: exclusions.length > 0 ? exclusions : undefined,
      });

      await this.loadProjectData();
      this.rerender();
    } catch (error) {
      console.error('Failed to save scope:', error);
      alert('Failed to save scope');
    }
  }

  /**
   * Handle organization profile form submission
   */
  private async handleOrganizationSubmit(e: Event): Promise<void> {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const name = (formData.get('name') as string || '').trim();
    const description = (formData.get('description') as string || '').trim();
    const industry = (formData.get('industry') as string || '').trim();
    const frameworksRaw = (formData.get('frameworks') as string || '').trim();

    if (!name) {
      alert('Organization name is required');
      return;
    }

    const regulatoryFrameworks = frameworksRaw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    try {
      await this.projectStore.createOrganizationProfile(this.projectId, {
        name,
        description: description || undefined,
        industry: industry || undefined,
        regulatoryFrameworks: regulatoryFrameworks.length > 0 ? regulatoryFrameworks : undefined,
      });

      this.showOrganizationForm = false;
      await this.loadProjectData();
      this.rerender();
    } catch (error) {
      console.error('Failed to save organization profile:', error);
      alert('Failed to save organization profile');
    }
  }

  /**
   * Handle new asset button click
   */
  private handleNewAsset(): void {
    this.assetDialog = new AssetDialog({
      projectStore: this.projectStore,
      projectId: this.projectId,
      onSuccess: () => {
        this.loadProjectData().then(() => this.rerender());
      },
      onCancel: () => {
        this.assetDialog?.unmount();
        this.assetDialog = null;
      },
    });

    if (this.container) {
      this.assetDialog.mount(this.container);
      this.assetDialog.open();
    }
  }

  /**
   * Handle edit asset
   */
  private handleEditAsset(assetId: string): void {
    const asset = this.assets.find((a) => a.id === assetId);
    if (!asset) return;

    this.assetDialog = new AssetDialog({
      projectStore: this.projectStore,
      projectId: this.projectId,
      asset,
      onSuccess: () => {
        this.loadProjectData().then(() => this.rerender());
      },
      onCancel: () => {
        this.assetDialog?.unmount();
        this.assetDialog = null;
      },
    });

    if (this.container) {
      this.assetDialog.mount(this.container);
      this.assetDialog.open();
    }
  }

  /**
   * Handle delete asset
   */
  private async handleDeleteAsset(assetId: string): Promise<void> {
    const asset = this.assets.find((a) => a.id === assetId);
    if (!asset) return;

    if (confirm(`Delete asset "${asset.name}"?`)) {
      try {
        await this.projectStore.deleteAsset(this.projectId, assetId);
        await this.loadProjectData();
        this.rerender();
      } catch (error) {
        console.error('Failed to delete asset:', error);
        alert('Failed to delete asset');
      }
    }
  }

  /**
   * Handle new risk button click
   */
  private handleNewRisk(): void {
    this.riskDialog = new RiskDialog({
      projectStore: this.projectStore,
      projectId: this.projectId,
      documents: this.documents,
      onSuccess: () => {
        this.loadProjectData().then(() => this.rerender());
      },
      onCancel: () => {
        this.riskDialog?.unmount();
        this.riskDialog = null;
      },
    });

    if (this.container) {
      this.riskDialog.mount(this.container);
      this.riskDialog.open();
    }
  }

  /**
   * Handle edit risk
   */
  private handleEditRisk(riskId: string): void {
    const risk = this.risks.find((r) => r.id === riskId);
    if (!risk) return;

    this.riskDialog = new RiskDialog({
      projectStore: this.projectStore,
      projectId: this.projectId,
      risk,
      documents: this.documents,
      onSuccess: () => {
        this.loadProjectData().then(() => this.rerender());
      },
      onCancel: () => {
        this.riskDialog?.unmount();
        this.riskDialog = null;
      },
    });

    if (this.container) {
      this.riskDialog.mount(this.container);
      this.riskDialog.open();
    }
  }

  /**
   * Handle delete risk
   */
  private async handleDeleteRisk(riskId: string): Promise<void> {
    const risk = this.risks.find((r) => r.id === riskId);
    if (!risk) return;

    if (confirm(`Delete risk "${risk.title}"?`)) {
      try {
        await this.projectStore.deleteRisk(this.projectId, riskId);
        await this.loadProjectData();
        this.rerender();
      } catch (error) {
        console.error('Failed to delete risk:', error);
        alert('Failed to delete risk');
      }
    }
  }

  /**
   * Handle new control button click
   */
  private handleNewControl(): void {
    this.controlDialog = new ControlDialog({
      projectStore: this.projectStore,
      projectId: this.projectId,
      risks: this.risks,
      documents: this.documents,
      controlIdSettings: this.controlIdSettings,
      suggestedControlId: this.nextControlIdSuggestion,
      onSuccess: () => {
        this.loadProjectData().then(() => this.rerender());
      },
      onCancel: () => {
        this.controlDialog?.unmount();
        this.controlDialog = null;
      },
    });

    if (this.container) {
      this.controlDialog.mount(this.container);
      this.controlDialog.open();
    }
  }

  /**
   * Handle edit control
   */
  private handleEditControl(controlId: string): void {
    const control = this.controls.find((c) => c.id === controlId);
    if (!control) return;

    this.controlDialog = new ControlDialog({
      projectStore: this.projectStore,
      projectId: this.projectId,
      control,
      risks: this.risks,
      documents: this.documents,
      controlIdSettings: this.controlIdSettings,
      suggestedControlId: this.nextControlIdSuggestion,
      onSuccess: () => {
        this.loadProjectData().then(() => this.rerender());
      },
      onCancel: () => {
        this.controlDialog?.unmount();
        this.controlDialog = null;
      },
    });

    if (this.container) {
      this.controlDialog.mount(this.container);
      this.controlDialog.open();
    }
  }

  /**
   * Handle delete control
   */
  private async handleDeleteControl(controlId: string): Promise<void> {
    const control = this.controls.find((c) => c.id === controlId);
    if (!control) return;

    if (confirm(`Delete control "${control.name}"?`)) {
      try {
        await this.projectStore.deleteControl(this.projectId, controlId);
        await this.loadProjectData();
        this.rerender();
      } catch (error) {
        console.error('Failed to delete control:', error);
        alert('Failed to delete control');
      }
    }
  }

  /**
   * Handle control ID settings form submission
   */
  private async handleControlIdSettingsSubmit(e: Event): Promise<void> {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const mode = (formData.get('mode') as string || 'auto').trim();
    const prefix = (formData.get('prefix') as string || '').trim().toUpperCase();
    const separator = (formData.get('separator') as string || '-').trim();
    const padding = Number.parseInt((formData.get('padding') as string || '3').trim(), 10);
    const nextSequence = Number.parseInt((formData.get('nextSequence') as string || '1').trim(), 10);

    if (mode !== 'auto' && mode !== 'manual') {
      alert('Invalid numbering mode');
      return;
    }

    if (!/^[A-Z0-9]{1,12}$/.test(prefix)) {
      alert('Prefix must be 1-12 alphanumeric characters');
      return;
    }

    if (separator !== '-' && separator !== '/' && separator !== '.') {
      alert('Separator must be -, /, or .');
      return;
    }

    if (!Number.isInteger(padding) || padding < 2 || padding > 8) {
      alert('Padding must be between 2 and 8');
      return;
    }

    if (!Number.isInteger(nextSequence) || nextSequence < 1) {
      alert('Next sequence must be at least 1');
      return;
    }

    try {
      await this.projectStore.updateControlIdSettings(this.projectId, {
        mode,
        prefix,
        separator: separator as ControlIdSettings['separator'],
        padding,
        nextSequence,
      });

      await this.loadProjectData();
      this.rerender();
    } catch (error) {
      console.error('Failed to save control ID settings:', error);
      alert(error instanceof Error ? error.message : 'Failed to save control ID settings');
    }
  }

  /**
   * Handle evidence file upload
   */
  private async handleEvidenceUpload(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];

    if (files.length === 0) {
      return;
    }

    try {
      for (const file of files) {
        await this.projectStore.createDocument(this.projectId, file);
      }

      await this.loadProjectData();
      this.rerender();
    } catch (error) {
      console.error('Failed to upload evidence:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload evidence');
    } finally {
      input.value = '';
    }
  }

  /**
   * Handle evidence delete
   */
  private async handleDeleteDocument(documentId: string): Promise<void> {
    const document = this.documents.find((d) => d.id === documentId);
    if (!document) return;

    if (confirm(`Delete evidence file "${document.name}"?`)) {
      try {
        await this.projectStore.deleteDocument(this.projectId, documentId);
        await this.loadProjectData();
        this.rerender();
      } catch (error) {
        console.error('Failed to delete evidence:', error);
        alert('Failed to delete evidence');
      }
    }
  }

  /**
   * Handle create review
   */
  private handleNewReview(): void {
    if (this.controls.length === 0) {
      alert('Create at least one control before scheduling a review.');
      return;
    }

    this.reviewDialog = new ReviewDialog({
      projectStore: this.projectStore,
      projectId: this.projectId,
      controls: this.controls,
      documents: this.documents,
      onSuccess: () => {
        this.loadProjectData().then(() => this.rerender());
      },
      onCancel: () => {
        this.reviewDialog?.unmount();
        this.reviewDialog = null;
      },
    });

    if (this.container) {
      this.reviewDialog.mount(this.container);
      this.reviewDialog.open();
    }
  }

  /**
   * Handle edit review
   */
  private handleEditReview(reviewId: string): void {
    const review = this.reviews.find((r) => r.id === reviewId);
    if (!review) return;

    this.reviewDialog = new ReviewDialog({
      projectStore: this.projectStore,
      projectId: this.projectId,
      controls: this.controls,
      documents: this.documents,
      review,
      onSuccess: () => {
        this.loadProjectData().then(() => this.rerender());
      },
      onCancel: () => {
        this.reviewDialog?.unmount();
        this.reviewDialog = null;
      },
    });

    if (this.container) {
      this.reviewDialog.mount(this.container);
      this.reviewDialog.open();
    }
  }

  /**
   * Handle delete review
   */
  private async handleDeleteReview(reviewId: string): Promise<void> {
    const review = this.reviews.find((r) => r.id === reviewId);
    if (!review) return;

    if (confirm('Delete this control review?')) {
      try {
        await this.projectStore.deleteControlReview(this.projectId, reviewId);
        await this.loadProjectData();
        this.rerender();
      } catch (error) {
        console.error('Failed to delete review:', error);
        alert('Failed to delete review');
      }
    }
  }

  /**
   * Handle encrypted backup export.
   */
  private async handleDownloadBackup(): Promise<void> {
    this.openBackupDialog();
  }

  private openBackupDialog(): void {
    if (!this.container) {
      return;
    }

    if (this.backupDialogElement) {
      this.backupDialogElement.showModal();
      return;
    }

    const template = document.createElement('template');
    template.innerHTML = `
      <dialog class="backup-dialog" aria-modal="true" aria-labelledby="backup-dialog-title">
        <div class="dialog-content">
          <div class="dialog-header">
            <h2 id="backup-dialog-title">Create Encrypted Backup</h2>
            <button type="button" class="modal-close-btn" id="btn-close-backup" aria-label="Close dialog">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <form id="backup-form">
            <div class="form-group">
              <label for="backup-passphrase">Passphrase *</label>
              <input id="backup-passphrase" name="passphrase" type="password" minlength="8" maxlength="255" required />
            </div>
            <div class="form-group">
              <label for="backup-passphrase-confirm">Confirm Passphrase *</label>
              <input id="backup-passphrase-confirm" name="confirmPassphrase" type="password" minlength="8" maxlength="255" required />
            </div>
            <div class="form-errors" style="display:none;"></div>
            <div class="dialog-actions">
              <button type="button" class="btn btn-secondary" id="btn-cancel-backup">Cancel</button>
              <button type="submit" class="btn btn-primary">Download Backup</button>
            </div>
          </form>
        </div>
      </dialog>
    `;

    this.container.appendChild(template.content.cloneNode(true));
    this.backupDialogElement = this.container.querySelector('.backup-dialog');
    if (!this.backupDialogElement) {
      return;
    }

    const form = this.backupDialogElement.querySelector('#backup-form') as HTMLFormElement;
    const errorDiv = this.backupDialogElement.querySelector('.form-errors') as HTMLElement;
    const cancelBtn = this.backupDialogElement.querySelector('#btn-cancel-backup');
    const closeBtn = this.backupDialogElement.querySelector('#btn-close-backup');
    const passphraseInput = this.backupDialogElement.querySelector('#backup-passphrase') as HTMLInputElement | null;

    cancelBtn?.addEventListener('click', () => {
      this.backupDialogElement?.close();
    });

    closeBtn?.addEventListener('click', () => {
      this.backupDialogElement?.close();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const passphrase = (formData.get('passphrase') as string || '').trim();
      const confirmPassphrase = (formData.get('confirmPassphrase') as string || '').trim();

      errorDiv.textContent = '';
      errorDiv.style.display = 'none';

      if (passphrase.length < 8) {
        errorDiv.textContent = 'Passphrase must be at least 8 characters.';
        errorDiv.style.display = 'block';
        return;
      }

      if (passphrase !== confirmPassphrase) {
        errorDiv.textContent = 'Passphrases do not match.';
        errorDiv.style.display = 'block';
        return;
      }

      try {
        const { blob, fileName } = await this.projectStore.exportProjectBackup(this.projectId, passphrase);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        localStorage.setItem(`ock:last-backup:${this.projectId}`, new Date().toISOString());
        this.backupDialogElement?.close();
        this.rerender();
      } catch (error) {
        console.error('Backup export failed:', error);
        errorDiv.textContent = error instanceof Error ? error.message : 'Failed to export backup';
        errorDiv.style.display = 'block';
      }
    });

    this.backupDialogElement.showModal();
    passphraseInput?.focus();
  }

  /**
   * Re-render the page (after data changes)
   */
  private rerender(): void {
    if (!this.container) return;

    const tabsContent = this.container.querySelector('.tabs-content');
    if (!tabsContent) {
      return;
    }

    tabsContent.innerHTML = this.renderTabContent();
    this.container.querySelectorAll('.tab-button').forEach((btn) => {
      const tabName = btn.getAttribute('data-tab') as TabName | null;
      if (!tabName) return;
      btn.classList.toggle('active', tabName === this.currentTab);
    });

    this.attachEventListeners(false);
  }

  /**
   * Unmount page and cleanup
   */
  unmount(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.assetDialog) {
      this.assetDialog.unmount();
      this.assetDialog = null;
    }

    if (this.riskDialog) {
      this.riskDialog.unmount();
      this.riskDialog = null;
    }

    if (this.controlDialog) {
      this.controlDialog.unmount();
      this.controlDialog = null;
    }

    if (this.reviewDialog) {
      this.reviewDialog.unmount();
      this.reviewDialog = null;
    }

    if (this.backupDialogElement) {
      this.backupDialogElement.remove();
      this.backupDialogElement = null;
    }

    if (this.container) {
      const page = this.container.querySelector('.project-detail-page');
      if (page) {
        page.remove();
      }
      this.container = null;
    }
  }
}
