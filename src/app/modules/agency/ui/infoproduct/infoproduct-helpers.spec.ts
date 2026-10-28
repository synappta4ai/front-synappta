import { AiModel } from '@modules/agency/interfaces';
import {
  attachmentKind,
  buildImageRoles,
  buildTarget,
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
    expect(attachmentKind({ type: 'video/mp4', name: 'v.mp4' })).toBeNull();
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
});
