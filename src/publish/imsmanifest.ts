/**
 * SCORM 1.2 imsmanifest.xml generator + structural validator.
 *
 * The generator emits a minimal, CAM-compliant "one-SCO" manifest suitable
 * for the common publish-pipeline case (a single entry point + a flat file
 * list). For multi-slide courses with per-slide SCOs see
 * src/publish/scorm-manifest.ts.
 *
 * The validator does STRUCTURAL validation only — well-formedness,
 * namespaces, required elements. Full XSD validation would require a
 * libxml2 dependency we're not willing to pull in.
 */

// ---- Generator ----

export interface Scorm12ManifestOpts {
  /** Human-readable course title (shown in the LMS). */
  title: string;
  /** Unique manifest identifier; typically the course slug. */
  identifier: string;
  /** Entry-point file relative to the package root, e.g. "index.html". */
  entryPoint: string;
  /** Optional passing score (0–100). Omitted if not specified. */
  masteryscore?: number;
  /** Additional package files to list as <file> entries. */
  files?: string[];
}

const SCORM12_NS = 'http://www.imsproject.org/xsd/imscp_rootv1p1p2';
const SCORM12_ADLCP_NS = 'http://www.adlnet.org/xsd/adlcp_rootv1p2';
const SCORM12_XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
const SCORM12_SCHEMA_LOCATION =
  'http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd ' +
  'http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a SCORM 1.2 imsmanifest.xml for a single-SCO course.
 */
export function generateScorm12Manifest(opts: Scorm12ManifestOpts): string {
  // Deduplicate files while preserving order, entry point first.
  const seen = new Set<string>();
  const allFiles: string[] = [];
  for (const f of [opts.entryPoint, ...(opts.files ?? [])]) {
    if (!seen.has(f)) {
      seen.add(f);
      allFiles.push(f);
    }
  }

  const fileEntries = allFiles
    .map((f) => `      <file href="${escapeXml(f)}"/>`)
    .join('\n');

  const masteryscoreElement =
    opts.masteryscore !== undefined
      ? `\n        <adlcp:masteryscore>${Math.round(opts.masteryscore)}</adlcp:masteryscore>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeXml(opts.identifier)}" version="1"
  xmlns="${SCORM12_NS}"
  xmlns:adlcp="${SCORM12_ADLCP_NS}"
  xmlns:xsi="${SCORM12_XSI_NS}"
  xsi:schemaLocation="${SCORM12_SCHEMA_LOCATION}">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org-001">
    <organization identifier="org-001">
      <title>${escapeXml(opts.title)}</title>
      <item identifier="item-001" identifierref="res-001">
        <title>${escapeXml(opts.title)}</title>${masteryscoreElement}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-001" type="webcontent" adlcp:scormtype="sco" href="${escapeXml(opts.entryPoint)}">
${fileEntries}
    </resource>
  </resources>
</manifest>
`;
}

// ---- Structural validator ----

export interface Scorm12ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Structural validation of a SCORM 1.2 imsmanifest.xml. Covers
 * well-formedness of the root <manifest> element, namespace correctness,
 * and required child elements. Does NOT perform full XSD validation.
 */
export function validateScorm12Manifest(xml: string): Scorm12ValidationResult {
  const errors: string[] = [];

  // ── Root element presence + tag balance ──────────────────────────────
  const openMatches = xml.match(/<manifest[\s>]/g) ?? [];
  const closeMatches = xml.match(/<\/manifest>/g) ?? [];

  if (openMatches.length === 0) {
    errors.push('Missing required root <manifest> element');
    return { valid: false, errors };
  }
  if (openMatches.length !== closeMatches.length) {
    errors.push(
      `Malformed XML: <manifest> open/close tag mismatch ` +
        `(${openMatches.length} open vs ${closeMatches.length} close)`
    );
  }

  // ── Namespace ────────────────────────────────────────────────────────
  if (!xml.includes(`xmlns="${SCORM12_NS}"`)) {
    errors.push(
      `Invalid or missing SCORM 1.2 namespace — ` +
        `expected xmlns="${SCORM12_NS}"`
    );
  }

  // ── Required children ────────────────────────────────────────────────
  if (!/<organizations[\s>\/]/.test(xml)) {
    errors.push('Missing required <organizations> element');
  }
  if (!/<resources[\s>\/]/.test(xml)) {
    errors.push('Missing required <resources> element');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
