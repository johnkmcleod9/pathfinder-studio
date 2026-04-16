/**
 * Pathfinder browser runtime — embedded as a JS string into every published
 * package as `pathfinder-runtime.js`. Self-contained: no imports, no
 * bundler step. Wraps itself in an IIFE that installs
 * `globalThis.PathfinderRuntime`.
 *
 * Contract (matches what the packager's emitted index.html and player
 * shell already call):
 *
 *   var rt = new PathfinderRuntime({ course, container, lmsAdapter? });
 *   rt.start();                            // render entry slide, emit slidechange
 *   rt.navigateNext();                     // advance one slide
 *   rt.navigatePrev();                     // go back one slide
 *   rt.on('slidechange', cb);              // cb(slideId, idx, total)
 *   rt.off('slidechange', cb);
 *   rt.getCurrentSlideId();
 *   rt.getVariable(name); rt.setVariable(name, value);
 *
 * Renders objects (text/button/image/video/audio/shape) with absolute
 * positioning from `rect[x,y,w,h]`. Substitutes %VarName% placeholders
 * in text content. Executes per-object click triggers (`jumpToSlide`,
 * `setVariable`, `navigateNext`, `navigatePrev`).
 *
 * The TypeScript runtime in src/runtime/* covers richer scenarios
 * (quiz state, conditional branches, media controller). This browser
 * runtime is the minimum needed for a published package to actually
 * boot and work in a browser.
 */

export const BROWSER_RUNTIME = `/* Pathfinder Browser Runtime */
(function(global) {
  'use strict';

  function PathfinderRuntime(opts) {
    opts = opts || {};
    this.course = opts.course || {};
    this.container = opts.container;
    this.lmsAdapter = opts.lmsAdapter || null;
    this.listeners = {};
    this.variables = {};
    this.currentIndex = 0;
    this.currentSlideEl = null;

    // Quiz state — answers buffered per question until submitQuiz is fired.
    this.quizAnswers = {};
    this.lastQuizScore = null;

    var nav = this.course.navigation || {};
    this.slideIds = (nav.slides || []).slice();
    if (nav.entry) {
      var idx = this.slideIds.indexOf(nav.entry);
      this.currentIndex = idx >= 0 ? idx : 0;
    }

    // Initialize variable store from declared defaults.
    var vars = this.course.variables || {};
    for (var name in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        var v = vars[name];
        this.variables[name] = (v && 'default' in v) ? v.default : null;
      }
    }

    // Per-slide layer visibility — keyed by slide id, value is a map of
    // layerId → bool.  Reset whenever we enter a slide so layers return
    // to their declared initial visibility.
    this.layerVisibility = {};

    // Session-time tracking — start the clock the moment the runtime
    // is constructed (not at start()) so a learner who downloads the
    // package and watches it slow-load still gets credit for the wait.
    this.sessionStartTime = Date.now();
    this.terminated = false;

    // Build a question lookup so quiz objects can resolve their question by id.
    this.questionsById = {};
    var quiz = this.course.quiz;
    if (quiz && quiz.questions) {
      for (var qi = 0; qi < quiz.questions.length; qi++) {
        var qq = quiz.questions[qi];
        if (qq && qq.id) this.questionsById[qq.id] = qq;
      }
    }
  }

  // ---- Lifecycle ----

  PathfinderRuntime.prototype.start = function() {
    this._restoreFromLms();
    this._renderCurrentSlide();
    this._emit('slidechange', this.getCurrentSlideId(), this.currentIndex, this.slideIds.length);
  };

  // ---- Resume / suspend-data ----

  PathfinderRuntime.prototype._restoreFromLms = function() {
    if (!this.lmsAdapter || typeof this.lmsAdapter.LoadSuspendData !== 'function') return;
    var state;
    try {
      state = this.lmsAdapter.LoadSuspendData();
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[PathfinderRuntime] LoadSuspendData threw:', e);
      }
      return;
    }
    if (!state || typeof state !== 'object') return;

    // Restore current slide if it still exists in the course.
    if (typeof state.slide === 'string') {
      var idx = this.slideIds.indexOf(state.slide);
      if (idx >= 0) this.currentIndex = idx;
    }

    // Restore variable values (overrides declared defaults).
    if (state.variables && typeof state.variables === 'object') {
      for (var k in state.variables) {
        if (Object.prototype.hasOwnProperty.call(state.variables, k)) {
          this.variables[k] = state.variables[k];
        }
      }
    }

    // Restore last quiz score so re-entering shows the prior result.
    if (state.lastQuizScore && typeof state.lastQuizScore === 'object') {
      this.lastQuizScore = state.lastQuizScore;
    }
  };

  PathfinderRuntime.prototype.saveProgress = function() {
    if (!this.lmsAdapter || typeof this.lmsAdapter.SaveSuspendData !== 'function') return;
    var snapshot = {
      _v: 1,
      slide: this.getCurrentSlideId(),
      variables: this.variables,
      lastQuizScore: this.lastQuizScore,
    };
    try {
      this.lmsAdapter.SaveSuspendData(snapshot);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[PathfinderRuntime] SaveSuspendData threw:', e);
      }
    }
  };

  PathfinderRuntime.prototype._persistLocation = function() {
    if (!this.lmsAdapter) return;
    if (typeof this.lmsAdapter.SaveLocation === 'function') {
      try { this.lmsAdapter.SaveLocation(this.getCurrentSlideId()); } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[PathfinderRuntime] SaveLocation threw:', e);
        }
      }
    }
    this.saveProgress();
  };

  // ---- Navigation ----

  PathfinderRuntime.prototype.navigateNext = function() {
    if (this.currentIndex < this.slideIds.length - 1) {
      this._resetLayerVisibility(this.getCurrentSlideId());
      this.currentIndex++;
      this._renderCurrentSlide();
      this._persistLocation();
      this._emit('slidechange', this.getCurrentSlideId(), this.currentIndex, this.slideIds.length);
    }
  };

  PathfinderRuntime.prototype.navigatePrev = function() {
    if (this.currentIndex > 0) {
      this._resetLayerVisibility(this.getCurrentSlideId());
      this.currentIndex--;
      this._renderCurrentSlide();
      this._persistLocation();
      this._emit('slidechange', this.getCurrentSlideId(), this.currentIndex, this.slideIds.length);
    }
  };

  // ---- Session time / termination ----

  PathfinderRuntime.prototype.getSessionTime = function() {
    return Date.now() - this.sessionStartTime;
  };

  // Push final state to the LMS and end the session. Idempotent —
  // a second call is a no-op so accidental double-bind on browser
  // unload doesn't double-write.
  PathfinderRuntime.prototype.terminate = function() {
    if (this.terminated) return;
    this.terminated = true;

    var elapsedMs = this.getSessionTime();

    // Flush latest state first so the suspend payload reflects the
    // exact moment of exit.
    this.saveProgress();

    if (this.lmsAdapter) {
      if (typeof this.lmsAdapter.SaveSessionTime === 'function') {
        try { this.lmsAdapter.SaveSessionTime(elapsedMs); } catch (e) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[PathfinderRuntime] SaveSessionTime threw:', e);
          }
        }
      }
      if (typeof this.lmsAdapter.Terminate === 'function') {
        try { this.lmsAdapter.Terminate(''); } catch (e) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[PathfinderRuntime] Terminate threw:', e);
          }
        }
      }
    }

    this._emit('sessionend', { durationMs: elapsedMs });
  };

  PathfinderRuntime.prototype.getCurrentSlideId = function() {
    return this.slideIds[this.currentIndex];
  };

  PathfinderRuntime.prototype._getSlide = function(id) {
    var slides = this.course.slides || [];
    for (var i = 0; i < slides.length; i++) {
      if (slides[i] && slides[i].id === id) return slides[i];
    }
    return null;
  };

  // ---- Variables ----

  PathfinderRuntime.prototype.getVariable = function(name) {
    return this.variables[name];
  };

  PathfinderRuntime.prototype.setVariable = function(name, value) {
    var prev = this.variables[name];
    this.variables[name] = value;
    if (prev !== value) {
      this._pushVarToLms(name, value);
    }
    this.saveProgress();
    // Variable change may flip an object's conditional visibility.
    // Cheap correctness win: re-render whenever a value actually
    // changed. (No-op when the same value is re-set.)
    if (prev !== value && this.currentSlideEl) {
      this._renderCurrentSlide();
    }
  };

  // Push a single variable value to the LMS gradebook when the
  // course author has opted in (exportToLMS=true + lmsMapping.key).
  // No-ops gracefully when adapter is missing or lacks SetValue.
  PathfinderRuntime.prototype._pushVarToLms = function(name, value) {
    var vars = this.course.variables || {};
    var def = vars[name];
    if (!def || !def.exportToLMS) return;
    if (!def.lmsMapping || !def.lmsMapping.key) return;
    if (!this.lmsAdapter || typeof this.lmsAdapter.SetValue !== 'function') return;

    // SCORM data model values are strings — coerce via String() so
    // booleans become 'true'/'false' and numbers become decimal strings.
    var serialized = (value === null || value === undefined) ? '' : String(value);
    try {
      this.lmsAdapter.SetValue(def.lmsMapping.key, serialized);
      if (typeof this.lmsAdapter.Commit === 'function') {
        this.lmsAdapter.Commit('');
      }
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[PathfinderRuntime] LMS push failed for ' + name + ':', e);
      }
    }
  };

  // ---- Pub/sub ----

  PathfinderRuntime.prototype.on = function(event, cb) {
    if (typeof cb !== 'function') return;
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  };

  PathfinderRuntime.prototype.off = function(event, cb) {
    var arr = this.listeners[event];
    if (!arr) return;
    var idx = arr.indexOf(cb);
    if (idx >= 0) arr.splice(idx, 1);
  };

  PathfinderRuntime.prototype._emit = function(event /*, ...args */) {
    var args = Array.prototype.slice.call(arguments, 1);
    var subs = (this.listeners[event] || []).slice();
    for (var i = 0; i < subs.length; i++) {
      try { subs[i].apply(null, args); } catch (e) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[PathfinderRuntime] listener for "' + event + '" threw:', e);
        }
      }
    }
  };

  // ---- Rendering ----

  PathfinderRuntime.prototype._renderCurrentSlide = function() {
    if (!this.container) return;

    if (this.currentSlideEl && this.currentSlideEl.parentNode) {
      this.currentSlideEl.parentNode.removeChild(this.currentSlideEl);
    }
    this.currentSlideEl = null;

    var slide = this._getSlide(this.getCurrentSlideId());
    if (!slide) return;

    var canvas = this.course.canvas || { width: 1280, height: 720 };
    var wrapper = document.createElement('div');
    wrapper.setAttribute('data-slide-id', slide.id);
    wrapper.className = 'pf-slide';
    wrapper.style.position = 'relative';
    wrapper.style.width = canvas.width + 'px';
    wrapper.style.height = canvas.height + 'px';
    wrapper.style.overflow = 'hidden';
    wrapper.style.background = this._renderBackground(slide.background);

    var objects = slide.objects || [];
    for (var i = 0; i < objects.length; i++) {
      var el = this._renderObject(objects[i]);
      if (el) wrapper.appendChild(el);
    }

    // Render each currently-visible layer's objects on top of the base.
    var slideLayerVis = this._slideLayerVisibility(slide);
    var layers = slide.layers || [];
    for (var li = 0; li < layers.length; li++) {
      var layer = layers[li];
      if (!layer || !slideLayerVis[layer.id]) continue;
      var layerObjects = layer.objects || [];
      for (var lj = 0; lj < layerObjects.length; lj++) {
        var lel = this._renderObject(layerObjects[lj]);
        if (lel) {
          lel.setAttribute('data-layer-id', layer.id);
          wrapper.appendChild(lel);
        }
      }
    }

    this._attachTriggerListeners(wrapper, slide);

    this.container.appendChild(wrapper);
    this.currentSlideEl = wrapper;
  };

  // ---- Layers ----

  // Per-slide layer visibility map. Lazily seeded from each layer's
  // declared visible flag the first time the slide is rendered.
  // Reset on slide navigation (see _resetLayerVisibility) so layers
  // return to their declared initial state on re-entry.
  PathfinderRuntime.prototype._slideLayerVisibility = function(slide) {
    var sid = slide.id;
    if (!this.layerVisibility[sid]) {
      this.layerVisibility[sid] = {};
      var layers = slide.layers || [];
      for (var i = 0; i < layers.length; i++) {
        if (layers[i] && layers[i].id) {
          this.layerVisibility[sid][layers[i].id] = layers[i].visible !== false;
        }
      }
    }
    return this.layerVisibility[sid];
  };

  PathfinderRuntime.prototype.isLayerVisible = function(layerId) {
    var slide = this._getSlide(this.getCurrentSlideId());
    if (!slide) return false;
    var vis = this._slideLayerVisibility(slide);
    return vis[layerId] === true;
  };

  PathfinderRuntime.prototype.showLayer = function(layerId) {
    this._setLayerVisibility(layerId, true);
  };

  PathfinderRuntime.prototype.hideLayer = function(layerId) {
    this._setLayerVisibility(layerId, false);
  };

  // Forget the visibility map for a slide so the next entry re-seeds
  // from the declared visible flags. Called when navigating away.
  PathfinderRuntime.prototype._resetLayerVisibility = function(slideId) {
    if (slideId && this.layerVisibility[slideId]) {
      delete this.layerVisibility[slideId];
    }
  };

  PathfinderRuntime.prototype._setLayerVisibility = function(layerId, visible) {
    var slide = this._getSlide(this.getCurrentSlideId());
    if (!slide) return;
    var layers = slide.layers || [];
    var found = false;
    for (var i = 0; i < layers.length; i++) {
      if (layers[i] && layers[i].id === layerId) { found = true; break; }
    }
    if (!found) return;
    var vis = this._slideLayerVisibility(slide);
    if (vis[layerId] === visible) return;
    vis[layerId] = visible;
    this._renderCurrentSlide();
  };

  PathfinderRuntime.prototype._renderBackground = function(bg) {
    if (!bg) return '#FFFFFF';
    if (bg.type === 'solid') return bg.color || '#FFFFFF';
    if (bg.type === 'gradient' && bg.stops && bg.stops.length) {
      var angle = bg.angle != null ? bg.angle : 90;
      var stops = bg.stops.map(function(s) {
        return s.color + (s.offset != null ? ' ' + (s.offset * 100) + '%' : '');
      }).join(', ');
      return 'linear-gradient(' + angle + 'deg, ' + stops + ')';
    }
    return '#FFFFFF';
  };

  PathfinderRuntime.prototype._renderObject = function(obj) {
    if (!obj || !obj.rect) return null;
    if (!this._isObjectVisible(obj)) return null;
    var x = obj.rect[0], y = obj.rect[1], w = obj.rect[2], h = obj.rect[3];
    var content = this._substitute(obj.content == null ? '' : String(obj.content));
    var el;

    switch (obj.type) {
      case 'text':
        el = document.createElement('div');
        el.innerHTML = content;
        break;
      case 'button':
        el = document.createElement('button');
        el.textContent = content;
        break;
      case 'image':
        el = document.createElement('img');
        el.setAttribute('src', obj.src || '');
        el.setAttribute('alt', obj.altText || '');
        el.setAttribute('loading', 'lazy');
        break;
      case 'video':
        el = document.createElement('video');
        el.setAttribute('src', obj.src || '');
        el.setAttribute('controls', '');
        el.setAttribute('preload', 'metadata');
        break;
      case 'audio':
        el = document.createElement('audio');
        el.setAttribute('src', obj.src || '');
        el.setAttribute('controls', '');
        el.setAttribute('preload', 'metadata');
        break;
      case 'quiz':
        el = this._renderQuizQuestion(obj);
        if (!el) return null;
        break;
      case 'shape':
      default:
        el = document.createElement('div');
        if (content) el.innerHTML = content;
    }

    el.setAttribute('data-object-id', obj.id);
    el.style.position = 'absolute';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    this._applyStyle(el, obj.style || {});

    return el;
  };

  PathfinderRuntime.prototype._applyStyle = function(el, style) {
    if (!style) return;
    if (style.fontSize) el.style.fontSize = style.fontSize + (typeof style.fontSize === 'number' ? 'px' : '');
    if (style.fontFamily) el.style.fontFamily = String(style.fontFamily);
    if (style.fontWeight) el.style.fontWeight = String(style.fontWeight);
    if (style.color) el.style.color = String(style.color);
    if (style.textAlign) el.style.textAlign = String(style.textAlign);
    if (style.backgroundColor) el.style.backgroundColor = String(style.backgroundColor);
    if (style.lineHeight) el.style.lineHeight = String(style.lineHeight);
    if (style.opacity != null) el.style.opacity = String(style.opacity);
  };

  PathfinderRuntime.prototype._substitute = function(text) {
    if (!text || typeof text !== 'string') return text;
    var self = this;
    return text.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, function(_, name) {
      var v = self.variables[name];
      return v == null ? '' : String(v);
    });
  };

  // ---- Triggers ----

  PathfinderRuntime.prototype._attachTriggerListeners = function(wrapper, slide) {
    var triggers = slide.triggers || [];
    var clickTriggers = {};
    for (var i = 0; i < triggers.length; i++) {
      var t = triggers[i];
      if (!t || !t.event) continue;
      if (t.event.type === 'userClick' && t.source) {
        if (!clickTriggers[t.source]) clickTriggers[t.source] = [];
        clickTriggers[t.source].push(t);
      }
    }
    if (Object.keys(clickTriggers).length === 0) return;

    var self = this;
    wrapper.addEventListener('click', function(e) {
      var target = e.target;
      // walk up to nearest [data-object-id]
      while (target && target !== wrapper) {
        if (target.getAttribute && target.getAttribute('data-object-id')) break;
        target = target.parentNode;
      }
      if (!target || target === wrapper) return;
      var objectId = target.getAttribute('data-object-id');
      var triggered = clickTriggers[objectId] || [];
      for (var j = 0; j < triggered.length; j++) {
        var t = triggered[j];
        if (!self._conditionsPass(t.conditions)) continue;
        self._executeAction(t.action);
      }
    });
  };

  // ---- Trigger condition evaluation ----

  // Returns true when every condition in the array passes (AND).
  // Returns true for missing / empty arrays so triggers without
  // conditions fire unconditionally — preserves backwards
  // compatibility with packages compiled before this change.
  PathfinderRuntime.prototype._conditionsPass = function(conditions) {
    if (!conditions || !conditions.length) return true;
    for (var i = 0; i < conditions.length; i++) {
      if (!this._evalCondition(conditions[i])) return false;
    }
    return true;
  };

  // Evaluate object visibility from its declared shape:
  //   { initial: 'visible'|'hidden', conditional: [{conditions[], then}, ...] }
  // First matching rule wins; falls back to initial when no rule matches.
  // Objects with no visibility field are always visible.
  PathfinderRuntime.prototype._isObjectVisible = function(obj) {
    var v = obj && obj.visibility;
    if (!v) return true;
    var rules = v.conditional || [];
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (this._conditionsPass(rule.conditions)) {
        return rule.then !== 'hidden';
      }
    }
    return v.initial !== 'hidden';
  };

  PathfinderRuntime.prototype._evalCondition = function(cond) {
    if (!cond || !cond.type) return false;
    switch (cond.type) {
      case 'variableEquals': {
        var v = this.variables[cond.variable];
        return v === cond.value;
      }
      case 'variableGreaterThan': {
        var n = Number(this.variables[cond.variable]);
        var t = Number(cond.value);
        if (isNaN(n) || isNaN(t)) return false;
        return n > t;
      }
      case 'variableLessThan': {
        var n2 = Number(this.variables[cond.variable]);
        var t2 = Number(cond.value);
        if (isNaN(n2) || isNaN(t2)) return false;
        return n2 < t2;
      }
      case 'scoreGreaterThan': {
        if (!this.lastQuizScore) return false;
        return this.lastQuizScore.percent > cond.scoreThreshold;
      }
      case 'scoreLessThan': {
        if (!this.lastQuizScore) return false;
        return this.lastQuizScore.percent < cond.scoreThreshold;
      }
      default:
        // Unknown condition type — fail-safe to false so an unrecognised
        // condition cannot silently approve an action.
        return false;
    }
  };

  PathfinderRuntime.prototype._executeAction = function(action) {
    if (!action || !action.type) return;
    switch (action.type) {
      case 'jumpToSlide': {
        var idx = this.slideIds.indexOf(action.target);
        if (idx >= 0) {
          this._resetLayerVisibility(this.getCurrentSlideId());
          this.currentIndex = idx;
          this._renderCurrentSlide();
          this._persistLocation();
          this._emit('slidechange', this.getCurrentSlideId(), this.currentIndex, this.slideIds.length);
        }
        return;
      }
      case 'showLayer':
        this.showLayer(action.target);
        return;
      case 'hideLayer':
        this.hideLayer(action.target);
        return;
      case 'setVariable':
        this.setVariable(action.target, action.value);
        return;
      case 'navigateNext':
        this.navigateNext();
        return;
      case 'navigatePrev':
      case 'navigateBack':
        this.navigatePrev();
        return;
      case 'submitQuiz':
        this._submitQuiz();
        return;
    }
  };

  // ---- Quiz ----

  PathfinderRuntime.prototype.getQuizScore = function() {
    return this.lastQuizScore;
  };

  PathfinderRuntime.prototype._renderQuizQuestion = function(obj) {
    var question = this.questionsById[obj.questionId];
    if (!question) return null;
    var self = this;
    var root = document.createElement('div');
    root.setAttribute('data-question-id', question.id);

    var stem = document.createElement('div');
    stem.className = 'pf-question-text';
    stem.textContent = this._substitute(String(question.text || ''));
    root.appendChild(stem);

    var listEl = document.createElement('div');
    listEl.className = 'pf-question-options';

    if (question.type === 'multiple_choice' || question.type === 'true_false') {
      var radioName = 'pf-q-' + question.id;
      var opts = question.options || [];
      for (var i = 0; i < opts.length; i++) {
        var opt = opts[i];
        var label = document.createElement('label');
        label.style.display = 'block';
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = radioName;
        input.value = opt.id;
        input.addEventListener('change', (function(qid, oid) {
          return function() { self.quizAnswers[qid] = oid; };
        })(question.id, opt.id));
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + (opt.label || opt.text || opt.id)));
        listEl.appendChild(label);
      }
    } else if (question.type === 'multiple_response') {
      var optsM = question.options || [];
      for (var j = 0; j < optsM.length; j++) {
        var optM = optsM[j];
        var labelM = document.createElement('label');
        labelM.style.display = 'block';
        var inputM = document.createElement('input');
        inputM.type = 'checkbox';
        inputM.value = optM.id;
        inputM.addEventListener('change', (function(qid, oid) {
          return function(e) {
            var arr = self.quizAnswers[qid];
            if (!Array.isArray(arr)) arr = [];
            var idx = arr.indexOf(oid);
            if (e.target.checked && idx < 0) arr.push(oid);
            if (!e.target.checked && idx >= 0) arr.splice(idx, 1);
            self.quizAnswers[qid] = arr;
          };
        })(question.id, optM.id));
        labelM.appendChild(inputM);
        labelM.appendChild(document.createTextNode(' ' + (optM.label || optM.text || optM.id)));
        listEl.appendChild(labelM);
      }
    } else if (question.type === 'fill_blank' || question.type === 'numeric') {
      var input2 = document.createElement('input');
      input2.type = 'text';
      input2.addEventListener('input', (function(qid) {
        return function(e) { self.quizAnswers[qid] = e.target.value; };
      })(question.id));
      listEl.appendChild(input2);
    }

    root.appendChild(listEl);
    return root;
  };

  PathfinderRuntime.prototype._submitQuiz = function() {
    var quiz = this.course.quiz;
    if (!quiz || !quiz.questions || quiz.questions.length === 0) return;

    var raw = 0;
    var possible = 0;
    for (var i = 0; i < quiz.questions.length; i++) {
      var q = quiz.questions[i];
      possible += (q.points || 0);
      if (this._isCorrect(q, this.quizAnswers[q.id])) {
        raw += (q.points || 0);
      }
    }
    var percent = possible > 0 ? Math.round((raw / possible) * 1000) / 10 : 0;
    var passing = (typeof quiz.passingScore === 'number') ? quiz.passingScore : 0;
    var passed = percent >= passing;
    var score = {
      raw: raw,
      possible: possible,
      percent: percent,
      passed: passed,
      status: passed ? 'passed' : 'failed',
    };
    this.lastQuizScore = score;

    // Forward to LMS adapter if it exposes the SCORM-style helpers.
    if (this.lmsAdapter) {
      try {
        if (typeof this.lmsAdapter.SaveScore === 'function') {
          var scaled = possible > 0 ? raw / possible : 0;
          this.lmsAdapter.SaveScore(raw, 0, possible, scaled);
        }
        if (typeof this.lmsAdapter.SaveCompletion === 'function') {
          this.lmsAdapter.SaveCompletion(passed ? 'passed' : 'failed');
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[PathfinderRuntime] LMS adapter threw on quiz submit:', e);
        }
      }
    }

    this._emit('quizcomplete', score);
  };

  PathfinderRuntime.prototype._isCorrect = function(question, response) {
    if (response === undefined || response === null) return false;
    switch (question.type) {
      case 'multiple_choice':
      case 'true_false': {
        var correct = (question.options || []).filter(function(o) { return o.isCorrect; })[0];
        return correct ? correct.id === response : false;
      }
      case 'multiple_response': {
        if (!Array.isArray(response)) return false;
        var correctIds = (question.options || [])
          .filter(function(o) { return o.isCorrect; })
          .map(function(o) { return o.id; })
          .sort();
        var picked = response.slice().sort();
        if (picked.length !== correctIds.length) return false;
        for (var k = 0; k < picked.length; k++) {
          if (picked[k] !== correctIds[k]) return false;
        }
        return true;
      }
      case 'fill_blank': {
        var expected = String(question.correctAnswer || '');
        var actual = String(response);
        if (question.caseSensitive) return actual.trim() === expected.trim();
        return actual.trim().toLowerCase() === expected.trim().toLowerCase();
      }
      case 'numeric': {
        var num = parseFloat(String(response));
        var target = parseFloat(String(question.correctAnswer));
        if (isNaN(num) || isNaN(target)) return false;
        var tol = (typeof question.tolerance === 'number') ? question.tolerance : 0;
        return Math.abs(num - target) <= tol;
      }
      default:
        return false;
    }
  };

  global.PathfinderRuntime = PathfinderRuntime;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
`;
