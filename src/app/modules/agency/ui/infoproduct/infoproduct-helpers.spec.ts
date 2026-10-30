import { AiModel } from '@modules/agency/interfaces';
import {
  attachmentKind,
  buildImageRoles,
  buildTarget,
  dcsShotRowsByIndex,
  dcsTechGroups,
  formatDistribution,
  promptForGeneration,
  snapDuration,
} from './infoproduct-helpers';

function model(partial: Partial<AiModel>): AiModel {
  return {
    name: 'm',
    display_name: 'M',
    modality: 'video',
    generator: 'g',
    credential_provider: 'byteplus',
    base_url: '',
    endpoint: '',
    gallery_sync: false,
    defaults: {},
    ...partial,
  } as AiModel;
}

describe('infoproduct helpers', () => {
  it('classifies attachments by mime and by extension', () => {
    expect(attachmentKind({ type: 'image/png', name: 'a.png' })).toBe('image');
    expect(attachmentKind({ type: '', name: 'song.FLAC' })).toBe('audio');
    expect(attachmentKind({ type: 'audio/mpeg', name: 'x.mp3' })).toBe('audio');
    expect(attachmentKind({ type: '', name: 'voice.wav' })).toBe('audio');
    expect(attachmentKind({ type: 'video/mp4', name: 'ref.mp4' })).toBe('video');
    expect(attachmentKind({ type: '', name: 'RECORTE.MOV' })).toBe('video');
    expect(attachmentKind({ type: '', name: 'notas.txt' })).toBe(null);
    expect(attachmentKind({ type: 'application/pdf', name: 'doc.pdf' })).toBe(null);
  });

  it('builds the target from the model defaults', () => {
    const target = buildTarget(
      model({
        name: 'dreamina-seedance-2-0-260128',
        max_references: 9,
        defaults: { durations: [10, 5, 15], ratios: ['16:9'], resolutions: ['720p'] },
      }),
    );
    expect(target.max_duration).toBe(15);
    expect(target.durations).toEqual([5, 10, 15]);
    expect(target.supports_audio).toBe(true);
    expect(target.audio_reference).toBe(true);
    expect(target.max_references).toBe(9);
  });

  it('falls back to a 15 s max and no audio for unknown models', () => {
    const target = buildTarget(model({ name: 'higgsfield-kling-3-0-turbo-t2v' }));
    expect(target.max_duration).toBe(15);
    expect(target.supports_audio).toBe(false);
    expect(target.audio_reference).toBe(false);
  });

  it('rewrites @ImageN / @AudioN tags for the generator', () => {
    expect(promptForGeneration('The bottle from @Image1 and @image2, music @Audio1 ')).toBe(
      'The bottle from [Image 1] and [Image 2], music [Audio 1]',
    );
  });

  it('snaps a duration to the allowed list without exceeding the max', () => {
    expect(snapDuration(12, [5, 10, 15], 15)).toBe(10);
    expect(snapDuration(30, [5, 10, 15], 15)).toBe(15);
    expect(snapDuration(2, [5, 10], 10)).toBe(5);
    expect(snapDuration(8, [], 6)).toBe(6);
  });

  it('maps image roles and defaults them to product', () => {
    const roles = buildImageRoles([
      { id: 'a', name: 'a.png', kind: 'image', url: '', role: 'person' },
      { id: 'b', name: 'b.png', kind: 'image', url: '' },
      { id: 'c', name: 'c.mp3', kind: 'audio', url: '' },
    ]);
    expect(roles).toEqual({ a: 'person', b: 'product' });
  });

  it('formats a distribution with counts and share', () => {
    expect(
      formatDistribution(
        [{ type: 'static', count: 12, runtime_share_pct: 60.4 }],
        'count',
        'runtime_share_pct',
      ),
    ).toBe('static ×12 (60%)');
    expect(formatDistribution([], 'count', 'runtime_share_pct')).toBe('');
  });

  it('builds the technical groups of the DCS analysis', () => {
    const t = (key: string) => key;
    const groups = dcsTechGroups(
      {
        technical_signature: {
          lens_family: '35mm prime',
          dof_overall: 'shallow',
          key_overall: 'low_key',
        },
        camera_summary: { dominant_movement: 'static', static_share_pct: 80 },
        editing_style: { primary: 'fast_cut', metrics: { shot_count: 21, cut_count: 20 } },
        transitions_summary: { signature_transition: 'whip_pan_transition' },
        quality: { checks_passed: true },
      },
      t,
    );
    const keys = groups.map((g) => g.key);
    expect(keys).toContain('TECH_CAMERA');
    expect(keys).toContain('TECH_LENS');
    expect(keys).toContain('TECH_TRANSITIONS');
    const lens = groups.find((g) => g.key === 'TECH_LENS');
    expect(lens?.rows.map((r) => r.value)).toContain('35mm prime');
    expect(dcsTechGroups(null, t)).toEqual([]);
  });

  it('builds the per-shot technical rows keyed by shot index', () => {
    const t = (key: string) => key;
    const map = dcsShotRowsByIndex(
      {
        shots: [
          {
            index: 1,
            shot_size: 'close_up',
            angle_vertical: 'eye_level',
            camera_movement: { type: 'static', evidence: 'el fondo no se mueve' },
            lens: { class: '35mm' },
            depth_of_field: { dof: 'shallow' },
            exposure_and_color: { exposure: 'correct', white_balance_k: 5600 },
            transition_out: { type: 'hard_cut' },
          },
        ],
      },
      t,
    );
    const rows = map.get(1) ?? [];
    const values = rows.map((r) => r.value);
    expect(values).toContain('close_up');
    expect(values).toContain('static');
    expect(values).toContain('5600 K');
    expect(values).toContain('hard_cut');
    expect(rows.every((r) => r.label.startsWith('VIDEOMACHINE.TECH_'))).toBe(true);
  });
});
