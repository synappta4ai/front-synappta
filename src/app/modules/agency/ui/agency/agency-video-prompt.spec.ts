import { describe, expect, it } from 'vitest';

import {
  composeSceneClipPrompt,
  formatSeconds,
  rescaleClipDurations,
  segmentRange,
} from './agency-video-prompt';

const references = [
  { tag: '@image2', filename: 'Fachada y torres.jpg' },
  { tag: '@image3', filename: 'entrada principal.jpg' },
  { tag: '@image4', filename: 'lobby.jpg' },
];

const vinetas = [
  { tipo_toma: 'plano medio', que_se_ve: 'dolly in hacia la fachada', foto_referencia: 'Fachada y torres.jpg' },
  { que_se_ve: 'plano abierto de la entrada', foto_referencia: 'entrada principal' },
  { que_se_ve: 'plano contrapicado del edificio', foto_referencia: 'fachada y torres.jpg' },
  { que_se_ve: 'conversación en recepción', movimiento_camara: 'zoom out', foto_referencia: 'lobby.jpg' },
];

describe('formatSeconds', () => {
  it('usa coma decimal', () => {
    expect(formatSeconds(2.5)).toBe('2,5');
    expect(formatSeconds(2)).toBe('2');
    expect(formatSeconds(10 / 3)).toBe('3,33');
  });
});

describe('composeSceneClipPrompt', () => {
  it('reparte la duración en partes iguales y asigna cada foto a su viñeta', () => {
    const prompt = composeSceneClipPrompt({
      sceneNumber: 1,
      duration: 10,
      board: { tag: '@image1', filename: 'storyboard-scene-1.png' },
      references,
      vinetas,
    });

    expect(prompt).toContain('Escena 1, duración 10 segundos.');
    expect(prompt).toContain('Toma la imagen @image1 (storyboard-scene-1.png) como referencia lógica');
    expect(prompt).toContain(
      'Viñeta 1 (primer corte), duración 2,5 segundos: @image2 (Fachada y torres.jpg) plano medio, dolly in hacia la fachada.',
    );
    expect(prompt).toContain('Viñeta 2 (segundo corte), duración 2,5 segundos: @image3 (entrada principal.jpg)');
    expect(prompt).toContain('Viñeta 3 (tercer corte), duración 2,5 segundos: @image2');
    expect(prompt).toContain('Viñeta 4 (cuarto corte), duración 2,5 segundos: @image4 (lobby.jpg)');
    expect(prompt).toContain('cámara: zoom out');
    expect(prompt).toContain('Sin texto en pantalla, sin letreros, sin subtítulos.');
  });

  it('8 s con 4 viñetas son 2 s por corte y no menciona ángulo ni contexto comercial', () => {
    const prompt = composeSceneClipPrompt({
      sceneNumber: 2,
      duration: 8,
      board: null,
      references,
      vinetas,
    });

    expect(prompt.match(/duración 2 segundos:/g)).toHaveLength(4);
    expect(prompt).not.toContain('Ángulo');
    expect(prompt).not.toContain('Referencias visuales adjuntas');
    expect(prompt).toContain('Las fotos reales adjuntas mandan');
  });

  it('con varios segmentos reparte las viñetas y mantiene la duración igual dentro de cada uno', () => {
    expect(segmentRange(4, 0, 2)).toEqual([0, 2]);
    expect(segmentRange(4, 1, 2)).toEqual([2, 4]);
    expect(segmentRange(1, 1, 2)).toEqual([0, 1]);

    const second = composeSceneClipPrompt({
      sceneNumber: 1,
      duration: 8,
      board: null,
      references,
      vinetas,
      segmentIndex: 1,
      segmentCount: 2,
    });
    expect(second).toContain('Viñeta 1 (primer corte), duración 4 segundos: @image2');
    expect(second).toContain('Viñeta 2 (segundo corte), duración 4 segundos: @image4');
    expect(second).toContain('Segmento 2 de 2');
  });
});

describe('rescaleClipDurations', () => {
  it('reparte la duración nueva entre los cortes del prompt directo', () => {
    const prompt = composeSceneClipPrompt({
      sceneNumber: 1,
      duration: 10,
      board: null,
      references,
      vinetas,
    });
    const rescaled = rescaleClipDurations(prompt, 8);

    expect(rescaled).toContain('Escena 1, duración 8 segundos.');
    expect(rescaled.match(/duración 2 segundos:/g)).toHaveLength(4);
  });

  it('deja intacto un texto con otro formato', () => {
    expect(rescaleClipDurations('Plano libre de la fachada.', 8)).toBe('Plano libre de la fachada.');
  });
});
