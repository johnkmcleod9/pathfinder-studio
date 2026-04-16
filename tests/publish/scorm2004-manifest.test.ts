/**
 * SCORM 2004 imsmanifest.xml — generator + validator
 *
 * The previous renderer had several spec violations that made packages
 * fail import on conformant LMSes:
 *   - <adlcp:scormType> emitted as a child element instead of an attribute
 *   - adlcp namespace prefix used but never declared (invalid XML)
 *   - missing imsss / adlseq / adlnav namespaces required for SCORM 2004
 *   - <metadata> double-wrapped via fragile string mangling
 *   - schema value "IMS Content Packaging" instead of "ADL SCORM"
 *
 * These tests pin the spec-compliant output. Reference:
 *   ADL SCORM 2004 4th Edition, Content Aggregation Model (CAM) §3.4
 */
import { describe, it, expect } from 'vitest';
import {
  buildScormManifest,
  renderManifestXml,
} from '../../src/publish/scorm-manifest.js';

const ADLCP_NS = 'http://www.adlnet.org/xsd/adlcp_v1p3';
const ADLSEQ_NS = 'http://www.adlnet.org/xsd/adlseq_v1p3';
const ADLNAV_NS = 'http://www.adlnet.org/xsd/adlnav_v1p3';
const IMSSS_NS = 'http://www.imsglobal.org/xsd/imsss';
const IMSCP_NS = 'http://www.imsglobal.org/xsd/imscp_v1p1';

function buildSimple() {
  return buildScormManifest(
    'course-2004',
    'My SCORM 2004 Course',
    'scorm2004',
    ['slide-1', 'slide-2'],
    ['course.json', 'pathfinder-runtime.js'],
    80
  );
}

describe('SCORM 2004 manifest — namespace declarations', () => {
  it('declares the IMS CP default namespace', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toContain(`xmlns="${IMSCP_NS}"`);
  });

  it('declares the adlcp namespace prefix used by adlcp:scormType', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toContain(`xmlns:adlcp="${ADLCP_NS}"`);
  });

  it('declares the imsss namespace (required for sequencing)', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toContain(`xmlns:imsss="${IMSSS_NS}"`);
  });

  it('declares the adlseq namespace', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toContain(`xmlns:adlseq="${ADLSEQ_NS}"`);
  });

  it('declares the adlnav namespace', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toContain(`xmlns:adlnav="${ADLNAV_NS}"`);
  });

  it('declares xsi for schemaLocation', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  });

  it('lists every namespace in xsi:schemaLocation', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    const sl = xml.match(/xsi:schemaLocation="([^"]+)"/);
    expect(sl).not.toBeNull();
    const value = sl![1];
    expect(value).toContain(IMSCP_NS);
    expect(value).toContain(ADLCP_NS);
    expect(value).toContain(IMSSS_NS);
    expect(value).toContain(ADLSEQ_NS);
    expect(value).toContain(ADLNAV_NS);
  });
});

describe('SCORM 2004 manifest — adlcp:scormType placement', () => {
  it('emits adlcp:scormType as a <resource> attribute, not a child', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    // Must appear in attribute position: `<resource ... adlcp:scormType="sco" ...>`
    expect(xml).toMatch(/<resource[^>]*adlcp:scormType="sco"[^>]*>/);
    // Must NOT appear as a child element.
    expect(xml).not.toMatch(/<adlcp:scormType>/);
  });

  it('emits adlcp:scormType="asset" for non-SCO resources', () => {
    const manifest = buildSimple();
    // Find the metadata resource and force it to "asset"
    const meta = manifest.resources.find((r) => r.identifier === 'res_course_metadata');
    if (meta) {
      meta.adlcpScormType = 'asset';
    }
    const xml = renderManifestXml(manifest, 'scorm2004');
    expect(xml).toMatch(/adlcp:scormType="asset"/);
  });
});

describe('SCORM 2004 manifest — metadata block', () => {
  it('uses the ADL SCORM schema name (not IMS Content Packaging)', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toContain('<schema>ADL SCORM</schema>');
  });

  it('declares the SCORM 2004 4th Edition schemaversion', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toContain('<schemaversion>2004 4th Edition</schemaversion>');
  });

  it('does not double-wrap <metadata> (no <metadata><metadata>)', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).not.toMatch(/<metadata>\s*<metadata>/);
  });

  it('emits exactly one top-level <metadata> element', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    // Top-level <metadata> = a sibling of <organizations>, indented two
    // spaces under the root <manifest>. Resource <metadata> is deeper.
    const topLevel = xml.match(/^  <metadata>/gm) ?? [];
    expect(topLevel.length).toBe(1);
  });
});

describe('SCORM 2004 manifest — structure', () => {
  it('emits <organizations> with the default attribute referencing the org id', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toMatch(/<organizations\s+default="ORG_1">/);
    expect(xml).toMatch(/<organization\s+identifier="ORG_1"/);
  });

  it('emits one <item> per slide', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    const items = xml.match(/<item\s+identifier="item_/g) ?? [];
    expect(items.length).toBe(2);
  });

  it('each <item> has identifierref pointing at a resource', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toMatch(/<item\s+identifier="item_slide-1"\s+identifierref="res_slide-1"/);
    expect(xml).toMatch(/<item\s+identifier="item_slide-2"\s+identifierref="res_slide-2"/);
  });

  it('every resource has at least one <file href="..."/>', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    // Every <resource ...> must contain at least one <file>.
    const resources = xml.match(/<resource\s+[^>]*>[\s\S]*?<\/resource>/g) ?? [];
    expect(resources.length).toBeGreaterThan(0);
    for (const r of resources) {
      expect(r).toMatch(/<file\s+href="/);
    }
  });

  it('emits <organizations> exactly once (not once-per-organization)', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    const opens = xml.match(/<organizations\b/g) ?? [];
    const closes = xml.match(/<\/organizations>/g) ?? [];
    expect(opens.length).toBe(1);
    expect(closes.length).toBe(1);
  });
});

describe('SCORM 2004 manifest — well-formedness', () => {
  it('starts with the XML declaration', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    expect(xml).toMatch(/^<\?xml\s+version="1\.0"\s+encoding="UTF-8"/);
  });

  it('every opened <organizations> / <resources> / <manifest> has a matching close', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    for (const tag of ['manifest', 'organizations', 'organization', 'resources']) {
      const opens = (xml.match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length;
      const closes = (xml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
      expect(opens, `${tag} open count`).toBe(closes);
    }
  });

  it('contains no unresolved namespace prefixes (every prefix is declared)', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    const declaredPrefixes = new Set<string>();
    for (const m of xml.matchAll(/xmlns:([a-zA-Z][a-zA-Z0-9]*)="/g)) {
      declaredPrefixes.add(m[1]);
    }
    // Element prefixes: `<ns:tag` or `</ns:tag`.
    const usedPrefixes = new Set<string>();
    for (const m of xml.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*):/g)) {
      usedPrefixes.add(m[1]);
    }
    // Attribute prefixes: ` ns:attr="..."` — but NOT `xmlns:` declarations.
    for (const m of xml.matchAll(/\s([a-zA-Z][a-zA-Z0-9]*):([a-zA-Z][a-zA-Z0-9]*)="/g)) {
      if (m[1] === 'xmlns') continue;
      usedPrefixes.add(m[1]);
    }
    for (const used of usedPrefixes) {
      if (used === 'xml') continue; // implicit
      expect(declaredPrefixes.has(used), `prefix ${used} declared`).toBe(true);
    }
  });
});

describe('SCORM 2004 manifest — sequencing (mastery score)', () => {
  it('emits <imsss:sequencing> when item has objectives', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    // buildScormManifest with masteryScore=80 builds objectives;
    // those should be wrapped in imsss:sequencing in SCORM 2004.
    expect(xml).toContain('<imsss:sequencing>');
    expect(xml).toContain('<imsss:objectives>');
  });

  it('emits the minNormalizedMeasure based on the mastery score', () => {
    const xml = renderManifestXml(buildSimple(), 'scorm2004');
    // 80% mastery → 0.8
    expect(xml).toContain('<imsss:minNormalizedMeasure>0.8</imsss:minNormalizedMeasure>');
  });
});
