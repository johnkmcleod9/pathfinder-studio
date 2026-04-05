import { describe, it, expect } from 'vitest';
import { validate } from '../../src/validator.js';

const BASE_SLIDE = {
  id: 'slide-001',
  background: { type: 'solid', color: '#FFFFFF' },
  zOrder: ['obj-1'],
  objects: {
    'obj-1': { type: 'text', rect: { x: 0, y: 0, w: 100, h: 100 }, content: 'Hello' }
  }
};

function makeSlide(overrides: Record<string, unknown> = {}): unknown {
  return { ...BASE_SLIDE, ...overrides };
}

describe('Slide Schema', () => {
  describe('Background types', () => {
    it('accepts solid background', () => {
      expect(validate('slide', makeSlide({ background: { type: 'solid', color: '#FF0000' } })).valid).toBe(true);
    });

    it('accepts gradient background', () => {
      expect(validate('slide', makeSlide({
        background: {
          type: 'gradient',
          gradient: {
            type: 'linear',
            angle: 45,
            stops: [
              { color: '#000000', position: 0 },
              { color: '#FFFFFF', position: 1 }
            ]
          }
        }
      })).valid).toBe(true);
    });

    it('accepts image background', () => {
      expect(validate('slide', makeSlide({
        background: { type: 'image', media: { id: 'bg1', src: 'media/bg.png' } }
      })).valid).toBe(true);
    });

    it('accepts video background', () => {
      expect(validate('slide', makeSlide({
        background: { type: 'video', media: { id: 'vid1', src: 'media/intro.mp4' } }
      })).valid).toBe(true);
    });

    it('rejects invalid background type', () => {
      const result = validate('slide', makeSlide({ background: { type: 'invalid' } }));
      expect(result.valid).toBe(false);
    });
  });

  describe('All object types', () => {
    const objectTypes = ['text', 'button', 'shape', 'image', 'video', 'audio', 'hotspot', 'drag-drop', 'slider', 'text-entry', 'result', 'character'];

    for (const objType of objectTypes) {
      it(`accepts "${objType}" object type`, () => {
        const base = { type: objType, rect: { x: 0, y: 0, w: 100, h: 100 } };
        const obj = objType === 'text'       ? { ...base, content: 'Hello' } :
                    objType === 'button'     ? { ...base, label: 'Click me' } :
                    objType === 'shape'      ? { ...base, shapeType: 'rectangle' } :
                    objType === 'image'      ? { ...base, media: { id: 'img1', src: 'media/img.png' } } :
                    objType === 'video'      ? { ...base, media: { id: 'vid1', src: 'media/vid.mp4' } } :
                    objType === 'audio'      ? { ...base, media: { id: 'aud1', src: 'media/aud.mp3' } } :
                    objType === 'hotspot'    ? base :
                    objType === 'drag-drop'  ? { ...base, dropZones: [] } :
                    objType === 'slider'     ? { ...base, variable: 'mySlider' } :
                    objType === 'text-entry' ? { ...base, variable: 'myEntry' } :
                    objType === 'result'     ? base :
                    objType === 'character'  ? { ...base, characterId: 'char-1' } :
                    base;

        const result = validate('slide', makeSlide({ objects: { [`obj-${objType}`]: obj } }));
        expect(result.valid, `"${objType}" should be valid but got: ${JSON.stringify(result.errors)}`).toBe(true);
      });
    }
  });

  describe('Layers', () => {
    it('parses a feedback layer', () => {
      const slide = makeSlide({
        layers: [{
          id: 'layer-feedback',
          name: 'Feedback',
          visible: false,
          background: { type: 'solid', color: '#FFFFFF' },
          objects: {
            'text-feedback': {
              type: 'text',
              rect: { x: 200, y: 280, w: 880, h: 160 },
              content: 'Correct!',
              style: { fontSize: 36, color: '#34A853', textAlign: 'center' }
            }
          }
        }]
      });
      expect(validate('slide', slide).valid).toBe(true);
    });
  });

  describe('Slides with triggers', () => {
    it('parses a trigger on the slide itself', () => {
      const slide = makeSlide({
        triggers: [{
          id: 'trigger-timeline',
          event: { type: 'timelineStarts' },
          action: { type: 'playMedia', target: 'media-intro-audio' }
        }]
      });
      expect(validate('slide', slide).valid).toBe(true);
    });

    it('parses multiple triggers', () => {
      const slide = makeSlide({
        triggers: [
          { id: 'tr-1', event: { type: 'timelineStarts' }, action: { type: 'playMedia', target: 'a' } },
          { id: 'tr-2', event: { type: 'timelineEnds' },   action: { type: 'jumpToSlide', target: 'slide-002' } }
        ]
      });
      expect(validate('slide', slide).valid).toBe(true);
    });
  });

  describe('Audio', () => {
    it('parses audio with id, src, volume and loop', () => {
      const slide = makeSlide({
        audio: { id: 'bgm-1', src: 'media/aud_bgm.mp3', volume: 0.5, loop: true }
      });
      expect(validate('slide', slide).valid).toBe(true);
    });
  });
});
