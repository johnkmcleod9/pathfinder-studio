/**
 * tincan.xml generator + validator
 *
 * The xAPI / TinCan API package descriptor.  An LRS (or content host)
 * reads tincan.xml at the root of an xAPI package to discover the
 * activity IRI(s), display name(s), and the launch URL.
 *
 * Spec ref: https://github.com/RusticiSoftware/tin-can-xml
 *
 * We emit a single root activity for the course and (optionally) one
 * "lesson" activity per slide so analytics platforms can filter by
 * granular activity. The generator is XSS-safe — every interpolated
 * value is XML-escaped — and the matching validator catches the most
 * common authoring mistakes (missing root, wrong namespace, missing
 * launch).
 */

export const TINCAN_NAMESPACE = 'http://projecttincan.com/tincan.xsd';
const COURSE_ACTIVITY_TYPE = 'http://adlnet.gov/expapi/activities/course';
const LESSON_ACTIVITY_TYPE = 'http://adlnet.gov/expapi/activities/lesson';

export interface TinCanSlide {
  id: string;
  title: string;
}

export interface TinCanOptions {
  /** Root activity IRI — must be an absolute URI. */
  activityId: string;
  /** Display title, used as the <name>. */
  title: string;
  /** Path to the launch HTML, relative to the package root. */
  launch: string;
  /** Optional <description> text. Omitted from XML when undefined. */
  description?: string;
  /** Language tag for name / launch / description. Default 'en-US'. */
  language?: string;
  /**
   * Optional per-slide activities. When provided, each slide gets its
   * own <activity id="{activityId}/slides/{slideId}" type="...lesson">
   * entry alongside the root course activity.
   */
  slides?: TinCanSlide[];
}

export interface TinCanValidationResult {
  valid: boolean;
  errors: string[];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateTinCanXml(opts: TinCanOptions): string {
  const lang = opts.language ?? 'en-US';
  const escapedActivityId = escapeXml(opts.activityId);
  const escapedTitle = escapeXml(opts.title);
  const escapedLaunch = escapeXml(opts.launch);
  const escapedLang = escapeXml(lang);

  const descriptionEl = opts.description
    ? `      <description lang="${escapedLang}">${escapeXml(opts.description)}</description>\n`
    : '';

  const rootActivity =
    `    <activity id="${escapedActivityId}" type="${COURSE_ACTIVITY_TYPE}">\n` +
    `      <name lang="${escapedLang}">${escapedTitle}</name>\n` +
    descriptionEl +
    `      <launch lang="${escapedLang}">${escapedLaunch}</launch>\n` +
    `    </activity>\n`;

  let slideActivities = '';
  if (opts.slides && opts.slides.length > 0) {
    for (const slide of opts.slides) {
      const slideId = escapeXml(`${opts.activityId}/slides/${slide.id}`);
      const slideTitle = escapeXml(slide.title);
      slideActivities +=
        `    <activity id="${slideId}" type="${LESSON_ACTIVITY_TYPE}">\n` +
        `      <name lang="${escapedLang}">${slideTitle}</name>\n` +
        `      <launch lang="${escapedLang}">${escapedLaunch}#${escapeXml(slide.id)}</launch>\n` +
        `    </activity>\n`;
    }
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<tincan xmlns="${TINCAN_NAMESPACE}">\n` +
    `  <activities>\n` +
    rootActivity +
    slideActivities +
    `  </activities>\n` +
    `</tincan>\n`
  );
}

/**
 * Lightweight structural validator for tincan.xml.
 *
 * Not an XSD validator — we don't pull in libxml2 just for this — but
 * catches the most common authoring mistakes that LRSes also reject:
 * missing root, wrong / missing namespace, no <activities>, no
 * <activity>, activity missing id, activity missing <launch>.
 */
export function validateTinCanXml(xml: string): TinCanValidationResult {
  const errors: string[] = [];
  if (!xml || xml.trim() === '') {
    return { valid: false, errors: ['tincan.xml is empty'] };
  }

  // Root element must be <tincan ...>...</tincan>.
  const rootMatch = xml.match(/<tincan(\s[^>]*)?>/);
  if (!rootMatch) {
    errors.push('Missing <tincan> root element');
    return { valid: false, errors };
  }
  if (!/<\/tincan>\s*$/.test(xml.trim() + '\n')) {
    errors.push('Unclosed <tincan> root element');
  }

  // Namespace check — we accept the canonical namespace (RusticiSoftware
  // also supports old TinCan-prefixed forms but the canonical one is
  // what their importer uses).
  const rootAttrs = rootMatch[1] ?? '';
  const nsMatch = rootAttrs.match(/xmlns\s*=\s*"([^"]*)"/);
  if (!nsMatch) {
    errors.push(`<tincan> root is missing the xmlns="${TINCAN_NAMESPACE}" namespace`);
  } else if (nsMatch[1] !== TINCAN_NAMESPACE) {
    errors.push(`<tincan> root has wrong xmlns namespace: ${nsMatch[1]}`);
  }

  // Must contain an <activities> wrapper.
  if (!/<activities[\s>]/.test(xml)) {
    errors.push('Missing <activities> wrapper');
  }

  // Must contain at least one <activity ...> entry.
  const activityRe = /<activity\s+([^>]*?)>([\s\S]*?)<\/activity>/g;
  const activities = [...xml.matchAll(activityRe)];
  if (activities.length === 0) {
    errors.push('Missing at least one <activity> entry');
  }

  for (const [, attrs, body] of activities) {
    if (!/\bid\s*=\s*"/.test(attrs)) {
      errors.push('<activity> is missing required id attribute');
    }
    if (!/<launch[\s>]/.test(body)) {
      errors.push('<activity> is missing required <launch> child');
    }
  }

  return { valid: errors.length === 0, errors };
}
