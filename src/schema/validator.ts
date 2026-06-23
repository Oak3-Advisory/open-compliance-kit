/**
 * Schema validation and sanitization layer.
 * Validates all data from IndexedDB, imports, and user input.
 */

import type {
  ActionItem,
  Asset,
  Control,
  ControlIdSettings,
  ControlReview,
  CryptoEnvelope,
  DocumentManifest,
  EvidenceLink,
  ExportPackage,
  Finding,
  ISmsScope,
  OrganizationProfile,
  Policy,
  Project,
  ProjectSummary,
  Risk,
  StoredBinaryRef,
} from '../types';

/**
 * Validation error.
 */
export class ValidationError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const SAFE_PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;
const MIME_TYPE_PATTERN = /^[a-z]+\/[a-z0-9+.-]+$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/=]+$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_MAX_ARRAY_LENGTH = 1000;
const DEFAULT_MAX_STRING_LENGTH = 4096;
const MAX_PROJECT_NAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SHORT_TEXT_LENGTH = 255;

    function isPlainObject(value: unknown): value is Record<string, unknown> {
      if (!value || typeof value !== 'object') {
        return false;
      }

      const prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    }

    function assertPlainObject(value: unknown, field: string): Record<string, unknown> {
      if (!isPlainObject(value)) {
        throw new ValidationError(`Expected ${field} to be an object`, field);
      }

      return value;
    }

    function sanitizeDeepInternal(value: unknown, depth: number, maxDepth: number, maxArrayLength: number): unknown {
      if (value === null || typeof value !== 'object') {
        return value;
      }

      if (depth >= maxDepth) {
        throw new ValidationError('Exceeded maximum nesting depth');
      }

      if (Array.isArray(value)) {
        if (value.length > maxArrayLength) {
          throw new ValidationError('Array exceeds maximum length');
        }

        return value.map((item) => sanitizeDeepInternal(item, depth + 1, maxDepth, maxArrayLength));
      }

      const record = assertPlainObject(value, 'object');
      const clean: Record<string, unknown> = {};

      for (const key of Object.keys(record)) {
        if (DANGEROUS_KEYS.has(key)) {
          throw new ValidationError(`Prototype pollution attempt detected: ${key}`, key);
        }

        clean[key] = sanitizeDeepInternal(record[key], depth + 1, maxDepth, maxArrayLength);
      }

      return clean;
    }

    /**
     * Recursive sanitizer that rejects dangerous keys and returns a clean copy.
     */
    export function sanitizeObject<T>(obj: T, options?: { maxDepth?: number; maxArrayLength?: number }): T {
      return sanitizeDeepInternal(
        obj,
        0,
        options?.maxDepth ?? DEFAULT_MAX_DEPTH,
        options?.maxArrayLength ?? DEFAULT_MAX_ARRAY_LENGTH,
      ) as T;
    }

    /**
     * Validate that an object only contains allowed keys.
     */
    export function validateAllowedKeys(
      obj: Record<string, unknown>,
      allowedKeys: readonly string[],
      field = 'object'
    ): void {
      const allowed = new Set(allowedKeys);
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) {
          throw new ValidationError(`Unexpected field "${key}" in ${field}`, key);
        }
      }
    }

    export function validateString(
      value: unknown,
      field: string,
      maxLength = DEFAULT_MAX_STRING_LENGTH,
      minLength = 1,
    ): string {
      if (typeof value !== 'string') {
        throw new ValidationError(`Expected ${field} to be a string`, field);
      }

      const trimmed = value.trim();
      if (trimmed.length < minLength) {
        throw new ValidationError(`${field} is required`, field);
      }

      if (trimmed.length > maxLength) {
        throw new ValidationError(`${field} is too long`, field);
      }

      return trimmed;
    }

    export function validateOptionalString(value: unknown, field: string, maxLength = DEFAULT_MAX_STRING_LENGTH): string | undefined {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      return validateString(value, field, maxLength, 0);
    }

    export function validateBoolean(value: unknown, field: string): boolean {
      if (typeof value !== 'boolean') {
        throw new ValidationError(`Expected ${field} to be boolean`, field);
      }

      return value;
    }

    export function validateEnum<T extends string>(value: unknown, field: string, allowedValues: readonly T[]): T {
      if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
        throw new ValidationError(`Invalid ${field}`, field);
      }

      return value as T;
    }

    export function validateSafeId(value: unknown, field = 'id'): string {
      const id = validateString(value, field, 128);
      if (!SAFE_ID_PATTERN.test(id)) {
        throw new ValidationError(`Invalid ${field}`, field);
      }

      return id;
    }

    export function validateUUID(value: unknown): asserts value is string {
      validateSafeId(value, 'id');
    }

    export function validateIsoDate(value: unknown, field: string): string {
      const date = validateString(value, field, 64);
      if (!ISO_DATE_PATTERN.test(date)) {
        throw new ValidationError(`Invalid ${field}`, field);
      }

      if (!Number.isFinite(Date.parse(date))) {
        throw new ValidationError(`Invalid ${field}`, field);
      }

      return date;
    }

    export function validateStringArray(
      value: unknown,
      field: string,
      maxItemLength = DEFAULT_MAX_STRING_LENGTH,
      maxLength = DEFAULT_MAX_ARRAY_LENGTH,
    ): string[] {
      if (value === undefined || value === null) {
        return [];
      }

      if (!Array.isArray(value)) {
        throw new ValidationError(`Expected ${field} to be an array`, field);
      }

      if (value.length > maxLength) {
        throw new ValidationError(`${field} exceeds maximum length`, field);
      }

      return value.map((item, index) => validateString(item, `${field}[${index}]`, maxItemLength));
    }

    export function validateNonNegativeInteger(value: unknown, field: string, maxValue = Number.MAX_SAFE_INTEGER): number {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maxValue) {
        throw new ValidationError(`Invalid ${field}`, field);
      }

      return value;
    }

    export function validateMimeType(value: unknown): asserts value is string {
      if (typeof value !== 'string') {
        throw new ValidationError('Expected string MIME type', 'mimeType');
      }

      const trimmed = value.trim();
      if (!MIME_TYPE_PATTERN.test(trimmed)) {
        throw new ValidationError('Invalid MIME type', 'mimeType');
      }
    }

    export function validateFileSize(
      sizeBytes: unknown,
      maxBytes: number = 500 * 1024 * 1024
    ): asserts sizeBytes is number {
      if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
        throw new ValidationError('Invalid file size', 'sizeBytes');
      }

      if (sizeBytes > maxBytes) {
        throw new ValidationError(`File exceeds maximum size of ${maxBytes} bytes`, 'sizeBytes');
      }
    }

    export function validateControlIdSettings(value: unknown): ControlIdSettings {
      const record = value === undefined || value === null ? {} : assertPlainObject(value, 'controlIdSettings');
      validateAllowedKeys(record, ['mode', 'prefix', 'separator', 'padding', 'nextSequence'], 'controlIdSettings');

      const mode = record.mode === 'manual' || record.mode === 'auto' ? record.mode : 'auto';
      const rawPrefix = typeof record.prefix === 'string' ? record.prefix.trim().toUpperCase() : 'CTL';
      const prefix = SAFE_ID_PATTERN.test(rawPrefix) ? rawPrefix : 'CTL';
      const separator = record.separator === '-' || record.separator === '/' || record.separator === '.' ? record.separator : '-';
      const padding = typeof record.padding === 'number' && Number.isInteger(record.padding) && record.padding >= 2 && record.padding <= 8
        ? record.padding
        : 3;
      const nextSequence = typeof record.nextSequence === 'number' && Number.isInteger(record.nextSequence) && record.nextSequence >= 1
        ? record.nextSequence
        : 1;

      return { mode, prefix, separator, padding, nextSequence };
    }

    function validateRequiredIds(value: unknown, field: string): string[] {
      return validateStringArray(value, field, 128);
    }

    function validateOptionalDate(value: unknown, field: string): string | undefined {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      return validateIsoDate(value, field);
    }

    export function validateStorageRef(value: unknown): string {
      const ref = validateString(value, 'ref', 512);

      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref)) {
        throw new ValidationError('Invalid storage reference', 'ref');
      }

      if (ref.startsWith('/') || ref.startsWith('\\') || ref.includes('\\')) {
        throw new ValidationError('Invalid storage reference', 'ref');
      }

      const lowered = ref.toLowerCase();
      if (lowered.includes('%2e%2e') || lowered.includes('..')) {
        throw new ValidationError('Invalid storage reference', 'ref');
      }

      const segments = ref.split('/');
      if (segments.length === 0 || segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
        throw new ValidationError('Invalid storage reference', 'ref');
      }

      for (const segment of segments) {
        if (!SAFE_PATH_SEGMENT_PATTERN.test(segment)) {
          throw new ValidationError('Invalid storage reference', 'ref');
        }
      }

      return ref;
    }

    export function buildStorageRef(params: { driver: StoredBinaryRef['driver']; projectId: string; documentId: string }): string {
      const projectId = validateSafeId(params.projectId, 'projectId');
      const documentId = validateSafeId(params.documentId, 'documentId');

      return params.driver === 'opfs' ? `${projectId}/${documentId}.bin` : `${projectId}/${documentId}`;
    }

    export function validateStoredBinaryRef(value: unknown): StoredBinaryRef {
      const record = assertPlainObject(value, 'storedBinaryRef');
      validateAllowedKeys(record, ['projectId', 'documentId', 'driver', 'ref'], 'storedBinaryRef');

      const driver = validateEnum(record.driver, 'driver', ['opfs', 'indexeddb-blob', 'external-folder']);
      const projectId = validateSafeId(record.projectId, 'projectId');
      const documentId = validateSafeId(record.documentId, 'documentId');
      const ref = validateStorageRef(record.ref);

      return { projectId, documentId, driver, ref };
    }

    export function validateStorageObject(value: unknown, projectId: string, documentId: string): DocumentManifest['storage'] {
      const record = assertPlainObject(value, 'storage');
      validateAllowedKeys(record, ['driver', 'ref', 'chunkSizeBytes'], 'storage');

      const driver = validateEnum(record.driver, 'driver', ['opfs', 'indexeddb-blob', 'external-folder']);
      validateStorageRef(record.ref);
      const expectedRef = buildStorageRef({ driver, projectId, documentId });

      const chunkSizeBytes = record.chunkSizeBytes === undefined
        ? undefined
        : validateNonNegativeInteger(record.chunkSizeBytes, 'chunkSizeBytes', 1024 * 1024 * 1024);

      return chunkSizeBytes === undefined ? { driver, ref: expectedRef } : { driver, ref: expectedRef, chunkSizeBytes };
    }

    function validateCryptoEnvelope(value: unknown): CryptoEnvelope {
      const record = assertPlainObject(value, 'crypto');
      validateAllowedKeys(record, ['version', 'cipher', 'kdf', 'salt', 'iv', 'iterations', 'ciphertext'], 'crypto');

      return {
        version: validateNonNegativeInteger(record.version, 'version', 100),
        cipher: validateEnum(record.cipher, 'cipher', ['AES-GCM']),
        kdf: validateEnum(record.kdf, 'kdf', ['PBKDF2-SHA256']),
        salt: validateString(record.salt, 'salt', 512),
        iv: validateString(record.iv, 'iv', 512),
        iterations: validateNonNegativeInteger(record.iterations, 'iterations', 10_000_000),
        ciphertext: validateString(record.ciphertext, 'ciphertext', 50 * 1024 * 1024),
      };
    }

    export function validateProjectSummary(value: unknown): ProjectSummary {
      const record = assertPlainObject(value, 'projectSummary');
      validateAllowedKeys(record, ['id', 'name', 'updatedAt', 'documentCount'], 'projectSummary');

      return {
        id: validateSafeId(record.id, 'id'),
        name: validateString(record.name, 'name', MAX_PROJECT_NAME_LENGTH),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
        documentCount: validateNonNegativeInteger(record.documentCount, 'documentCount', DEFAULT_MAX_ARRAY_LENGTH),
      };
    }

    export function validateProject(value: unknown): Project {
      const record = assertPlainObject(value, 'project');
      validateAllowedKeys(record, ['id', 'name', 'description', 'controlIdSettings', 'storageUsageBytes', 'createdAt', 'updatedAt'], 'project');

      return {
        id: validateSafeId(record.id, 'id'),
        name: validateString(record.name, 'name', MAX_PROJECT_NAME_LENGTH),
        description: validateOptionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
        controlIdSettings: record.controlIdSettings === undefined ? undefined : validateControlIdSettings(record.controlIdSettings),
        storageUsageBytes: validateNonNegativeInteger(record.storageUsageBytes, 'storageUsageBytes', 10 * 1024 * 1024 * 1024),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validateOrganizationProfile(value: unknown): OrganizationProfile {
      const record = assertPlainObject(value, 'organizationProfile');
      validateAllowedKeys(record, ['id', 'projectId', 'name', 'description', 'industry', 'regulatoryFrameworks', 'createdAt', 'updatedAt'], 'organizationProfile');

      return {
        id: validateSafeId(record.id, 'id'),
        projectId: validateSafeId(record.projectId, 'projectId'),
        name: validateString(record.name, 'name', MAX_PROJECT_NAME_LENGTH),
        description: validateOptionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
        industry: validateOptionalString(record.industry, 'industry', MAX_SHORT_TEXT_LENGTH),
        regulatoryFrameworks: validateStringArray(record.regulatoryFrameworks, 'regulatoryFrameworks', MAX_SHORT_TEXT_LENGTH),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validateIsmScope(value: unknown): ISmsScope {
      const record = assertPlainObject(value, 'ismScope');
      validateAllowedKeys(record, ['id', 'projectId', 'scopeStatement', 'inclusions', 'exclusions', 'locations', 'businessUnits', 'createdAt', 'updatedAt'], 'ismScope');

      return {
        id: validateSafeId(record.id, 'id'),
        projectId: validateSafeId(record.projectId, 'projectId'),
        scopeStatement: validateString(record.scopeStatement, 'scopeStatement', MAX_DESCRIPTION_LENGTH),
        inclusions: validateStringArray(record.inclusions, 'inclusions', MAX_DESCRIPTION_LENGTH),
        exclusions: validateStringArray(record.exclusions, 'exclusions', MAX_DESCRIPTION_LENGTH),
        locations: validateStringArray(record.locations, 'locations', MAX_DESCRIPTION_LENGTH),
        businessUnits: validateStringArray(record.businessUnits, 'businessUnits', MAX_DESCRIPTION_LENGTH),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validateAsset(value: unknown): Asset {
      const record = assertPlainObject(value, 'asset');
      validateAllowedKeys(record, ['id', 'projectId', 'name', 'description', 'type', 'criticality', 'owner', 'location', 'linkedRiskIds', 'createdAt', 'updatedAt'], 'asset');

      return {
        id: validateSafeId(record.id, 'id'),
        projectId: validateSafeId(record.projectId, 'projectId'),
        name: validateString(record.name, 'name', MAX_PROJECT_NAME_LENGTH),
        description: validateOptionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
        type: validateEnum(record.type, 'type', ['application', 'infrastructure', 'data', 'process', 'people', 'other']),
        criticality: validateEnum(record.criticality, 'criticality', ['low', 'medium', 'high', 'critical']),
        owner: validateOptionalString(record.owner, 'owner', MAX_SHORT_TEXT_LENGTH),
        location: validateOptionalString(record.location, 'location', MAX_SHORT_TEXT_LENGTH),
        linkedRiskIds: validateRequiredIds(record.linkedRiskIds, 'linkedRiskIds'),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validateRisk(value: unknown): Risk {
      const record = assertPlainObject(value, 'risk');
      validateAllowedKeys(record, ['id', 'projectId', 'title', 'description', 'linkedAssetIds', 'threat', 'vulnerability', 'likelihood', 'impact', 'inherentScore', 'residualScore', 'status', 'linkedControlIds', 'linkedEvidenceIds', 'treatmentOption', 'createdAt', 'updatedAt'], 'risk');

      return {
        id: validateSafeId(record.id, 'id'),
        projectId: validateSafeId(record.projectId, 'projectId'),
        title: validateString(record.title, 'title', MAX_PROJECT_NAME_LENGTH),
        description: validateOptionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
        linkedAssetIds: validateStringArray(record.linkedAssetIds, 'linkedAssetIds', 128),
        threat: validateOptionalString(record.threat, 'threat', MAX_SHORT_TEXT_LENGTH),
        vulnerability: validateOptionalString(record.vulnerability, 'vulnerability', MAX_SHORT_TEXT_LENGTH),
        likelihood: validateEnum(record.likelihood, 'likelihood', ['low', 'medium', 'high', 'critical']),
        impact: validateEnum(record.impact, 'impact', ['low', 'medium', 'high', 'critical']),
        inherentScore: record.inherentScore === undefined ? undefined : validateNonNegativeInteger(record.inherentScore, 'inherentScore', 25),
        residualScore: record.residualScore === undefined ? undefined : validateNonNegativeInteger(record.residualScore, 'residualScore', 25),
        status: validateEnum(record.status, 'status', ['identified', 'assessed', 'treated', 'closed']),
        linkedControlIds: validateStringArray(record.linkedControlIds, 'linkedControlIds', 128),
        linkedEvidenceIds: validateStringArray(record.linkedEvidenceIds, 'linkedEvidenceIds', 128),
        treatmentOption: record.treatmentOption === undefined ? undefined : validateEnum(record.treatmentOption, 'treatmentOption', ['mitigate', 'accept', 'avoid', 'transfer'] as const),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validateControl(value: unknown): Control {
      const record = assertPlainObject(value, 'control');
      validateAllowedKeys(record, ['id', 'projectId', 'controlId', 'name', 'objective', 'description', 'frequency', 'controlType', 'owner', 'testMethod', 'linkedRiskIds', 'linkedRequirementIds', 'linkedEvidenceIds', 'implementationStatus', 'reviewSchedule', 'nextReviewDate', 'effectivenessRating', 'lastReviewDate', 'lastReviewResult', 'notes', 'createdAt', 'updatedAt'], 'control');

      return {
        id: validateSafeId(record.id, 'id'),
        projectId: validateSafeId(record.projectId, 'projectId'),
        controlId: validateOptionalString(record.controlId, 'controlId', 128),
        name: validateString(record.name, 'name', MAX_PROJECT_NAME_LENGTH),
        objective: validateString(record.objective, 'objective', MAX_DESCRIPTION_LENGTH),
        description: validateOptionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
        frequency: validateEnum(record.frequency, 'frequency', ['manual', 'daily', 'weekly', 'monthly', 'quarterly', 'annually', 'as_needed']),
        controlType: validateEnum(record.controlType, 'controlType', ['preventive', 'detective', 'corrective']),
        owner: validateOptionalString(record.owner, 'owner', MAX_SHORT_TEXT_LENGTH),
        testMethod: validateString(record.testMethod, 'testMethod', MAX_DESCRIPTION_LENGTH),
        linkedRiskIds: validateStringArray(record.linkedRiskIds, 'linkedRiskIds', 128),
        linkedRequirementIds: validateStringArray(record.linkedRequirementIds, 'linkedRequirementIds', 128),
        linkedEvidenceIds: validateStringArray(record.linkedEvidenceIds, 'linkedEvidenceIds', 128),
        implementationStatus: validateEnum(record.implementationStatus, 'implementationStatus', ['not_started', 'planned', 'implemented', 'partially_implemented', 'not_applicable']),
        reviewSchedule: record.reviewSchedule === undefined ? undefined : validateEnum(record.reviewSchedule, 'reviewSchedule', ['monthly', 'quarterly', 'semi_annually', 'annually'] as const),
        nextReviewDate: validateOptionalDate(record.nextReviewDate, 'nextReviewDate'),
        effectivenessRating: record.effectivenessRating === undefined ? undefined : validateEnum(record.effectivenessRating, 'effectivenessRating', ['not_tested', 'ineffective', 'partially_effective', 'effective'] as const),
        lastReviewDate: validateOptionalDate(record.lastReviewDate, 'lastReviewDate'),
        lastReviewResult: validateOptionalString(record.lastReviewResult, 'lastReviewResult', MAX_DESCRIPTION_LENGTH),
        notes: validateOptionalString(record.notes, 'notes', MAX_DESCRIPTION_LENGTH),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validateControlReview(value: unknown): ControlReview {
      const record = assertPlainObject(value, 'controlReview');
      validateAllowedKeys(record, ['id', 'projectId', 'linkedControlId', 'reviewType', 'scheduledDate', 'actualDate', 'reviewer', 'status', 'testPlan', 'linkedEvidenceIds', 'testResult', 'effectivenessRating', 'observations', 'nextReviewScheduledDate', 'approvedBy', 'notes', 'createdAt', 'updatedAt'], 'controlReview');

      return {
        id: validateSafeId(record.id, 'id'),
        projectId: validateSafeId(record.projectId, 'projectId'),
        linkedControlId: validateSafeId(record.linkedControlId, 'linkedControlId'),
        reviewType: validateEnum(record.reviewType, 'reviewType', ['design_review', 'operational_test', 'compliance_review']),
        scheduledDate: validateOptionalDate(record.scheduledDate, 'scheduledDate'),
        actualDate: validateOptionalDate(record.actualDate, 'actualDate'),
        reviewer: validateOptionalString(record.reviewer, 'reviewer', MAX_SHORT_TEXT_LENGTH),
        status: validateEnum(record.status, 'status', ['scheduled', 'in_progress', 'passed', 'failed', 'needs_evidence', 'not_applicable', 'blocked']),
        testPlan: validateOptionalString(record.testPlan, 'testPlan', MAX_DESCRIPTION_LENGTH),
        linkedEvidenceIds: validateStringArray(record.linkedEvidenceIds, 'linkedEvidenceIds', 128),
        testResult: validateOptionalString(record.testResult, 'testResult', MAX_DESCRIPTION_LENGTH),
        effectivenessRating: validateEnum(record.effectivenessRating, 'effectivenessRating', ['not_tested', 'ineffective', 'partially_effective', 'effective']),
        observations: validateOptionalString(record.observations, 'observations', MAX_DESCRIPTION_LENGTH),
        nextReviewScheduledDate: validateOptionalDate(record.nextReviewScheduledDate, 'nextReviewScheduledDate'),
        approvedBy: validateOptionalString(record.approvedBy, 'approvedBy', MAX_SHORT_TEXT_LENGTH),
        notes: validateOptionalString(record.notes, 'notes', MAX_DESCRIPTION_LENGTH),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validatePolicy(value: unknown): Policy {
      const record = assertPlainObject(value, 'policy');
      validateAllowedKeys(record, ['id', 'projectId', 'policyId', 'title', 'description', 'status', 'linkedEvidenceIds', 'createdAt', 'updatedAt'], 'policy');

      return {
        id: validateSafeId(record.id, 'id'),
        projectId: validateSafeId(record.projectId, 'projectId'),
        policyId: validateOptionalString(record.policyId, 'policyId', MAX_SHORT_TEXT_LENGTH),
        title: validateString(record.title, 'title', MAX_PROJECT_NAME_LENGTH),
        description: validateOptionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
        status: validateEnum(record.status, 'status', ['draft', 'active', 'retired']),
        linkedEvidenceIds: validateStringArray(record.linkedEvidenceIds, 'linkedEvidenceIds', 128),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validateFinding(value: unknown): Finding {
      const record = assertPlainObject(value, 'finding');
      validateAllowedKeys(record, ['id', 'projectId', 'title', 'description', 'severity', 'status', 'linkedEvidenceIds', 'createdAt', 'updatedAt'], 'finding');

      return {
        id: validateSafeId(record.id, 'id'),
        projectId: validateSafeId(record.projectId, 'projectId'),
        title: validateString(record.title, 'title', MAX_PROJECT_NAME_LENGTH),
        description: validateOptionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
        severity: validateEnum(record.severity, 'severity', ['low', 'medium', 'high', 'critical']),
        status: validateEnum(record.status, 'status', ['open', 'in_progress', 'resolved', 'closed']),
        linkedEvidenceIds: validateStringArray(record.linkedEvidenceIds, 'linkedEvidenceIds', 128),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validateActionItem(value: unknown): ActionItem {
      const record = assertPlainObject(value, 'actionItem');
      validateAllowedKeys(record, ['id', 'projectId', 'title', 'description', 'status', 'owner', 'dueDate', 'linkedEvidenceIds', 'createdAt', 'updatedAt'], 'actionItem');

      return {
        id: validateSafeId(record.id, 'id'),
        projectId: validateSafeId(record.projectId, 'projectId'),
        title: validateString(record.title, 'title', MAX_PROJECT_NAME_LENGTH),
        description: validateOptionalString(record.description, 'description', MAX_DESCRIPTION_LENGTH),
        status: validateEnum(record.status, 'status', ['open', 'in_progress', 'completed', 'blocked']),
        owner: validateOptionalString(record.owner, 'owner', MAX_SHORT_TEXT_LENGTH),
        dueDate: validateOptionalDate(record.dueDate, 'dueDate'),
        linkedEvidenceIds: validateStringArray(record.linkedEvidenceIds, 'linkedEvidenceIds', 128),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validateEvidenceLink(value: unknown): EvidenceLink {
      const record = assertPlainObject(value, 'evidenceLink');
      validateAllowedKeys(record, ['id', 'projectId', 'evidenceId', 'targetType', 'targetId', 'createdAt', 'updatedAt'], 'evidenceLink');

      return {
        id: validateSafeId(record.id, 'id'),
        projectId: validateSafeId(record.projectId, 'projectId'),
        evidenceId: validateSafeId(record.evidenceId, 'evidenceId'),
        targetType: validateEnum(record.targetType, 'targetType', ['control', 'risk', 'review', 'policy', 'finding', 'action', 'requirement']),
        targetId: validateSafeId(record.targetId, 'targetId'),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    function validateSha256(value: unknown): string {
      const hash = validateString(value, 'sha256', 64);
      if (!/^[a-f0-9]{64}$/i.test(hash)) {
        throw new ValidationError('Invalid sha256', 'sha256');
      }

      return hash;
    }

    function validateMimeTypeValue(value: unknown): string {
      const mimeType = validateString(value, 'mimeType', 255);
      validateMimeType(mimeType);
      return mimeType;
    }

    function validateDocumentCrypto(value: unknown): NonNullable<DocumentManifest['crypto']> {
      const record = assertPlainObject(value, 'crypto');
      validateAllowedKeys(record, ['encrypted', 'version', 'cipher', 'kdf', 'salt', 'iterations', 'iv', 'chunking'], 'crypto');

      return {
        encrypted: validateBoolean(record.encrypted, 'encrypted'),
        version: record.version === undefined ? undefined : validateNonNegativeInteger(record.version, 'version', 100),
        cipher: record.cipher === undefined ? undefined : validateEnum(record.cipher, 'cipher', ['AES-GCM'] as const),
        kdf: record.kdf === undefined ? undefined : validateEnum(record.kdf, 'kdf', ['PBKDF2-SHA256'] as const),
        salt: validateOptionalString(record.salt, 'salt', 512),
        iterations: record.iterations === undefined ? undefined : validateNonNegativeInteger(record.iterations, 'iterations', 10_000_000),
        iv: validateOptionalString(record.iv, 'iv', 512),
        chunking: record.chunking === undefined ? undefined : validateEnum(record.chunking, 'chunking', ['none', 'fixed-size'] as const),
      };
    }

    function validateDocumentStorage(value: unknown, projectId: string, documentId: string): DocumentManifest['storage'] {
      const record = assertPlainObject(value, 'storage');
      validateAllowedKeys(record, ['driver', 'ref', 'chunkSizeBytes'], 'storage');

      const driver = validateEnum(record.driver, 'driver', ['opfs', 'indexeddb-blob', 'external-folder']);
      const ref = validateStorageRef(record.ref);
      const expectedRef = buildStorageRef({ driver, projectId, documentId });

      if (ref !== expectedRef) {
        throw new ValidationError('Invalid storage reference', 'ref');
      }

      const chunkSizeBytes = record.chunkSizeBytes === undefined
        ? undefined
        : validateNonNegativeInteger(record.chunkSizeBytes, 'chunkSizeBytes', 1024 * 1024 * 1024);

      return chunkSizeBytes === undefined ? { driver, ref } : { driver, ref, chunkSizeBytes };
    }

    export function validateDocumentManifest(value: unknown): DocumentManifest {
      const record = assertPlainObject(value, 'document');
      validateAllowedKeys(record, ['id', 'projectId', 'name', 'mimeType', 'sizeBytes', 'sha256', 'storage', 'crypto', 'createdAt', 'updatedAt'], 'document');

      const id = validateSafeId(record.id, 'id');
      const projectId = validateSafeId(record.projectId, 'projectId');

      return {
        id,
        projectId,
        name: validateString(record.name, 'name', MAX_PROJECT_NAME_LENGTH),
        mimeType: validateMimeTypeValue(record.mimeType),
        sizeBytes: validateNonNegativeInteger(record.sizeBytes, 'sizeBytes', 250 * 1024 * 1024),
        sha256: validateSha256(record.sha256),
        storage: validateDocumentStorage(record.storage, projectId, id),
        crypto: record.crypto === undefined ? undefined : validateDocumentCrypto(record.crypto),
        createdAt: validateIsoDate(record.createdAt, 'createdAt'),
        updatedAt: validateIsoDate(record.updatedAt, 'updatedAt'),
      };
    }

    export function validateExportPackage(value: unknown): ExportPackage {
      const record = assertPlainObject(value, 'exportPackage');
      validateAllowedKeys(record, ['version', 'appVersion', 'timestamp', 'project', 'documents', 'projectSummary', 'encrypted', 'crypto', 'integrityHash'], 'exportPackage');

      const output: ExportPackage = {
        version: validateString(record.version, 'version', 32),
        appVersion: validateString(record.appVersion, 'appVersion', 32),
        timestamp: validateIsoDate(record.timestamp, 'timestamp'),
        encrypted: validateBoolean(record.encrypted, 'encrypted'),
      };

      if (record.project !== undefined) {
        output.project = validateProject(record.project);
      }

      if (record.documents !== undefined) {
        if (!Array.isArray(record.documents)) {
          throw new ValidationError('documents must be an array', 'documents');
        }

        if (record.documents.length > DEFAULT_MAX_ARRAY_LENGTH) {
          throw new ValidationError('documents exceeds maximum length', 'documents');
        }

        output.documents = record.documents.map((document) => validateDocumentManifest(document));
      }

      if (record.projectSummary !== undefined) {
        const summary = assertPlainObject(record.projectSummary, 'projectSummary');
        validateAllowedKeys(summary, ['id', 'name', 'updatedAt', 'documentCount'], 'projectSummary');
        output.projectSummary = {
          id: validateSafeId(summary.id, 'id'),
          name: validateString(summary.name, 'name', MAX_PROJECT_NAME_LENGTH),
          updatedAt: validateIsoDate(summary.updatedAt, 'updatedAt'),
          documentCount: validateNonNegativeInteger(summary.documentCount, 'documentCount', DEFAULT_MAX_ARRAY_LENGTH),
        };
      }

      if (record.crypto !== undefined) {
        output.crypto = validateCryptoEnvelope(record.crypto);
      }

      if (record.integrityHash !== undefined && record.integrityHash !== '') {
        const integrityHash = validateString(record.integrityHash, 'integrityHash', 64);
        if (!/^[a-f0-9]{64}$/i.test(integrityHash)) {
          throw new ValidationError('Invalid integrityHash', 'integrityHash');
        }
        output.integrityHash = integrityHash;
      }

      return output;
    }

    export interface VaultPayload {
      project: Project;
      organizationProfile: OrganizationProfile | null;
      ismScope: ISmsScope | null;
      assets: Asset[];
      risks: Risk[];
      controls: Control[];
      reviews: ControlReview[];
      policies: Policy[];
      findings: Finding[];
      actions: ActionItem[];
      evidenceLinks: EvidenceLink[];
      documents: DocumentManifest[];
      binariesByDocumentId: Record<string, string>;
    }

    function validateBinaryMap(value: unknown, documentIds: Set<string>): Record<string, string> {
      const record = assertPlainObject(value, 'binariesByDocumentId');
      const result: Record<string, string> = {};

      for (const key of Object.keys(record)) {
        const documentId = validateSafeId(key, 'documentId');
        if (!documentIds.has(documentId)) {
          throw new ValidationError('Binary map references missing document', 'binariesByDocumentId');
        }

        const bytes = validateString(record[key], `binariesByDocumentId.${key}`, 400 * 1024 * 1024);
        if (!BASE64_PATTERN.test(bytes)) {
          throw new ValidationError('Invalid binary payload', 'binariesByDocumentId');
        }

        result[documentId] = bytes;
      }

      return result;
    }

    function validateVaultCollections(value: VaultPayload): VaultPayload {
      const project = validateProject(value.project);
      const organizationProfile = value.organizationProfile ? validateOrganizationProfile(value.organizationProfile) : null;
      const ismScope = value.ismScope ? validateIsmScope(value.ismScope) : null;
      const assets = value.assets.map((item) => validateAsset(item));
      const risks = value.risks.map((item) => validateRisk(item));
      const controls = value.controls.map((item) => validateControl(item));
      const reviews = value.reviews.map((item) => validateControlReview(item));
      const policies = value.policies.map((item) => validatePolicy(item));
      const findings = value.findings.map((item) => validateFinding(item));
      const actions = value.actions.map((item) => validateActionItem(item));
      const evidenceLinks = value.evidenceLinks.map((item) => validateEvidenceLink(item));
      const documents = value.documents.map((item) => validateDocumentManifest(item));

      const documentIds = new Set(documents.map((document) => document.id));
      const assetIds = new Set(assets.map((asset) => asset.id));
      const riskIds = new Set(risks.map((risk) => risk.id));
      const controlIds = new Set(controls.map((control) => control.id));
      const reviewIds = new Set(reviews.map((review) => review.id));
      const policyIds = new Set(policies.map((policy) => policy.id));
      const findingIds = new Set(findings.map((finding) => finding.id));
      const actionIds = new Set(actions.map((action) => action.id));

      for (const risk of risks) {
        for (const assetId of risk.linkedAssetIds || []) {
          if (!assetIds.has(assetId)) {
            throw new ValidationError('Risk references missing asset', 'linkedAssetIds');
          }
        }

        for (const controlId of risk.linkedControlIds || []) {
          if (!controlIds.has(controlId)) {
            throw new ValidationError('Risk references missing control', 'linkedControlIds');
          }
        }

        for (const evidenceId of risk.linkedEvidenceIds || []) {
          if (!documentIds.has(evidenceId)) {
            throw new ValidationError('Risk references missing evidence', 'linkedEvidenceIds');
          }
        }
      }

      for (const control of controls) {
        for (const riskId of control.linkedRiskIds || []) {
          if (!riskIds.has(riskId)) {
            throw new ValidationError('Control references missing risk', 'linkedRiskIds');
          }
        }

        for (const evidenceId of control.linkedEvidenceIds || []) {
          if (!documentIds.has(evidenceId)) {
            throw new ValidationError('Control references missing evidence', 'linkedEvidenceIds');
          }
        }
      }

      for (const review of reviews) {
        if (!controlIds.has(review.linkedControlId)) {
          throw new ValidationError('Review references missing control', 'linkedControlId');
        }

        for (const evidenceId of review.linkedEvidenceIds || []) {
          if (!documentIds.has(evidenceId)) {
            throw new ValidationError('Review references missing evidence', 'linkedEvidenceIds');
          }
        }
      }

      for (const policy of policies) {
        for (const evidenceId of policy.linkedEvidenceIds || []) {
          if (!documentIds.has(evidenceId)) {
            throw new ValidationError('Policy references missing evidence', 'linkedEvidenceIds');
          }
        }
      }

      for (const finding of findings) {
        for (const evidenceId of finding.linkedEvidenceIds || []) {
          if (!documentIds.has(evidenceId)) {
            throw new ValidationError('Finding references missing evidence', 'linkedEvidenceIds');
          }
        }
      }

      for (const action of actions) {
        for (const evidenceId of action.linkedEvidenceIds || []) {
          if (!documentIds.has(evidenceId)) {
            throw new ValidationError('Corrective action references missing evidence', 'linkedEvidenceIds');
          }
        }
      }

      for (const link of evidenceLinks) {
        if (!documentIds.has(link.evidenceId)) {
          throw new ValidationError('Evidence link references missing evidence', 'evidenceId');
        }

        if (link.targetType === 'control' && !controlIds.has(link.targetId)) {
          throw new ValidationError('Evidence link references missing control', 'targetId');
        }

        if (link.targetType === 'risk' && !riskIds.has(link.targetId)) {
          throw new ValidationError('Evidence link references missing risk', 'targetId');
        }

        if (link.targetType === 'review' && !reviewIds.has(link.targetId)) {
          throw new ValidationError('Evidence link references missing review', 'targetId');
        }

        if (link.targetType === 'policy' && !policyIds.has(link.targetId)) {
          throw new ValidationError('Evidence link references missing policy', 'targetId');
        }

        if (link.targetType === 'finding' && !findingIds.has(link.targetId)) {
          throw new ValidationError('Evidence link references missing finding', 'targetId');
        }

        if (link.targetType === 'action' && !actionIds.has(link.targetId)) {
          throw new ValidationError('Evidence link references missing action', 'targetId');
        }

        if (link.targetType === 'requirement') {
          validateSafeId(link.targetId, 'targetId');
        }
      }

      const binariesByDocumentId = validateBinaryMap(value.binariesByDocumentId, documentIds);

      return {
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
      };
    }

    export function validateVaultPayload(value: unknown): VaultPayload {
      const record = assertPlainObject(value, 'vaultPayload');
      validateAllowedKeys(record, ['project', 'organizationProfile', 'ismScope', 'assets', 'risks', 'controls', 'reviews', 'policies', 'findings', 'actions', 'evidenceLinks', 'documents', 'binariesByDocumentId'], 'vaultPayload');

      const payload: VaultPayload = {
        project: validateProject(record.project),
        organizationProfile: record.organizationProfile === undefined || record.organizationProfile === null ? null : validateOrganizationProfile(record.organizationProfile),
        ismScope: record.ismScope === undefined || record.ismScope === null ? null : validateIsmScope(record.ismScope),
        assets: Array.isArray(record.assets) ? record.assets.map((item) => validateAsset(item)) : [],
        risks: Array.isArray(record.risks) ? record.risks.map((item) => validateRisk(item)) : [],
        controls: Array.isArray(record.controls) ? record.controls.map((item) => validateControl(item)) : [],
        reviews: Array.isArray(record.reviews) ? record.reviews.map((item) => validateControlReview(item)) : [],
        policies: Array.isArray(record.policies) ? record.policies.map((item) => validatePolicy(item)) : [],
        findings: Array.isArray(record.findings) ? record.findings.map((item) => validateFinding(item)) : [],
        actions: Array.isArray(record.actions) ? record.actions.map((item) => validateActionItem(item)) : [],
        evidenceLinks: Array.isArray(record.evidenceLinks) ? record.evidenceLinks.map((item) => validateEvidenceLink(item)) : [],
        documents: Array.isArray(record.documents) ? record.documents.map((item) => validateDocumentManifest(item)) : [],
        binariesByDocumentId: record.binariesByDocumentId === undefined ? {} : assertPlainObject(record.binariesByDocumentId, 'binariesByDocumentId') as Record<string, string>,
      };

      return validateVaultCollections(payload);
    }
