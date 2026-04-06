/**
 * SCORM manifest builder — generates imsmanifest.xml for SCORM 1.2 and 2004.
 * Also produces the SCORM adapter JS files that go into the output package.
 */

import { OutputStandard, ImsManifest, ImsOrganization, ImsItem, ImsResource, ImsMetadata } from './types.js';

const SCORM2004_NAMESPACE = 'http://www.imsglobal.org/xsd/imscp_v1p1';
const SCORM2004_XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const SCORM2004_LOC = 'http://www.imsglobal.org/xsd/imscp_v1p1.xsd';

export function buildScormManifest(
  projectId: string,
  title: string,
  standard: OutputStandard,
  slides: string[],
  files: string[],
  masteryScore?: number
): ImsManifest {
  const sanitizeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  const itemId = (slideId: string) => `item_${sanitizeId(slideId)}`;
  const resourceId = (slideId: string) => `res_${sanitizeId(slideId)}`;

  // Build items tree
  const items: ImsItem[] = slides.map((slideId, idx) => ({
    identifier: itemId(slideId),
    title: `Slide ${idx + 1}`,
    resource: resourceId(slideId),
    ...(standard === 'scorm2004' && masteryScore !== undefined
      ? {
          parameters: `objectives=OBJ_${sanitizeId(slideId)}&mastery_score=${masteryScore}`,
          objectives: [
            {
              id: `OBJ_${sanitizeId(slideId)}`,
              satisfiedByMeasure: true,
              minNormalizedMeasure: masteryScore / 100,
            },
          ],
          sequencing: {
            controlMode: { choice: true, flow: false },
            completionSet: { tracked: true },
          },
        }
      : {}),
  }));

  const org: ImsOrganization = {
    identifier: 'ORG_1',
    title,
    structure: 'rooted',
    items,
  };

  // Build resources — each slide is a SCO (shareable content object)
  const resources: ImsResource[] = slides.map((slideId, idx) => ({
    identifier: resourceId(slideId),
    type: 'webcontent',
    href: `content/slide_${idx + 1}.html`,
    files: [
      `content/slide_${idx + 1}.html`,
      '../../pathfinder-runtime.js',
      '../../pathfinder-runtime.css',
      'sco-api.js',
    ],
    SCORMType: 'sco',
    adlcpScormType: 'sco',
    metadata: {
      title: `Slide ${idx + 1}`,
      language: 'en',
    },
  }));

  // Add a root organization resource
  resources.push({
    identifier: 'res_course_metadata',
    type: 'metadata',
    href: 'metadata.xml',
    files: ['metadata.xml'],
  });

  const manifest: ImsManifest = {
    identifier: `MANIFEST_${sanitizeId(projectId)}`,
    version: standard === 'scorm2004' ? '1.0' : '1.1',
    title,
    organizations: [org],
    resources,
    metadata: {
      title,
      language: 'en',
    },
  };

  return manifest;
}

/**
 * Render an imsmanifest.xml string from a manifest object.
 */
export function renderManifestXml(manifest: ImsManifest, standard: OutputStandard): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const ns = standard === 'scorm2004' ? SCORM2004_NAMESPACE : 'http://www.imsglobal.org/xsd/imscp_v1p1';
  const xsi = standard === 'scorm2004' ? SCORM2004_XSI : '';
  const schemaLoc = standard === 'scorm2004'
    ? `http://www.imsglobal.org/xsd/imscp_v1p1 ${SCORM2004_LOC}`
    : '';

  const renderMetadata = (m?: ImsMetadata) => {
    if (!m) return '      <metadata/>';
    return `      <metadata>
        <schema>${escape(standard === 'scorm2004' ? 'IMS Content Packaging' : 'IMS CP')}</schema>
        <schemaversion>${escape(standard === 'scorm2004' ? '1.0' : '1.1.2')}</schemaversion>${m.title ? `\n        <lom><general><title><langstring>${escape(m.title)}</langstring></title></general></lom>` : ''}
      </metadata>`;
  };

  const renderItems = (items: ImsItem[], indent = '      '): string => {
    return items
      .map((item) => {
        let xml = `${indent}<item identifier="${escape(item.identifier)}"${item.resource ? ` identifierref="${escape(item.resource)}"` : ''}>\n`;
        xml += `${indent}  <title>${escape(item.title)}</title>\n`;
        if (standard === 'scorm2004') {
          if (item.parameters) {
            xml += `${indent}  <parameters>${escape(item.parameters)}</parameters>\n`;
          }
          if (item.objectives && item.objectives.length > 0) {
            xml += `${indent}  <objectives>\n`;
            for (const obj of item.objectives) {
              xml += `${indent}    <objective id="${escape(obj.id)}"${obj.satisfiedByMeasure ? ' satisfiedByMeasure="true"' : ''}>\n`;
              xml += `${indent}      <minNormalizedMeasure>${obj.minNormalizedMeasure}</minNormalizedMeasure>\n`;
              xml += `${indent}    </objective>\n`;
            }
            xml += `${indent}  </objectives>\n`;
          }
        }
        if (item.children) {
          xml += renderItems(item.children, indent + '  ');
        }
        xml += `${indent}</item>\n`;
        return xml;
      })
      .join('');
  };

  const renderResources = (resources: ImsResource[]): string => {
    return resources
      .map((res) => {
        let xml = `      <resource identifier="${escape(res.identifier)}" type="${escape(res.type)}"${res.href ? ` href="${escape(res.href)}"` : ''}>\n`;
        xml += renderMetadata(res.metadata);
        if (res.files.length > 0) {
          xml += `        <file href="${escape(res.files[0])}"/>\n`;
          for (const file of res.files.slice(1)) {
            xml += `        <file href="${escape(file)}"/>\n`;
          }
        }
        if (standard === 'scorm2004' && res.adlcpScormType) {
          xml += `        <adlcp:scormType>${escape(res.adlcpScormType)}</adlcp:scormType>\n`;
        }
        xml += `      </resource>\n`;
        return xml;
      })
      .join('');
  };

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  if (standard === 'scorm2004') {
    xml += `<manifest identifier="${escape(manifest.identifier)}"`;
    xml += ` version="${escape(manifest.version)}"`;
    xml += ` xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"`;
    xml += ` xmlns:xsi="${xsi}"`;
    xml += ` xsi:schemaLocation="${schemaLoc}">\n`;
    // Add namespace declarations
    xml += `  <metadata>${renderMetadata(manifest.metadata).trim().replace('      <metadata>', '').replace('</metadata>', '')}</metadata>\n`;
    // Organizations
    for (const org of manifest.organizations) {
      xml += `  <organizations default="ORG_1">\n`;
      xml += `    <organization identifier="${escape(org.identifier)}"${org.structure ? ` structure="${escape(org.structure)}"` : ''}>\n`;
      xml += `      <title>${escape(org.title)}</title>\n`;
      xml += renderItems(org.items, '        ');
      xml += `    </organization>\n`;
      xml += `  </organizations>\n`;
    }
    // Resources
    xml += `  <resources>\n`;
    xml += renderResources(manifest.resources);
    xml += `  </resources>\n`;
    xml += `</manifest>\n`;
  } else {
    // SCORM 1.2 manifest
    xml += `<manifest identifier="${escape(manifest.identifier)}" version="${escape(manifest.version)}">\n`;
    xml += `  ${renderMetadata(manifest.metadata)}\n`;
    xml += `  <organizations default="ORG_1"/>\n`;
    xml += `  <resources>\n`;
    xml += renderResources(manifest.resources);
    xml += `  </resources>\n`;
    xml += `</manifest>\n`;
  }

  return xml;
}

/**
 * SCORM 2004 API adapter — embedded in every SCORM 2004 published package.
 * Implements findAPI() recursive frame search and the full SCORM 2004 API.
 */
export const SCORM_2004_ADAPTER = `/**
 * SCORM 2004 API Adapter — Pathfinder Studio
 * Implements API_1484_11 wrapper with find, initialize, terminate,
 * GetValue/SetValue, and Commit.
 */

(function(global) {
  'use strict';

  var API = null;
  var initialized = false;
  var terminated = false;
  var errorCode = '0';

  // ---- API Discovery ----

  function findAPI(win) {
    var attempts = 0;
    while ((!win.API_1484_11 && !win.API) && win.parent && win.parent != win && attempts < 500) {
      attempts++;
      win = win.parent;
    }
    return win.API_1484_11 || win.API || null;
  }

  function getAPI() {
    if (API) return API;
    API = findAPI(window);
    if (!API) {
      // Try from top frame down
      var findAttempts = 0;
      var current = window;
      while (current && findAttempts < 100) {
        var found = current.API_1484_11 || current.API;
        if (found) { API = found; break; }
        if (!current.parent || current.parent === current) break;
        current = current.parent;
        findAttempts++;
      }
    }
    return API;
  }

  // ---- Error handling ----

  var ERROR_CODES = {
    '0': 'No error',
    '101': 'General initialization failure',
    '102': 'Already initialized',
    '103': 'Content instance terminated',
    '104': 'Terminate before initialize',
    '111': 'General termination failure',
    '112': 'Already terminated',
    '113': 'Terminate after terminate',
    '122': 'Initialize before initialize',
    '123': 'Terminate before initialize',
    '132': 'GetValue before initialize',
    '133': 'SetValue before initialize',
    '143': 'Commit before initialize',
    '201': 'Invalid argument',
    '301': 'Not implemented',
    '401': 'Content instance metadata error',
    '402': 'Objective with new ID',
    '403': 'Invalid location',
    '404': 'Already completed',
    '405': 'Not completed',
    '406': 'Invalid interaction index',
    '407': 'Invalid interaction type',
    '408': 'Invalid response pattern',
    '409': 'Invalid weighting',
    '410': 'Invalid debit account',
    '411': 'Invalid credit account',
    '412': 'Already debited',
  };

  function setError(code) {
    errorCode = String(code);
    return errorCode;
  }

  function clearError() {
    errorCode = '0';
    return '0';
  }

  // ---- Core API ----

  function Initialize() {
    if (terminated) { setError('123'); return 'false'; }
    var api = getAPI();
    if (!api) { setError('301'); return 'false'; }
    if (initialized) { setError('102'); return 'true'; }
    try {
      var result = api.Initialize('');
      if (result === 'true' || result === '0') {
        initialized = true;
        clearError();
        return 'true';
      }
      setError('101');
      return 'false';
    } catch(e) {
      setError('101');
      return 'false';
    }
  }

  function Terminate(param) {
    if (!initialized) { setError('104'); return 'false'; }
    if (terminated) { setError('112'); return 'true'; }
    var api = getAPI();
    if (!api) { setError('301'); return 'false'; }
    try {
      // Commit any pending data first
      api.Commit('');
      var result = api.Terminate(param || '');
      terminated = true;
      clearError();
      return 'true';
    } catch(e) {
      setError('111');
      return 'false';
    }
  }

  function GetValue(element) {
    if (!initialized) { setError('132'); return ''; }
    var api = getAPI();
    if (!api) { setError('301'); return ''; }
    try {
      var result = api.GetValue(element);
      var err = api.GetLastError();
      if (err !== '0' && err !== 0) {
        setError(err);
      } else {
        clearError();
      }
      return result !== undefined ? String(result) : '';
    } catch(e) {
      setError('301');
      return '';
    }
  }

  function SetValue(element, value) {
    if (!initialized) { setError('133'); return 'false'; }
    var api = getAPI();
    if (!api) { setError('301'); return 'false'; }
    try {
      var result = api.SetValue(element, String(value));
      var err = api.GetLastError();
      if (result === 'true' || result === '0') {
        clearError();
      } else {
        setError(err || '201');
      }
      return result;
    } catch(e) {
      setError('201');
      return 'false';
    }
  }

  function Commit(param) {
    if (!initialized) { setError('143'); return 'false'; }
    var api = getAPI();
    if (!api) { setError('301'); return 'false'; }
    try {
      var result = api.Commit(param || '');
      if (result === 'true' || result === '0') {
        clearError();
        return 'true';
      }
      setError('391');
      return 'false';
    } catch(e) {
      setError('391');
      return 'false';
    }
  }

  function GetLastError() { return errorCode; }
  function GetErrorString(code) { return ERROR_CODES[String(code)] || 'Unknown error'; }
  function GetDiagnostic(code) { return ERROR_CODES[String(code)] || 'Unknown diagnostic'; }

  // ---- Semantic helpers (not part of SCORM API but used by Pathfinder) ----

  function SaveLocation(slideId) {
    return SetValue('cmi.location', slideId);
  }

  function SaveScore(raw, min, max, scaled) {
    SetValue('cmi.score.raw', raw);
    if (min !== undefined) SetValue('cmi.score.min', min);
    if (max !== undefined) SetValue('cmi.score.max', max);
    if (scaled !== undefined) {
      SetValue('cmi.score.scaled', scaled);
    }
    Commit('');
  }

  function SaveCompletion(status) {
    SetValue('cmi.completion_status', status);
    Commit('');
  }

  function SaveSuccess(status) {
    SetValue('cmi.success_status', status);
    Commit('');
  }

  function SaveSuspendData(data) {
    var json = JSON.stringify(data);
    // SCORM 2004 limit: 64KB
    if (json.length > 64000) {
      console.warn('[SCORM] Suspend data exceeds 64KB limit, truncating');
      // Keep only essential state
      data = { _t: Date.now(), _r: 1 };
      json = JSON.stringify(data);
    }
    // base64 encode for safety
    try {
      var encoded = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, function(_, p) {
        return String.fromCharCode(parseInt(p, 16));
      }));
      SetValue('cmi.suspend_data', encoded);
    } catch(e) {
      console.warn('[SCORM] Failed to encode suspend data:', e);
      SetValue('cmi.suspend_data', '{}');
    }
    Commit('');
  }

  function LoadSuspendData() {
    var raw = GetValue('cmi.suspend_data');
    if (!raw) return {};
    try {
      var decoded = decodeURIComponent(Array.from(atob(raw), function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(decoded);
    } catch(e) {
      return {};
    }
  }

  function GetLearnerName() {
    return GetValue('cmi.learner_name');
  }

  function GetLearnerId() {
    return GetValue('cmi.learner_id');
  }

  // ---- Export ----

  global.SCORM2004Adapter = {
    Initialize, Terminate, GetValue, SetValue, Commit,
    GetLastError, GetErrorString, GetDiagnostic,
    SaveLocation, SaveScore, SaveCompletion, SaveSuccess,
    SaveSuspendData, LoadSuspendData,
    GetLearnerName, GetLearnerId,
    get initialized() { return initialized; },
    get terminated() { return terminated; },
    get errorCode() { return errorCode; },
  };

})(typeof globalThis !== 'undefined' ? globalThis : window);
`;

/**
 * SCORM 1.2 API adapter — simpler API than 2004, no sequencing.
 */
export const SCORM_12_ADAPTER = `/**
 * SCORM 1.2 API Adapter — Pathfinder Studio
 * Implements API wrapper with find, init, finish, GetValue, SetValue, Commit.
 * Key difference from 2004: no cmi.score.scaled, cmi.success_status,
 * and suspend_data limit is only 4KB.
 */

(function(global) {
  'use strict';

  var API = null;
  var initialized = false;
  var terminated = false;
  var errorCode = '0';

  function findAPI(win) {
    var attempts = 0;
    while (!win.API && win.parent && win.parent != win && attempts < 500) {
      attempts++;
      win = win.parent;
    }
    return win.API || null;
  }

  function getAPI() {
    if (API) return API;
    var findAttempts = 0;
    var current = window;
    while (current && findAttempts < 100) {
      if (current.API) { API = current.API; break; }
      if (!current.parent || current.parent === current) break;
      current = current.parent;
      findAttempts++;
    }
    return API;
  }

  var ERROR_CODES = {
    '0': 'No error',
    '101': 'General initialization failure',
    '102': 'Already initialized',
    '103': 'Instance Terminated',
    '201': 'Invalid argument value',
    '301': 'Not implemented',
    '401': 'Wrong data type',
    '402': 'Element not initialized',
  };

  function setError(code) { errorCode = String(code); return 'false'; }
  function clearError() { errorCode = '0'; return '0'; }

  function Initialize() {
    if (terminated) return setError('103');
    var api = getAPI();
    if (!api) return setError('301');
    if (initialized) return 'true';
    try {
      var result = api.LMSInitialize('');
      if (result === 'true') {
        initialized = true;
        clearError();
        return 'true';
      }
      return setError('101');
    } catch(e) { return setError('101'); }
  }

  function Terminate(param) {
    if (!initialized) { setError('201'); return 'false'; }
    if (terminated) return 'true';
    var api = getAPI();
    if (!api) return setError('301');
    try {
      api.LMSCommit('');
      api.LMSFinish(param || '');
      terminated = true;
      clearError();
      return 'true';
    } catch(e) { return setError('101'); }
  }

  function GetValue(element) {
    if (!initialized) { setError('402'); return ''; }
    var api = getAPI();
    if (!api) { setError('301'); return ''; }
    try {
      var result = api.LMSGetValue(element);
      var err = api.LMSGetLastError();
      if (err !== '0') setError(err);
      else clearError();
      return String(result || '');
    } catch(e) { setError('301'); return ''; }
  }

  function SetValue(element, value) {
    if (!initialized) { setError('402'); return 'false'; }
    var api = getAPI();
    if (!api) { setError('301'); return 'false'; }
    try {
      var result = api.LMSSetValue(element, String(value));
      if (result === 'true') clearError();
      else setError(api.LMSGetLastError() || '201');
      return result;
    } catch(e) { setError('201'); return 'false'; }
  }

  function Commit(param) {
    if (!initialized) return setError('402');
    var api = getAPI();
    if (!api) return setError('301');
    try { api.LMSCommit(param || ''); clearError(); return 'true'; }
    catch(e) { return setError('391'); }
  }

  function GetLastError() { return errorCode; }
  function GetErrorString(code) { return ERROR_CODES[String(code)] || 'Unknown error'; }
  function GetDiagnostic(code) { return ERROR_CODES[String(code)] || 'Unknown diagnostic'; }

  // ---- Semantic helpers ----

  function SaveLocation(slideId) {
    return SetValue('cmi.core.lesson_location', slideId);
  }

  function SaveScore(raw, min, max) {
    SetValue('cmi.core.score.raw', raw);
    if (min !== undefined) SetValue('cmi.core.score.min', min);
    if (max !== undefined) SetValue('cmi.core.score.max', max);
    Commit('');
  }

  function SaveCompletion(status) {
    SetValue('cmi.core.lesson_status', status);
    Commit('');
  }

  function SaveSuspendData(data) {
    var json = JSON.stringify(data);
    // SCORM 1.2 limit: 4KB (4096 bytes) — much stricter than 2004
    if (json.length > 4000) {
      console.warn('[SCORM 1.2] Suspend data exceeds 4KB limit. Consider SCORM 2004 for courses with complex state.');
      // Truncate
      json = json.substring(0, 4000);
    }
    try {
      var encoded = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, function(_, p) {
        return String.fromCharCode(parseInt(p, 16));
      }));
      SetValue('cmi.suspend_data', encoded);
    } catch(e) {
      SetValue('cmi.suspend_data', '{}');
    }
    Commit('');
  }

  function LoadSuspendData() {
    var raw = GetValue('cmi.suspend_data');
    if (!raw) return {};
    try {
      var decoded = decodeURIComponent(Array.from(atob(raw), function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(decoded);
    } catch(e) { return {}; }
  }

  function GetLearnerName() { return GetValue('cmi.core.learner_name'); }
  function GetLearnerId() { return GetValue('cmi.core.student_id'); }

  global.SCORM12Adapter = {
    Initialize, Terminate, GetValue, SetValue, Commit,
    GetLastError, GetErrorString, GetDiagnostic,
    SaveLocation, SaveScore, SaveCompletion, SaveSuspendData, LoadSuspendData,
    GetLearnerName, GetLearnerId,
    get initialized() { return initialized; },
    get terminated() { return terminated; },
  };

})(typeof globalThis !== 'undefined' ? globalThis : window);
`;

/**
 * xAPI adapter — generates xAPI statements for ADL xAPI 1.0.
 */
export const XAPI_ADAPTER = `/**
 * xAPI Adapter — Pathfinder Studio
 * Generates xAPI 1.0 statements for all course interactions.
 * Batches statements and flushes on terminate.
 */

(function(global) {
  'use strict';

  var config = {
    endpoint: null,
    auth: null,
    activityId: null,
    agent: null,
    batchSize: 10,
    retryDelay: 1000,
    maxRetries: 3,
  };

  var queue = [];
  var inFlight = 0;
  var activity = null;

  function configure(cfg) {
    Object.assign(config, cfg);
  }

  function createUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function createStatement(verb, object, result, context) {
    return {
      actor: config.agent || { mbox: 'mailto:unknown@learner.example.com', name: 'Anonymous Learner' },
      verb: {
        id: verb,
        display: { 'en-US': verb.split('/').pop() }
      },
      object: object,
      result: result || {},
      context: context || {},
      timestamp: new Date().toISOString(),
      id: createUUID(),
    };
  }

  function sendBatch() {
    if (inFlight >= config.batchSize || queue.length === 0) return;
    var batch = queue.splice(0, config.batchSize);
    inFlight += batch.length;
    var body = JSON.stringify(batch);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', config.endpoint + '/statements', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (config.auth) xhr.setRequestHeader('Authorization', config.auth);
    xhr.withCredentials = false;

    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        inFlight -= batch.length;
        if (xhr.status === 200 || xhr.status === 0) {
          // OK
        } else {
          // Re-queue failed items
          queue.unshift(...batch);
          setTimeout(sendBatch, config.retryDelay);
        }
        if (queue.length > 0) sendBatch();
      }
    };

    xhr.send(body);
  }

  function sendStatement(verb, object, result, context) {
    var stmt = createStatement(verb, object, result, context);
    queue.push(stmt);
    sendBatch();
    return stmt.id;
  }

  function sendVerb(verb, object, result) {
    return sendStatement(verb, object, result);
  }

  function terminate() {
    // Flush remaining statements synchronously
    while (queue.length > 0) {
      var batch = queue.splice(0, config.batchSize);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', config.endpoint + '/statements', false); // sync
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (config.auth) xhr.setRequestHeader('Authorization', config.auth);
      xhr.send(JSON.stringify(batch));
    }
  }

  // ---- Convenience verbs ----

  function initialized() {
    sendVerb('http://adlnet.gov/expapi/verbs/initialized', {
      id: config.activityId,
      definition: { name: { 'en-US': 'Course' }, type: 'http://adlnet.gov/expapi/activities/course' }
    });
  }

  function completed(duration) {
    sendVerb('http://adlnet.gov/expapi/verbs/completed', {
      id: config.activityId,
      definition: { name: { 'en-US': 'Course' }, type: 'http://adlnet.gov/expapi/activities/course' }
    }, { duration: duration ? 'PT' + Math.round(duration) + 'S' : undefined });
  }

  function passed(score, duration) {
    sendVerb('http://adlnet.gov/expapi/verbs/passed', {
      id: config.activityId,
      definition: { name: { 'en-US': 'Course' }, type: 'http://adlnet.gov/expapi/activities/course' }
    }, { score: { scaled: score }, duration: duration ? 'PT' + Math.round(duration) + 'S' : undefined });
  }

  function failed(score, duration) {
    sendVerb('http://adlnet.gov/expapi/verbs/failed', {
      id: config.activityId,
      definition: { name: { 'en-US': 'Course' }, type: 'http://adlnet.gov/expapi/activities/course' }
    }, { score: { scaled: score }, duration: duration ? 'PT' + Math.round(duration) + 'S' : undefined });
  }

  function answered(questionId, correct, response, score) {
    sendVerb('http://adlnet.gov/expapi/verbs/answered', {
      id: questionId,
      definition: { type: 'http://adlnet.gov/expapi/activities/cmi.interaction' }
    }, {
      success: correct,
      response: String(response),
      score: score !== undefined ? { scaled: score } : undefined
    });
  }

  function experienced(slideId) {
    sendVerb('http://adlnet.gov/expapi/verbs/experienced', {
      id: slideId,
      definition: { type: 'http://adlnet.gov/expapi/activities/slide' }
    });
  }

  global.XAPIAdapter = {
    configure, sendStatement, terminate,
    initialized, completed, passed, failed, answered, experienced,
  };

})(typeof globalThis !== 'undefined' ? globalThis : window);
`;
