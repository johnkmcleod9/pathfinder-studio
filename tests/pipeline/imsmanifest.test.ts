/**
 * Test Suite 2.5: SCORM 1.2 imsmanifest.xml generator + validator
 *
 * These tests cover the simple "one-SCO course" manifest generator used
 * by the publish pipeline for SCORM 1.2 output. The validator does
 * STRUCTURAL validation (well-formedness, namespaces, required elements)
 * — not full XSD validation, which would require a libxml2 dependency.
 *
 * The more expressive multi-slide manifest builder lives in
 * src/publish/scorm-manifest.ts and is covered by the publish.test.ts
 * suite.
 */
import { describe, it, expect } from 'vitest';
import {
  generateScorm12Manifest,
  validateScorm12Manifest,
} from '../../src/publish/imsmanifest.js';

describe('SCORM 1.2 Manifest Generation', () => {
  describe('imsmanifest.xml structure', () => {
    it('generates manifest with correct XML namespaces', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"');
      expect(xml).toContain('xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"');
      expect(xml).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    });

    it('includes required schema locations', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('xsi:schemaLocation');
      expect(xml).toContain('imscp_rootv1p1p2.xsd');
      expect(xml).toContain('adlcp_rootv1p2.xsd');
    });

    it('starts with the XML prolog', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
    });

    it('sets manifest identifier attribute', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('identifier="course-001"');
    });

    it('sets manifest version attribute to "1"', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('version="1"');
    });

    it('generates organizations element with default="org-001"', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('<organizations');
      expect(xml).toContain('default="org-001"');
    });

    it('generates organization with identifier and title child', () => {
      const xml = generateScorm12Manifest({
        title: 'My Compliance Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('identifier="org-001"');
      expect(xml).toContain('<title>My Compliance Course</title>');
    });

    it('generates item referencing the SCO resource', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('<item');
      expect(xml).toContain('identifier="item-001"');
      expect(xml).toContain('identifierref="res-001"');
    });

    it('generates resources element', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('<resources>');
      expect(xml).toContain('</resources>');
    });

    it('generates resource with type="webcontent" and adlcp:scormtype="sco"', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('type="webcontent"');
      expect(xml).toContain('identifier="res-001"');
      expect(xml).toMatch(/adlcp:scormtype="sco"/);
    });

    it('includes adlcp:masteryscore when provided', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
        masteryscore: 80,
      });
      expect(xml).toContain('<adlcp:masteryscore>80</adlcp:masteryscore>');
    });

    it('does not include masteryscore when not provided', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).not.toContain('masteryscore');
    });

    it('sets href to the entry point SCO', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'content/player.html',
      });
      expect(xml).toContain('href="content/player.html"');
    });

    it('emits a <file> entry for the entry point', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toMatch(/<file\s+href="index\.html"\/>/);
    });

    it('emits a <file> entry for every published file', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
        files: ['runtime.js', 'styles.css', 'media/hero.png'],
      });
      expect(xml).toMatch(/<file\s+href="index\.html"\/>/);
      expect(xml).toMatch(/<file\s+href="runtime\.js"\/>/);
      expect(xml).toMatch(/<file\s+href="styles\.css"\/>/);
      expect(xml).toMatch(/<file\s+href="media\/hero\.png"\/>/);
    });

    it('does not duplicate the entry point if it also appears in files[]', () => {
      const xml = generateScorm12Manifest({
        title: 'My Course',
        identifier: 'course-001',
        entryPoint: 'index.html',
        files: ['index.html', 'runtime.js'],
      });
      const matches = xml.match(/<file\s+href="index\.html"\/>/g) ?? [];
      expect(matches.length).toBe(1);
    });

    it('escapes XML-sensitive characters in title', () => {
      const xml = generateScorm12Manifest({
        title: 'Health & Safety <Advanced>',
        identifier: 'course-001',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('Health &amp; Safety &lt;Advanced&gt;');
      expect(xml).not.toContain('<Advanced>');
    });

    it('escapes XML-sensitive characters in identifier', () => {
      const xml = generateScorm12Manifest({
        title: 'Test',
        identifier: 'course & co',
        entryPoint: 'index.html',
      });
      expect(xml).toContain('identifier="course &amp; co"');
    });
  });

  describe('SCORM 1.2 structural validation', () => {
    it('validates a freshly generated manifest', () => {
      const xml = generateScorm12Manifest({
        title: 'Test Course',
        identifier: 'test-001',
        entryPoint: 'index.html',
        masteryscore: 85,
      });
      const result = validateScorm12Manifest(xml);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports errors for malformed XML (unbalanced tags)', () => {
      const result = validateScorm12Manifest('<manifest><broken');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('reports errors when the <manifest> element is absent entirely', () => {
      const result = validateScorm12Manifest('<?xml version="1.0"?><foo/>');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('reports errors for missing required <organizations>', () => {
      const xml =
        '<?xml version="1.0"?>' +
        '<manifest identifier="TEST" version="1" ' +
        'xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">' +
        '<resources/></manifest>';
      const result = validateScorm12Manifest(xml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /organizations/i.test(e))).toBe(true);
    });

    it('reports errors for missing required <resources>', () => {
      const xml =
        '<?xml version="1.0"?>' +
        '<manifest identifier="TEST" version="1" ' +
        'xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">' +
        '<organizations default="x"/></manifest>';
      const result = validateScorm12Manifest(xml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /resources/i.test(e))).toBe(true);
    });

    it('reports errors for invalid namespace', () => {
      const xml =
        '<?xml version="1.0"?>' +
        '<manifest identifier="TEST" version="1" xmlns="http://wrong-namespace.com">' +
        '<organizations default="org-001">' +
        '<organization identifier="org-001"><title>Test</title>' +
        '<item identifier="item-001" identifierref="res-001"/>' +
        '</organization></organizations>' +
        '<resources><resource identifier="res-001" type="webcontent" href="index.html">' +
        '<file href="index.html"/></resource></resources>' +
        '</manifest>';
      const result = validateScorm12Manifest(xml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /namespace/i.test(e))).toBe(true);
    });

    it('reports multiple errors when multiple things are wrong', () => {
      const xml =
        '<?xml version="1.0"?>' +
        '<manifest identifier="T" version="1" xmlns="http://wrong.com"></manifest>';
      const result = validateScorm12Manifest(xml);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('returns an empty errors array on valid input', () => {
      const xml = generateScorm12Manifest({
        title: 'Valid',
        identifier: 'v-001',
        entryPoint: 'index.html',
      });
      const result = validateScorm12Manifest(xml);
      expect(result.errors).toEqual([]);
    });
  });
});
