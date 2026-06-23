/**
 * Project Store
 *
 * Manages project-level state and persistence.
 * Handles project CRUD operations, linking to IndexedDB via storage manager.
 * All project data changes emit events so UI can subscribe and update.
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
  EvidenceLink,
  EvidenceLinkTargetType,
  Policy,
  Finding,
  ActionItem,
} from '../types';
import {
  validateActionItem,
  validateAsset,
  validateControl,
  validateControlReview,
  validateDocumentManifest,
  validateFinding,
  validateIsmScope,
  validateOrganizationProfile,
  validatePolicy,
  validateProject,
  validateRisk,
} from '../schema/validator';
import { generateId } from '../utils/id';
import { ingestFile, isExecutableFile } from '../documents/ingest';
import { calculateInherentRiskScore } from '../utils/risk-scoring';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  exportVaultEncrypted,
  importVaultEncrypted,
} from '../import-export/packageFormat';

// Event emitter for store updates
type ProjectStoreListener = (event: ProjectStoreEvent) => void;

export interface ProjectStoreEvent {
  type: 'projectCreated' | 'projectUpdated' | 'projectDeleted' | 'projectLoaded' | 'projectsLoaded' | 'error';
  payload: any;
}

export class ProjectStore {
  private listeners: Set<ProjectStoreListener> = new Set();
  private projectsCache: Map<string, Project> = new Map();
  private currentProjectId: string | null = null;
  private storageManager: any;

  private static readonly DEFAULT_CONTROL_ID_SETTINGS: ControlIdSettings = {
    mode: 'auto',
    prefix: 'CTL',
    separator: '-',
    padding: 3,
    nextSequence: 1,
  };

  constructor(storageManager: any) {
    this.storageManager = storageManager;
  }

  private quarantineHydrationError(entityType: string, identifier: string | undefined, error: unknown): void {
    this.emit({
      type: 'error',
      payload: {
        message: `Discarded invalid ${entityType}`,
        identifier,
        error,
      },
    });
  }

  private hydrateRecord<T>(entityType: string, value: unknown, validator: (input: unknown) => T, identifier?: string): T | null {
    try {
      return validator(value);
    } catch (error) {
      this.quarantineHydrationError(entityType, identifier, error);
      return null;
    }
  }

  private hydrateRecords<T>(entityType: string, values: unknown[], validator: (input: unknown) => T): T[] {
    const hydrated: T[] = [];

    for (const value of values) {
      const hydratedRecord = this.hydrateRecord(entityType, value, validator);
      if (hydratedRecord) {
        hydrated.push(hydratedRecord);
      }
    }

    return hydrated;
  }

  private normalizeControlIdSettings(input?: Partial<ControlIdSettings>): ControlIdSettings {
    const base = ProjectStore.DEFAULT_CONTROL_ID_SETTINGS;
    const mode = input?.mode === 'manual' || input?.mode === 'auto'
      ? input.mode
      : base.mode;

    const rawPrefix = (input?.prefix ?? base.prefix).trim().toUpperCase();
    const prefix = /^[A-Z0-9]{1,12}$/.test(rawPrefix) ? rawPrefix : base.prefix;

    const rawSeparator = input?.separator ?? base.separator;
    const separator = rawSeparator === '-' || rawSeparator === '/' || rawSeparator === '.'
      ? rawSeparator
      : base.separator;

    const rawPadding = input?.padding ?? base.padding;
    const padding = Number.isInteger(rawPadding) && rawPadding >= 2 && rawPadding <= 8
      ? rawPadding
      : base.padding;

    const rawNextSequence = input?.nextSequence ?? base.nextSequence;
    const nextSequence = Number.isInteger(rawNextSequence) && rawNextSequence >= 1
      ? rawNextSequence
      : base.nextSequence;

    return {
      mode,
      prefix,
      separator,
      padding,
      nextSequence,
    };
  }

  private normalizeControlIdValue(value: string): string {
    return value.trim().toUpperCase();
  }

  private validateControlIdValue(value: string): void {
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,49}$/.test(value)) {
      throw new Error('Control ID may only contain A-Z, 0-9, dot, slash, underscore, and dash (max 50 chars)');
    }
  }

  private formatControlId(settings: ControlIdSettings, sequence: number): string {
    return `${settings.prefix}${settings.separator}${String(sequence).padStart(settings.padding, '0')}`;
  }

  private parseAutoControlSequence(controlId: string, settings: ControlIdSettings): number | null {
    const escapedPrefix = settings.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedSeparator = settings.separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedPrefix}${escapedSeparator}(\\d+)$`, 'i');
    const match = controlId.match(regex);
    if (!match) {
      return null;
    }

    const sequence = Number.parseInt(match[1], 10);
    return Number.isFinite(sequence) && sequence >= 1 ? sequence : null;
  }

  async getControlIdSettings(projectId: string): Promise<ControlIdSettings> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    return this.normalizeControlIdSettings(project.controlIdSettings);
  }

  async updateControlIdSettings(projectId: string, updates: Partial<ControlIdSettings>): Promise<Project> {
    const existing = await this.getProject(projectId);
    if (!existing) {
      throw new Error(`Project ${projectId} not found`);
    }

    const merged = this.normalizeControlIdSettings({
      ...existing.controlIdSettings,
      ...updates,
    });

    return this.updateProject(projectId, {
      controlIdSettings: merged,
    });
  }

  async getNextControlIdSuggestion(projectId: string): Promise<string> {
    const settings = await this.getControlIdSettings(projectId);
    const controls = await this.getControls(projectId);

    const maxExistingSequence = controls.reduce((currentMax, control) => {
      if (!control.controlId) {
        return currentMax;
      }

      const parsed = this.parseAutoControlSequence(control.controlId, settings);
      return parsed && parsed > currentMax ? parsed : currentMax;
    }, 0);

    const used = new Set(
      controls
        .map((control) => control.controlId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => value.toUpperCase())
    );

    let sequence = Math.max(settings.nextSequence, maxExistingSequence + 1);
    let candidate = this.formatControlId(settings, sequence);
    while (used.has(candidate.toUpperCase())) {
      sequence += 1;
      candidate = this.formatControlId(settings, sequence);
    }

    return candidate;
  }

  private async upsertEvidenceLinks(params: {
    projectId: string;
    targetType: EvidenceLinkTargetType;
    targetId: string;
    evidenceIds: string[];
  }): Promise<void> {
    const { projectId, targetType, targetId, evidenceIds } = params;
    const now = new Date().toISOString();

    const normalizedEvidenceIds = Array.from(new Set(
      evidenceIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    ));

    const existingLinks = await this.storageManager.queryRecords('evidenceLinks', {
      projectId,
      targetType,
      targetId,
    }) as EvidenceLink[];

    const existingByEvidenceId = new Map(existingLinks.map((link) => [link.evidenceId, link]));

    for (const evidenceId of normalizedEvidenceIds) {
      const existing = existingByEvidenceId.get(evidenceId);
      if (existing) {
        await this.storageManager.saveRecord('evidenceLinks', {
          ...existing,
          updatedAt: now,
        });
      } else {
        await this.storageManager.saveRecord('evidenceLinks', {
          id: generateId(),
          projectId,
          evidenceId,
          targetType,
          targetId,
          createdAt: now,
          updatedAt: now,
        } as EvidenceLink);
      }
    }

    for (const link of existingLinks) {
      if (!normalizedEvidenceIds.includes(link.evidenceId)) {
        await this.storageManager.deleteRecord('evidenceLinks', link.id);
      }
    }
  }

  private async removeEvidenceLinksForTarget(projectId: string, targetType: EvidenceLinkTargetType, targetId: string): Promise<void> {
    const existingLinks = await this.storageManager.queryRecords('evidenceLinks', {
      projectId,
      targetType,
      targetId,
    }) as EvidenceLink[];

    for (const link of existingLinks) {
      await this.storageManager.deleteRecord('evidenceLinks', link.id);
    }
  }

  async getEvidenceLinksByTarget(projectId: string, targetType: EvidenceLinkTargetType, targetId: string): Promise<EvidenceLink[]> {
    const links = await this.storageManager.queryRecords('evidenceLinks', {
      projectId,
      targetType,
      targetId,
    }) as EvidenceLink[];
    return links;
  }

  async getEvidenceLinksByEvidenceId(projectId: string, evidenceId: string): Promise<EvidenceLink[]> {
    const links = await this.storageManager.queryRecords('evidenceLinks', {
      projectId,
      evidenceId,
    }) as EvidenceLink[];
    return links;
  }

  async linkEvidenceToTarget(projectId: string, targetType: EvidenceLinkTargetType, targetId: string, evidenceId: string): Promise<void> {
    const existing = await this.getEvidenceLinksByTarget(projectId, targetType, targetId);
    const evidenceIds = Array.from(new Set([...existing.map((link) => link.evidenceId), evidenceId]));
    await this.upsertEvidenceLinks({ projectId, targetType, targetId, evidenceIds });
  }

  async unlinkEvidenceFromTarget(projectId: string, targetType: EvidenceLinkTargetType, targetId: string, evidenceId: string): Promise<void> {
    const existing = await this.getEvidenceLinksByTarget(projectId, targetType, targetId);
    const evidenceIds = existing
      .map((link) => link.evidenceId)
      .filter((id) => id !== evidenceId);
    await this.upsertEvidenceLinks({ projectId, targetType, targetId, evidenceIds });
  }

  /**
   * Subscribe to project store events
   */
  subscribe(listener: ProjectStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: ProjectStoreEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  /**
   * Create a new project
   */
  async createProject(input: {
    name: string;
    description?: string;
  }): Promise<Project> {
    try {
      const projectId = generateId();
      const now = new Date().toISOString();

      const project: Project = {
        id: projectId,
        name: input.name,
        description: input.description || '',
        controlIdSettings: this.normalizeControlIdSettings(),
        createdAt: now,
        updatedAt: now,
        storageUsageBytes: 0,
      };

      // Save to IndexedDB
      await this.storageManager.saveRecord('projects', project);
      
      // Cache it
      this.projectsCache.set(projectId, project);
      this.currentProjectId = projectId;

      // Emit event
      this.emit({
        type: 'projectCreated',
        payload: { project },
      });

      return project;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to create project',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get a single project by ID
   */
  async getProject(projectId: string): Promise<Project | null> {
    try {
      // Check cache first
      if (this.projectsCache.has(projectId)) {
        return this.projectsCache.get(projectId) || null;
      }

      // Load from storage
      const project = await this.storageManager.getRecord('projects', projectId);
      if (project) {
        const hydratedProject = this.hydrateRecord('project', project, validateProject, projectId);
        if (!hydratedProject) {
          return null;
        }

        const normalizedProject: Project = {
          ...hydratedProject,
          controlIdSettings: this.normalizeControlIdSettings(hydratedProject.controlIdSettings),
        };

        this.projectsCache.set(projectId, normalizedProject);
        this.currentProjectId = projectId;
        return normalizedProject;
      }

      return null;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load project',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get all projects
   */
  async getAllProjects(): Promise<Project[]> {
    try {
      const rawProjects = await this.storageManager.queryRecords('projects', {});
      const projects = this.hydrateRecords('project', rawProjects, validateProject).map((project) => ({
        ...project,
        controlIdSettings: this.normalizeControlIdSettings(project.controlIdSettings),
      }));
      
      // Populate cache
      projects.forEach((p: Project) => {
        this.projectsCache.set(p.id, p);
      });

      this.emit({
        type: 'projectsLoaded',
        payload: { projects },
      });

      return projects;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load projects',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Update project metadata
   */
  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    try {
      const existing = await this.getProject(projectId);
      if (!existing) {
        throw new Error(`Project ${projectId} not found`);
      }

      const updated: Project = {
        ...existing,
        ...updates,
        controlIdSettings: this.normalizeControlIdSettings({
          ...existing.controlIdSettings,
          ...updates.controlIdSettings,
        }),
        id: existing.id, // Never change ID
        createdAt: existing.createdAt, // Never change creation date
        updatedAt: new Date().toISOString(),
      };

      await this.storageManager.saveRecord('projects', updated);
      this.projectsCache.set(projectId, updated);

      this.emit({
        type: 'projectUpdated',
        payload: { project: updated },
      });

      return updated;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to update project',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Delete a project (and all related data)
   * WARNING: This is destructive and cannot be undone (except via backup restore)
   */
  async deleteProject(projectId: string): Promise<void> {
    try {
      await this.storageManager.deleteRecord('projects', projectId);
      this.projectsCache.delete(projectId);

      if (this.currentProjectId === projectId) {
        this.currentProjectId = null;
      }

      this.emit({
        type: 'projectDeleted',
        payload: { projectId },
      });
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to delete project',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Create organization profile for project
   */
  async createOrganizationProfile(projectId: string, input: {
    name: string;
    description?: string;
    industry?: string;
    regulatoryFrameworks?: string[];
  }): Promise<OrganizationProfile> {
    try {
      const orgId = generateId();

      const orgProfile: OrganizationProfile = {
        id: orgId,
        projectId,
        name: input.name,
        description: input.description || '',
        industry: input.industry,
        regulatoryFrameworks: input.regulatoryFrameworks || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.storageManager.saveRecord('organizationProfiles', orgProfile);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'organizationCreated' },
      });

      return orgProfile;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to create organization profile',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get organization profile for project
   */
  async getOrganizationProfile(projectId: string): Promise<OrganizationProfile | null> {
    try {
      const orgs = await this.storageManager.queryRecords('organizationProfiles', {
        projectId,
      });
      const hydrated = this.hydrateRecords('organization profile', orgs, validateOrganizationProfile);
      return hydrated.length > 0 ? hydrated[0] : null;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load organization profile',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Create ISMS scope for project
   */
  async createIsmScope(projectId: string, input: {
    scopeStatement: string;
    inclusions?: string[];
    exclusions?: string[];
    locations?: string[];
    businessUnits?: string[];
  }): Promise<ISmsScope> {
    try {
      const scopeId = generateId();
      const now = new Date().toISOString();

      const scope: ISmsScope = {
        id: scopeId,
        projectId,
        scopeStatement: input.scopeStatement,
        inclusions: input.inclusions || [],
        exclusions: input.exclusions || [],
        locations: input.locations || [],
        businessUnits: input.businessUnits || [],
        createdAt: now,
        updatedAt: now,
      };

      await this.storageManager.saveRecord('ismScopes', scope);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'scopeCreated' },
      });

      return scope;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to create ISMS scope',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get ISMS scope for project
   */
  async getIsmScope(projectId: string): Promise<ISmsScope | null> {
    try {
      const scopes = await this.storageManager.queryRecords('ismScopes', {
        projectId,
      });
      const hydrated = this.hydrateRecords('ISMS scope', scopes, validateIsmScope);
      return hydrated.length > 0 ? hydrated[0] : null;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load ISMS scope',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get current project ID
   */
  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  /**
   * Set current project ID
   */
  setCurrentProjectId(projectId: string | null): void {
    this.currentProjectId = projectId;
  }

  /**
   * Clear all in-memory caches (for testing)
   */
  clearCache(): void {
    this.projectsCache.clear();
    this.currentProjectId = null;
  }

  /**
   * Create a new asset
   */
  async createAsset(projectId: string, input: {
    name: string;
    description?: string;
    type: Asset['type'];
    criticality: Asset['criticality'];
    owner?: string;
    location?: string;
  }): Promise<Asset> {
    try {
      const assetId = generateId();
      const now = new Date().toISOString();

      const asset: Asset = {
        id: assetId,
        projectId,
        name: input.name,
        description: input.description,
        type: input.type,
        criticality: input.criticality,
        owner: input.owner,
        location: input.location,
        linkedRiskIds: [],
        createdAt: now,
        updatedAt: now,
      };

      await this.storageManager.saveRecord('assets', asset);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'assetCreated', assetId },
      });

      return asset;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to create asset',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get a single asset by ID
   */
  async getAsset(projectId: string, assetId: string): Promise<Asset | null> {
    try {
      const asset = await this.storageManager.getRecord('assets', assetId);
      if (asset && asset.projectId === projectId) {
        return asset;
      }
      return null;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load asset',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get all assets for a project
   */
  async getAssets(projectId: string): Promise<Asset[]> {
    try {
      const assets = await this.storageManager.queryRecords('assets', { projectId });
      return this.hydrateRecords('asset', assets, validateAsset);
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load assets',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Update an asset
   */
  async updateAsset(projectId: string, assetId: string, updates: Partial<Asset>): Promise<Asset> {
    try {
      const existing = await this.getAsset(projectId, assetId);
      if (!existing) {
        throw new Error(`Asset ${assetId} not found`);
      }

      const updated: Asset = {
        ...existing,
        ...updates,
        id: existing.id,
        projectId: existing.projectId,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };

      await this.storageManager.saveRecord('assets', updated);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'assetUpdated', assetId },
      });

      return updated;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to update asset',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Delete an asset
   */
  async deleteAsset(projectId: string, assetId: string): Promise<void> {
    try {
      await this.storageManager.deleteRecord('assets', assetId);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'assetDeleted', assetId },
      });
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to delete asset',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Create a new risk
   */
  async createRisk(projectId: string, input: {
    title: string;
    description?: string;
    threat?: string;
    vulnerability?: string;
    likelihood: Risk['likelihood'];
    impact: Risk['impact'];
    linkedAssetIds?: string[];
    linkedEvidenceIds?: string[];
    status?: Risk['status'];
    treatmentOption?: Risk['treatmentOption'];
  }): Promise<Risk> {
    try {
      const riskId = generateId();
      const now = new Date().toISOString();

      // Calculate inherent score on a normalized 1-25 matrix.
      const inherentScore = calculateInherentRiskScore(input.likelihood, input.impact);

      const risk: Risk = {
        id: riskId,
        projectId,
        title: input.title,
        description: input.description,
        threat: input.threat,
        vulnerability: input.vulnerability,
        likelihood: input.likelihood,
        impact: input.impact,
        inherentScore,
        residualScore: inherentScore, // Initially same as inherent
        status: input.status || 'identified',
        linkedAssetIds: input.linkedAssetIds || [],
        linkedControlIds: [],
        linkedEvidenceIds: input.linkedEvidenceIds || [],
        treatmentOption: input.treatmentOption,
        createdAt: now,
        updatedAt: now,
      };

      await this.storageManager.saveRecord('risks', risk);
      await this.upsertEvidenceLinks({
        projectId,
        targetType: 'risk',
        targetId: risk.id,
        evidenceIds: risk.linkedEvidenceIds || [],
      });

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'riskCreated', riskId },
      });

      return risk;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to create risk',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get a single risk by ID
   */
  async getRisk(projectId: string, riskId: string): Promise<Risk | null> {
    try {
      const risk = await this.storageManager.getRecord('risks', riskId);
      if (risk && risk.projectId === projectId) {
        return risk;
      }
      return null;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load risk',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get all risks for a project
   */
  async getRisks(projectId: string): Promise<Risk[]> {
    try {
      const risks = await this.storageManager.queryRecords('risks', { projectId });
      return this.hydrateRecords('risk', risks, validateRisk);
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load risks',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Update a risk
   */
  async updateRisk(projectId: string, riskId: string, updates: Partial<Risk>): Promise<Risk> {
    try {
      const existing = await this.getRisk(projectId, riskId);
      if (!existing) {
        throw new Error(`Risk ${riskId} not found`);
      }

      // Recalculate score if likelihood or impact changed
      let inherentScore = existing.inherentScore;
      if (updates.likelihood || updates.impact) {
        const likelihood = updates.likelihood || existing.likelihood;
        const impact = updates.impact || existing.impact;
        inherentScore = calculateInherentRiskScore(likelihood, impact);
      }

      const updated: Risk = {
        ...existing,
        ...updates,
        id: existing.id,
        projectId: existing.projectId,
        createdAt: existing.createdAt,
        inherentScore,
        linkedEvidenceIds: updates.linkedEvidenceIds ?? existing.linkedEvidenceIds ?? [],
        updatedAt: new Date().toISOString(),
      };

      await this.storageManager.saveRecord('risks', updated);
      await this.upsertEvidenceLinks({
        projectId,
        targetType: 'risk',
        targetId: updated.id,
        evidenceIds: updated.linkedEvidenceIds || [],
      });

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'riskUpdated', riskId },
      });

      return updated;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to update risk',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Delete a risk
   */
  async deleteRisk(projectId: string, riskId: string): Promise<void> {
    try {
      await this.storageManager.deleteRecord('risks', riskId);
      await this.removeEvidenceLinksForTarget(projectId, 'risk', riskId);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'riskDeleted', riskId },
      });
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to delete risk',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Create a document manifest and store binary content.
   */
  async createDocument(projectId: string, file: File): Promise<DocumentManifest> {
    try {
      if (isExecutableFile(file.name)) {
        throw new Error('Executable files are not allowed');
      }

      const ingested = await ingestFile(file);
      const documentId = generateId();
      const now = new Date().toISOString();

      const storedRef = await this.storageManager.writeBinaryFile({
        projectId,
        documentId,
        bytes: file,
        metadata: {
          name: ingested.safeName,
          mimeType: ingested.mimeType,
          sizeBytes: ingested.sizeBytes,
          sha256: ingested.sha256,
        },
      });

      const document: DocumentManifest = {
        id: documentId,
        projectId,
        name: ingested.safeName,
        mimeType: ingested.mimeType,
        sizeBytes: ingested.sizeBytes,
        sha256: ingested.sha256,
        storage: {
          driver: storedRef.driver,
          ref: storedRef.ref,
        },
        crypto: {
          encrypted: false,
        },
        createdAt: now,
        updatedAt: now,
      };

      await this.storageManager.saveRecord('evidence', document);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'documentCreated', documentId },
      });

      return document;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to upload document',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get all document manifests for a project.
   */
  async getDocuments(projectId: string): Promise<DocumentManifest[]> {
    try {
      const documents = await this.storageManager.queryRecords('evidence', { projectId });
      return this.hydrateRecords('document', documents, validateDocumentManifest);
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load documents',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Delete document manifest and binary content.
   */
  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    try {
      const document = await this.storageManager.getRecord('evidence', documentId) as DocumentManifest | null;
      if (!document || document.projectId !== projectId) {
        throw new Error(`Document ${documentId} not found`);
      }

      const links = await this.getEvidenceLinksByEvidenceId(projectId, documentId);
      for (const link of links) {
        await this.storageManager.deleteRecord('evidenceLinks', link.id);
      }

      const controls = await this.getControls(projectId);
      for (const control of controls) {
        const nextEvidenceIds = (control.linkedEvidenceIds || []).filter((id) => id !== documentId);
        if (nextEvidenceIds.length !== (control.linkedEvidenceIds || []).length) {
          await this.updateControl(projectId, control.id, {
            linkedEvidenceIds: nextEvidenceIds,
          });
        }
      }

      const risks = await this.getRisks(projectId);
      for (const risk of risks) {
        const nextEvidenceIds = (risk.linkedEvidenceIds || []).filter((id) => id !== documentId);
        if (nextEvidenceIds.length !== (risk.linkedEvidenceIds || []).length) {
          await this.updateRisk(projectId, risk.id, {
            linkedEvidenceIds: nextEvidenceIds,
          });
        }
      }

      const reviews = await this.getControlReviews(projectId);
      for (const review of reviews) {
        const nextEvidenceIds = (review.linkedEvidenceIds || []).filter((id) => id !== documentId);
        if (nextEvidenceIds.length !== (review.linkedEvidenceIds || []).length) {
          await this.updateControlReview(projectId, review.id, {
            linkedEvidenceIds: nextEvidenceIds,
          });
        }
      }

      await this.storageManager.deleteBinaryFile({
        projectId: document.projectId,
        documentId: document.id,
        driver: document.storage.driver,
        ref: document.storage.ref,
      });

      await this.storageManager.deleteRecord('evidence', documentId);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'documentDeleted', documentId },
      });
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to delete document',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Create a new control
   */
  async createControl(projectId: string, input: {
    controlId?: string;
    name: string;
    objective: string;
    description?: string;
    frequency: Control['frequency'];
    controlType: Control['controlType'];
    owner?: string;
    testMethod: string;
    implementationStatus: Control['implementationStatus'];
    linkedRiskIds?: string[];
    linkedRequirementIds?: string[];
    linkedEvidenceIds?: string[];
  }): Promise<Control> {
    try {
      const internalId = generateId();
      const now = new Date().toISOString();
      const settings = await this.getControlIdSettings(projectId);
      const controls = await this.getControls(projectId);

      const usedControlIds = new Set(
        controls
          .map((control) => control.controlId)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
          .map((value) => value.toUpperCase())
      );

      let finalControlId: string | undefined;
      const suppliedControlId = input.controlId?.trim();
      if (suppliedControlId) {
        finalControlId = this.normalizeControlIdValue(suppliedControlId);
        this.validateControlIdValue(finalControlId);
      } else if (settings.mode === 'auto') {
        finalControlId = await this.getNextControlIdSuggestion(projectId);
      }

      if (finalControlId && usedControlIds.has(finalControlId.toUpperCase())) {
        throw new Error(`Control ID "${finalControlId}" already exists in this project`);
      }

      const control: Control = {
        id: internalId,
        projectId,
        controlId: finalControlId,
        name: input.name,
        objective: input.objective,
        description: input.description,
        frequency: input.frequency,
        controlType: input.controlType,
        owner: input.owner,
        testMethod: input.testMethod,
        linkedRiskIds: input.linkedRiskIds || [],
        linkedRequirementIds: input.linkedRequirementIds || [],
        linkedEvidenceIds: input.linkedEvidenceIds || [],
        implementationStatus: input.implementationStatus,
        effectivenessRating: 'not_tested',
        createdAt: now,
        updatedAt: now,
      };

      await this.storageManager.saveRecord('controls', control);
      await this.upsertEvidenceLinks({
        projectId,
        targetType: 'control',
        targetId: control.id,
        evidenceIds: control.linkedEvidenceIds || [],
      });

      if (finalControlId && settings.mode === 'auto') {
        const sequence = this.parseAutoControlSequence(finalControlId, settings);
        if (sequence) {
          await this.updateControlIdSettings(projectId, {
            nextSequence: sequence + 1,
          });
        }
      }

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'controlCreated', controlId: internalId },
      });

      return control;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to create control',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get a single control by ID
   */
  async getControl(projectId: string, controlId: string): Promise<Control | null> {
    try {
      const control = await this.storageManager.getRecord('controls', controlId);
      if (control && control.projectId === projectId) {
        return control;
      }
      return null;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load control',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get all controls for a project
   */
  async getControls(projectId: string): Promise<Control[]> {
    try {
      const controls = await this.storageManager.queryRecords('controls', { projectId });
      return this.hydrateRecords('control', controls, validateControl);
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load controls',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Update a control
   */
  async updateControl(projectId: string, controlId: string, updates: Partial<Control>): Promise<Control> {
    try {
      const existing = await this.getControl(projectId, controlId);
      if (!existing) {
        throw new Error(`Control ${controlId} not found`);
      }

      let normalizedControlId = existing.controlId;
      if (Object.prototype.hasOwnProperty.call(updates, 'controlId')) {
        if (typeof updates.controlId === 'string') {
          const trimmed = updates.controlId.trim();
          normalizedControlId = trimmed.length > 0 ? this.normalizeControlIdValue(trimmed) : undefined;
        } else {
          normalizedControlId = undefined;
        }
      }

      if (typeof normalizedControlId === 'string') {
        this.validateControlIdValue(normalizedControlId);
        const controls = await this.getControls(projectId);
        const duplicate = controls.find(
          (control) =>
            control.id !== existing.id
            && typeof control.controlId === 'string'
            && control.controlId.toUpperCase() === normalizedControlId.toUpperCase()
        );

        if (duplicate) {
          throw new Error(`Control ID "${normalizedControlId}" already exists in this project`);
        }
      }

      const updated: Control = {
        ...existing,
        ...updates,
        controlId: normalizedControlId,
        linkedEvidenceIds: updates.linkedEvidenceIds ?? existing.linkedEvidenceIds ?? [],
        id: existing.id,
        projectId: existing.projectId,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };

      await this.storageManager.saveRecord('controls', updated);
      await this.upsertEvidenceLinks({
        projectId,
        targetType: 'control',
        targetId: updated.id,
        evidenceIds: updated.linkedEvidenceIds || [],
      });

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'controlUpdated', controlId },
      });

      return updated;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to update control',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Delete a control
   */
  async deleteControl(projectId: string, controlId: string): Promise<void> {
    try {
      await this.storageManager.deleteRecord('controls', controlId);
      await this.removeEvidenceLinksForTarget(projectId, 'control', controlId);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'controlDeleted', controlId },
      });
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to delete control',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Create a new control review.
   */
  async createControlReview(projectId: string, input: {
    linkedControlId: string;
    reviewType: ControlReview['reviewType'];
    scheduledDate?: string;
    actualDate?: string;
    reviewer?: string;
    status: ControlReview['status'];
    testPlan?: string;
    linkedEvidenceIds?: string[];
    testResult?: string;
    effectivenessRating: ControlReview['effectivenessRating'];
    observations?: string;
    nextReviewScheduledDate?: string;
    notes?: string;
  }): Promise<ControlReview> {
    try {
      const linkedControl = await this.getControl(projectId, input.linkedControlId);
      if (!linkedControl) {
        throw new Error('Linked control does not exist');
      }

      const reviewId = generateId();
      const now = new Date().toISOString();

      const review: ControlReview = {
        id: reviewId,
        projectId,
        linkedControlId: input.linkedControlId,
        reviewType: input.reviewType,
        scheduledDate: input.scheduledDate,
        actualDate: input.actualDate,
        reviewer: input.reviewer,
        status: input.status,
        testPlan: input.testPlan,
        linkedEvidenceIds: input.linkedEvidenceIds || [],
        testResult: input.testResult,
        effectivenessRating: input.effectivenessRating,
        observations: input.observations,
        nextReviewScheduledDate: input.nextReviewScheduledDate,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };

      await this.storageManager.saveRecord('reviews', review);
      await this.upsertEvidenceLinks({
        projectId,
        targetType: 'review',
        targetId: review.id,
        evidenceIds: review.linkedEvidenceIds || [],
      });
      await this.syncControlFromReview(projectId, review);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'controlReviewCreated', reviewId },
      });

      return review;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to create control review',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Get all control reviews for a project.
   */
  async getControlReviews(projectId: string): Promise<ControlReview[]> {
    try {
      const reviews = await this.storageManager.queryRecords('reviews', { projectId });
      return this.hydrateRecords('control review', reviews, validateControlReview);
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to load control reviews',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Update a control review.
   */
  async updateControlReview(projectId: string, reviewId: string, updates: Partial<ControlReview>): Promise<ControlReview> {
    try {
      const existing = await this.storageManager.getRecord('reviews', reviewId) as ControlReview | null;
      if (!existing || existing.projectId !== projectId) {
        throw new Error(`Control review ${reviewId} not found`);
      }

      const updated: ControlReview = {
        ...existing,
        ...updates,
        linkedEvidenceIds: updates.linkedEvidenceIds ?? existing.linkedEvidenceIds ?? [],
        id: existing.id,
        projectId: existing.projectId,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };

      const linkedControl = await this.getControl(projectId, updated.linkedControlId);
      if (!linkedControl) {
        throw new Error('Linked control does not exist');
      }

      await this.storageManager.saveRecord('reviews', updated);
      await this.upsertEvidenceLinks({
        projectId,
        targetType: 'review',
        targetId: updated.id,
        evidenceIds: updated.linkedEvidenceIds || [],
      });
      await this.syncControlFromReview(projectId, updated);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'controlReviewUpdated', reviewId },
      });

      return updated;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to update control review',
          error,
        },
      });
      throw error;
    }
  }

  /**
   * Delete a control review.
   */
  async deleteControlReview(projectId: string, reviewId: string): Promise<void> {
    try {
      const existing = await this.storageManager.getRecord('reviews', reviewId) as ControlReview | null;
      if (!existing || existing.projectId !== projectId) {
        throw new Error(`Control review ${reviewId} not found`);
      }

      await this.storageManager.deleteRecord('reviews', reviewId);
      await this.removeEvidenceLinksForTarget(projectId, 'review', reviewId);

      this.emit({
        type: 'projectUpdated',
        payload: { projectId, type: 'controlReviewDeleted', reviewId },
      });
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: 'Failed to delete control review',
          error,
        },
      });
      throw error;
    }
  }

  async createPolicy(projectId: string, input: {
    policyId?: string;
    title: string;
    description?: string;
    status?: Policy['status'];
    linkedEvidenceIds?: string[];
  }): Promise<Policy> {
    const now = new Date().toISOString();
    const policy: Policy = {
      id: generateId(),
      projectId,
      policyId: input.policyId,
      title: input.title,
      description: input.description,
      status: input.status || 'draft',
      linkedEvidenceIds: input.linkedEvidenceIds || [],
      createdAt: now,
      updatedAt: now,
    };

    await this.storageManager.saveRecord('policies', policy);
    await this.upsertEvidenceLinks({
      projectId,
      targetType: 'policy',
      targetId: policy.id,
      evidenceIds: policy.linkedEvidenceIds || [],
    });

    return policy;
  }

  async getPolicies(projectId: string): Promise<Policy[]> {
    const policies = await this.storageManager.queryRecords('policies', { projectId });
    return this.hydrateRecords('policy', policies, validatePolicy);
  }

  async updatePolicy(projectId: string, policyId: string, updates: Partial<Policy>): Promise<Policy> {
    const existing = await this.storageManager.getRecord('policies', policyId) as Policy | null;
    if (!existing || existing.projectId !== projectId) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const updated: Policy = {
      ...existing,
      ...updates,
      id: existing.id,
      projectId: existing.projectId,
      createdAt: existing.createdAt,
      linkedEvidenceIds: updates.linkedEvidenceIds ?? existing.linkedEvidenceIds ?? [],
      updatedAt: new Date().toISOString(),
    };

    await this.storageManager.saveRecord('policies', updated);
    await this.upsertEvidenceLinks({
      projectId,
      targetType: 'policy',
      targetId: updated.id,
      evidenceIds: updated.linkedEvidenceIds || [],
    });

    return updated;
  }

  async deletePolicy(projectId: string, policyId: string): Promise<void> {
    await this.storageManager.deleteRecord('policies', policyId);
    await this.removeEvidenceLinksForTarget(projectId, 'policy', policyId);
  }

  async createFinding(projectId: string, input: {
    title: string;
    description?: string;
    severity: Finding['severity'];
    status?: Finding['status'];
    linkedEvidenceIds?: string[];
  }): Promise<Finding> {
    const now = new Date().toISOString();
    const finding: Finding = {
      id: generateId(),
      projectId,
      title: input.title,
      description: input.description,
      severity: input.severity,
      status: input.status || 'open',
      linkedEvidenceIds: input.linkedEvidenceIds || [],
      createdAt: now,
      updatedAt: now,
    };

    await this.storageManager.saveRecord('findings', finding);
    await this.upsertEvidenceLinks({
      projectId,
      targetType: 'finding',
      targetId: finding.id,
      evidenceIds: finding.linkedEvidenceIds || [],
    });

    return finding;
  }

  async getFindings(projectId: string): Promise<Finding[]> {
    const findings = await this.storageManager.queryRecords('findings', { projectId });
    return this.hydrateRecords('finding', findings, validateFinding);
  }

  async updateFinding(projectId: string, findingId: string, updates: Partial<Finding>): Promise<Finding> {
    const existing = await this.storageManager.getRecord('findings', findingId) as Finding | null;
    if (!existing || existing.projectId !== projectId) {
      throw new Error(`Finding ${findingId} not found`);
    }

    const updated: Finding = {
      ...existing,
      ...updates,
      id: existing.id,
      projectId: existing.projectId,
      createdAt: existing.createdAt,
      linkedEvidenceIds: updates.linkedEvidenceIds ?? existing.linkedEvidenceIds ?? [],
      updatedAt: new Date().toISOString(),
    };

    await this.storageManager.saveRecord('findings', updated);
    await this.upsertEvidenceLinks({
      projectId,
      targetType: 'finding',
      targetId: updated.id,
      evidenceIds: updated.linkedEvidenceIds || [],
    });

    return updated;
  }

  async deleteFinding(projectId: string, findingId: string): Promise<void> {
    await this.storageManager.deleteRecord('findings', findingId);
    await this.removeEvidenceLinksForTarget(projectId, 'finding', findingId);
  }

  async createAction(projectId: string, input: {
    title: string;
    description?: string;
    status?: ActionItem['status'];
    owner?: string;
    dueDate?: string;
    linkedEvidenceIds?: string[];
  }): Promise<ActionItem> {
    const now = new Date().toISOString();
    const action: ActionItem = {
      id: generateId(),
      projectId,
      title: input.title,
      description: input.description,
      status: input.status || 'open',
      owner: input.owner,
      dueDate: input.dueDate,
      linkedEvidenceIds: input.linkedEvidenceIds || [],
      createdAt: now,
      updatedAt: now,
    };

    await this.storageManager.saveRecord('actions', action);
    await this.upsertEvidenceLinks({
      projectId,
      targetType: 'action',
      targetId: action.id,
      evidenceIds: action.linkedEvidenceIds || [],
    });

    return action;
  }

  async getActions(projectId: string): Promise<ActionItem[]> {
    const actions = await this.storageManager.queryRecords('actions', { projectId });
    return this.hydrateRecords('action item', actions, validateActionItem);
  }

  async updateAction(projectId: string, actionId: string, updates: Partial<ActionItem>): Promise<ActionItem> {
    const existing = await this.storageManager.getRecord('actions', actionId) as ActionItem | null;
    if (!existing || existing.projectId !== projectId) {
      throw new Error(`Action ${actionId} not found`);
    }

    const updated: ActionItem = {
      ...existing,
      ...updates,
      id: existing.id,
      projectId: existing.projectId,
      createdAt: existing.createdAt,
      linkedEvidenceIds: updates.linkedEvidenceIds ?? existing.linkedEvidenceIds ?? [],
      updatedAt: new Date().toISOString(),
    };

    await this.storageManager.saveRecord('actions', updated);
    await this.upsertEvidenceLinks({
      projectId,
      targetType: 'action',
      targetId: updated.id,
      evidenceIds: updated.linkedEvidenceIds || [],
    });

    return updated;
  }

  async deleteAction(projectId: string, actionId: string): Promise<void> {
    await this.storageManager.deleteRecord('actions', actionId);
    await this.removeEvidenceLinksForTarget(projectId, 'action', actionId);
  }

  async setRequirementEvidenceLinks(projectId: string, requirementId: string, evidenceIds: string[]): Promise<void> {
    await this.upsertEvidenceLinks({
      projectId,
      targetType: 'requirement',
      targetId: requirementId,
      evidenceIds,
    });
  }

  async getRequirementEvidenceLinks(projectId: string, requirementId: string): Promise<EvidenceLink[]> {
    return this.getEvidenceLinksByTarget(projectId, 'requirement', requirementId);
  }

  private async syncControlFromReview(projectId: string, review: ControlReview): Promise<void> {
    const control = await this.getControl(projectId, review.linkedControlId);
    if (!control) {
      return;
    }

    const shouldUpdateReviewOutcome = review.status === 'passed' || review.status === 'failed' || review.status === 'in_progress';
    if (!shouldUpdateReviewOutcome) {
      return;
    }

    await this.updateControl(projectId, control.id, {
      effectivenessRating: review.effectivenessRating,
      lastReviewDate: review.actualDate || new Date().toISOString(),
      lastReviewResult: review.testResult || review.status,
      nextReviewDate: review.nextReviewScheduledDate,
    });
  }

  async exportProjectBackup(projectId: string, passphrase: string): Promise<{ blob: Blob; fileName: string }> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const organizationProfile = await this.getOrganizationProfile(projectId);
    const ismScope = await this.getIsmScope(projectId);
    const assets = await this.getAssets(projectId);
    const risks = await this.getRisks(projectId);
    const controls = await this.getControls(projectId);
    const reviews = await this.getControlReviews(projectId);
    const policies = await this.getPolicies(projectId);
    const findings = await this.getFindings(projectId);
    const actions = await this.getActions(projectId);
    const evidenceLinks = await this.storageManager.queryRecords('evidenceLinks', { projectId }) as EvidenceLink[];
    const documents = await this.getDocuments(projectId);

    const binariesByDocumentId: Record<string, string> = {};
    for (const doc of documents) {
      const blob = await this.storageManager.readBinaryFile({
        projectId: doc.projectId,
        documentId: doc.id,
        driver: doc.storage.driver,
        ref: doc.storage.ref,
      });
      const buffer = await blob.arrayBuffer();
      binariesByDocumentId[doc.id] = arrayBufferToBase64(buffer);
    }

    const blob = await exportVaultEncrypted(
      {
        project,
        organizationProfile,
        ismScope,
        assets,
        risks,
        controls,
        reviews,
        policies,
        findings,
        actions,
        evidenceLinks,
        documents,
        binariesByDocumentId,
      },
      passphrase
    );

    const safeName = (project.name || 'project')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .slice(0, 80)
      .toLowerCase();

    return {
      blob,
      fileName: `${safeName || 'project'}.localvault`,
    };
  }

  async importProjectBackup(file: File, passphrase: string): Promise<Project> {
    const payload = await importVaultEncrypted(file, passphrase);
    const now = new Date().toISOString();

    const existing = await this.getProject(payload.project.id);
    const needsDuplicateHandling = !!existing;

    const projectId = needsDuplicateHandling ? generateId() : payload.project.id;
    const idMap = new Map<string, string>();

    const mapId = (oldId: string): string => {
      if (!idMap.has(oldId)) {
        idMap.set(oldId, generateId());
      }
      return idMap.get(oldId)!;
    };

    const importedProject: Project = {
      ...payload.project,
      id: projectId,
      name: needsDuplicateHandling ? `${payload.project.name} (Imported)` : payload.project.name,
      updatedAt: now,
    };
    await this.storageManager.saveRecord('projects', importedProject);
    this.projectsCache.set(importedProject.id, importedProject);

    if (payload.organizationProfile) {
      await this.storageManager.saveRecord('organizationProfiles', {
        ...payload.organizationProfile,
        id: mapId(payload.organizationProfile.id),
        projectId,
        updatedAt: now,
      });
    }

    if (payload.ismScope) {
      await this.storageManager.saveRecord('ismScopes', {
        ...payload.ismScope,
        id: mapId(payload.ismScope.id),
        projectId,
        updatedAt: now,
      });
    }

    for (const asset of payload.assets) {
      await this.storageManager.saveRecord('assets', {
        ...asset,
        id: mapId(asset.id),
        projectId,
        linkedRiskIds: (asset.linkedRiskIds || []).map((riskId: string) => mapId(riskId)),
        updatedAt: now,
      });
    }

    for (const risk of payload.risks) {
      await this.storageManager.saveRecord('risks', {
        ...risk,
        id: mapId(risk.id),
        projectId,
        linkedAssetIds: (risk.linkedAssetIds || []).map((assetId: string) => mapId(assetId)),
        linkedControlIds: (risk.linkedControlIds || []).map((controlId: string) => mapId(controlId)),
        linkedEvidenceIds: (risk.linkedEvidenceIds || []).map((documentId: string) => mapId(documentId)),
        updatedAt: now,
      });
    }

    for (const control of payload.controls) {
      await this.storageManager.saveRecord('controls', {
        ...control,
        id: mapId(control.id),
        projectId,
        linkedRiskIds: (control.linkedRiskIds || []).map((riskId: string) => mapId(riskId)),
        linkedEvidenceIds: (control.linkedEvidenceIds || []).map((documentId: string) => mapId(documentId)),
        updatedAt: now,
      });
    }

    for (const review of payload.reviews) {
      await this.storageManager.saveRecord('reviews', {
        ...review,
        id: mapId(review.id),
        projectId,
        linkedControlId: mapId(review.linkedControlId),
        linkedEvidenceIds: (review.linkedEvidenceIds || []).map((documentId: string) => mapId(documentId)),
        updatedAt: now,
      });
    }

    for (const policy of payload.policies || []) {
      await this.storageManager.saveRecord('policies', {
        ...policy,
        id: mapId(policy.id),
        projectId,
        linkedEvidenceIds: (policy.linkedEvidenceIds || []).map((documentId: string) => mapId(documentId)),
        updatedAt: now,
      });
    }

    for (const finding of payload.findings || []) {
      await this.storageManager.saveRecord('findings', {
        ...finding,
        id: mapId(finding.id),
        projectId,
        linkedEvidenceIds: (finding.linkedEvidenceIds || []).map((documentId: string) => mapId(documentId)),
        updatedAt: now,
      });
    }

    for (const action of payload.actions || []) {
      await this.storageManager.saveRecord('actions', {
        ...action,
        id: mapId(action.id),
        projectId,
        linkedEvidenceIds: (action.linkedEvidenceIds || []).map((documentId: string) => mapId(documentId)),
        updatedAt: now,
      });
    }

    for (const document of payload.documents) {
      const newDocumentId = mapId(document.id);
      const base64Bytes = payload.binariesByDocumentId[document.id];
      if (!base64Bytes) {
        continue;
      }

      const restoredBytes = base64ToArrayBuffer(base64Bytes);
      const storedRef = await this.storageManager.writeBinaryFile({
        projectId,
        documentId: newDocumentId,
        bytes: restoredBytes,
      });

      await this.storageManager.saveRecord('evidence', {
        ...document,
        id: newDocumentId,
        projectId,
        storage: {
          driver: storedRef.driver,
          ref: storedRef.ref,
        },
        updatedAt: now,
      });
    }

    for (const link of payload.evidenceLinks || []) {
      const mappedTargetId = (() => {
        if (link.targetType === 'requirement') {
          return link.targetId;
        }

        return mapId(link.targetId);
      })();

      await this.storageManager.saveRecord('evidenceLinks', {
        ...link,
        id: mapId(link.id),
        projectId,
        evidenceId: mapId(link.evidenceId),
        targetId: mappedTargetId,
        updatedAt: now,
      });
    }

    this.currentProjectId = importedProject.id;
    this.emit({
      type: 'projectCreated',
      payload: { project: importedProject },
    });

    return importedProject;
  }

  async getStorageEstimate(): Promise<{ usage: number; quota: number; percentUsed: number }> {
    const estimate = await this.storageManager.estimateQuota();
    const percentUsed = estimate.quota > 0 ? (estimate.usage / estimate.quota) * 100 : 0;
    return {
      usage: estimate.usage,
      quota: estimate.quota,
      percentUsed,
    };
  }
}
