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
  }

  // ---- Lifecycle ----

  PathfinderRuntime.prototype.start = function() {
    this._renderCurrentSlide();
    this._emit('slidechange', this.getCurrentSlideId(), this.currentIndex, this.slideIds.length);
  };

  // ---- Navigation ----

  PathfinderRuntime.prototype.navigateNext = function() {
    if (this.currentIndex < this.slideIds.length - 1) {
      this.currentIndex++;
      this._renderCurrentSlide();
      this._emit('slidechange', this.getCurrentSlideId(), this.currentIndex, this.slideIds.length);
    }
  };

  PathfinderRuntime.prototype.navigatePrev = function() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this._renderCurrentSlide();
      this._emit('slidechange', this.getCurrentSlideId(), this.currentIndex, this.slideIds.length);
    }
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
    this.variables[name] = value;
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

    this._attachTriggerListeners(wrapper, slide);

    this.container.appendChild(wrapper);
    this.currentSlideEl = wrapper;
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
        self._executeAction(triggered[j].action);
      }
    });
  };

  PathfinderRuntime.prototype._executeAction = function(action) {
    if (!action || !action.type) return;
    switch (action.type) {
      case 'jumpToSlide': {
        var idx = this.slideIds.indexOf(action.target);
        if (idx >= 0) {
          this.currentIndex = idx;
          this._renderCurrentSlide();
          this._emit('slidechange', this.getCurrentSlideId(), this.currentIndex, this.slideIds.length);
        }
        return;
      }
      case 'setVariable':
        this.variables[action.target] = action.value;
        return;
      case 'navigateNext':
        this.navigateNext();
        return;
      case 'navigatePrev':
      case 'navigateBack':
        this.navigatePrev();
        return;
    }
  };

  global.PathfinderRuntime = PathfinderRuntime;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
`;
