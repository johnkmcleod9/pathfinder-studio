/**
 * tincan.xml generator + validator — tests
 *
 * The xAPI / TinCan API spec defines tincan.xml as the package descriptor
 * that LRSes (Yet Analytics, Watershed, SCORM Cloud, etc.) read to
 * register the activity. Without it, an xAPI-published .zip can't be
 * imported by most platforms.
 *
 * Spec ref: https://github.com/RusticiSoftware/tin-can-xml
 *
 * We test:
 *   - Generator produces well-formed XML with the canonical namespace
 *   - Activity id, name, description, launch URL all interpolate
 *   - Special characters are properly escaped
 *   - Validator catches missing / malformed elements
 *   - Multiple-activity emission for per-slide granular tracking
 */
import { describe, it, expect } from 'vitest';
import {
  generateTinCanXml,
  validateTinCanXml,
  TINCAN_NAMESPACE,
} from '../../src/publish/tincan.js';

describe('generateTinCanXml — required structure', () => {
  it('emits the XML declaration', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
    });
    expect(xml).toMatch(/^<\?xml\s+version="1\.0"\s+encoding="UTF-8"/);
  });

  it('uses the canonical TinCan namespace', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
    });
    expect(xml).toContain(`xmlns="${TINCAN_NAMESPACE}"`);
    expect(TINCAN_NAMESPACE).toBe('http://projecttincan.com/tincan.xsd');
  });

  it('wraps everything in a <tincan> root element', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
    });
    expect(xml).toMatch(/<tincan[^>]*>[\s\S]*<\/tincan>\s*$/);
  });

  it('emits a single activity element with the supplied id', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/courses/intro-101',
      title: 'Intro',
      launch: 'index.html',
    });
    expect(xml).toContain('<activity id="http://example.com/courses/intro-101"');
  });

  it('marks the activity type as the ADL course IRI by default', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
    });
    expect(xml).toContain('type="http://adlnet.gov/expapi/activities/course"');
  });

  it('emits the launch URL in a <launch> element', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'player/player-shell.html',
    });
    expect(xml).toMatch(/<launch[^>]*>player\/player-shell\.html<\/launch>/);
  });

  it('emits the title in a <name> element', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'My Cool Course',
      launch: 'index.html',
    });
    expect(xml).toMatch(/<name[^>]*>My Cool Course<\/name>/);
  });
});

describe('generateTinCanXml — language handling', () => {
  it('uses lang="en-US" by default for name + launch', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
    });
    expect(xml).toMatch(/<name\s+lang="en-US">/);
    expect(xml).toMatch(/<launch\s+lang="en-US">/);
  });

  it('honours an explicit language code', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Cours',
      launch: 'index.html',
      language: 'fr-FR',
    });
    expect(xml).toMatch(/<name\s+lang="fr-FR">/);
    expect(xml).toMatch(/<launch\s+lang="fr-FR">/);
  });
});

describe('generateTinCanXml — optional fields', () => {
  it('omits <description> when no description supplied', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
    });
    expect(xml).not.toContain('<description');
  });

  it('emits <description> when supplied', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
      description: 'A cool course',
    });
    expect(xml).toMatch(/<description\s+lang="en-US">A cool course<\/description>/);
  });
});

describe('generateTinCanXml — XML escaping', () => {
  it('escapes < > & " in title', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'A & B "C" <D>',
      launch: 'index.html',
    });
    expect(xml).toContain('A &amp; B &quot;C&quot; &lt;D&gt;');
    expect(xml).not.toMatch(/<name[^>]*>A & B/);
  });

  it('escapes & in activity id', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1?x=1&y=2',
      title: 'Course',
      launch: 'index.html',
    });
    expect(xml).toContain('id="http://example.com/c1?x=1&amp;y=2"');
  });

  it('escapes special characters in launch URL', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html?a=1&b=2',
    });
    expect(xml).toContain('index.html?a=1&amp;b=2');
  });
});

describe('generateTinCanXml — multiple activities', () => {
  it('emits one root activity by default', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
    });
    const matches = xml.match(/<activity\s+id=/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('emits one extra activity per slide when `slides` provided', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
      slides: [
        { id: 's1', title: 'Slide One' },
        { id: 's2', title: 'Slide Two' },
      ],
    });
    const matches = xml.match(/<activity\s+id=/g) ?? [];
    expect(matches.length).toBe(3); // root + 2 slides
  });

  it('uses the slide IRI scheme {activityId}/slides/{slideId}', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
      slides: [{ id: 's1', title: 'Slide 1' }],
    });
    expect(xml).toContain('id="http://example.com/c1/slides/s1"');
  });

  it('marks slide activities as the ADL slide IRI', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
      slides: [{ id: 's1', title: 'Slide 1' }],
    });
    // The root keeps the course type; slides get the slide type.
    expect(xml).toContain('type="http://adlnet.gov/expapi/activities/lesson"');
  });
});

describe('validateTinCanXml', () => {
  it('accepts a generator-produced XML', () => {
    const xml = generateTinCanXml({
      activityId: 'http://example.com/c1',
      title: 'Course',
      launch: 'index.html',
    });
    const r = validateTinCanXml(xml);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects empty input', () => {
    const r = validateTinCanXml('');
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects XML missing the <tincan> root', () => {
    const r = validateTinCanXml('<?xml version="1.0"?><other/>');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /tincan/i.test(e))).toBe(true);
  });

  it('rejects XML missing the canonical namespace', () => {
    const r = validateTinCanXml(
      '<?xml version="1.0"?><tincan><activities><activity id="a" type="t"><name>n</name><launch>l</launch></activity></activities></tincan>'
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /namespace/i.test(e))).toBe(true);
  });

  it('rejects XML with no <activities>', () => {
    const r = validateTinCanXml(
      `<?xml version="1.0"?><tincan xmlns="${TINCAN_NAMESPACE}"></tincan>`
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /activit/i.test(e))).toBe(true);
  });

  it('rejects XML with no <activity>', () => {
    const r = validateTinCanXml(
      `<?xml version="1.0"?><tincan xmlns="${TINCAN_NAMESPACE}"><activities></activities></tincan>`
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /activit/i.test(e))).toBe(true);
  });

  it('rejects activity missing id attribute', () => {
    const xml =
      `<?xml version="1.0"?><tincan xmlns="${TINCAN_NAMESPACE}"><activities><activity type="t"><name>n</name><launch>l</launch></activity></activities></tincan>`;
    const r = validateTinCanXml(xml);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /id/i.test(e))).toBe(true);
  });

  it('rejects activity missing <launch>', () => {
    const xml =
      `<?xml version="1.0"?><tincan xmlns="${TINCAN_NAMESPACE}"><activities><activity id="a" type="t"><name>n</name></activity></activities></tincan>`;
    const r = validateTinCanXml(xml);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /launch/i.test(e))).toBe(true);
  });
});
