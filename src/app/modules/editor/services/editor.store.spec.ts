import { EditorStore } from './editor.store';

const video = (over = {}) => ({
  kind: 'video' as const,
  url: '/outputs/video/a.mp4',
  name: 'a',
  duration: 10,
  ...over,
});

describe('EditorStore', () => {
  let store: EditorStore;
  beforeEach(() => {
    store = new EditorStore();
  });

  it('adds clips, refuses sources the server cannot read, and selects the new clip', () => {
    expect(store.addVideoClip(video())).toBe('ok');
    expect(store.project().video).toHaveLength(1);
    expect(store.project().video[0].source).toEqual({ output: '/outputs/video/a.mp4' });
    expect(store.project().video[0].out).toBe(10);
    expect(store.selection()?.track).toBe('video');
    expect(store.duration()).toBe(10);

    expect(store.addVideoClip(video({ url: 'https://provider.example/x.mp4' }))).toBe(
      'unsupported-source',
    );
    expect(store.project().video).toHaveLength(1);
    expect(store.addVideoClip(video({ url: '/x', fileId: 'f1' }))).toBe('ok');
    expect(store.project().video[1].source).toEqual({ file_id: 'f1' });
  });

  it('splits at the playhead and keeps total duration', () => {
    store.addVideoClip(video());
    store.setPlayhead(4);
    expect(store.splitAtPlayhead()).toBe(true);
    const [a, b] = store.project().video;
    expect([a.in, a.out, b.in, b.out]).toEqual([0, 4, 4, 10]);
    expect(store.duration()).toBe(10);
    store.setPlayhead(0);
    expect(store.splitAtPlayhead()).toBe(false); // too close to the clip start
  });

  it('undoes and redoes, and coalesces rapid edits of the same field', () => {
    store.addVideoClip(video());
    const id = store.project().video[0].id;
    store.patchVideo(id, { out: 8 }, 'out');
    store.patchVideo(id, { out: 6 }, 'out');
    store.patchVideo(id, { out: 5 }, 'out');
    expect(store.project().video[0].out).toBe(5);
    store.undo();
    expect(store.project().video[0].out).toBe(10); // the three edits were one step
    store.redo();
    expect(store.project().video[0].out).toBe(5);
    expect(store.canRedo()).toBe(false);
  });

  it('clamps trims to the source and keeps a minimum length', () => {
    store.addVideoClip(video());
    const id = store.project().video[0].id;
    store.patchVideo(id, { out: 99 });
    expect(store.project().video[0].out).toBe(10);
    store.patchVideo(id, { in: 9.99 });
    const c = store.project().video[0];
    expect(c.out - c.in).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  it('reorders and removes clips', () => {
    store.addVideoClip(video({ name: 'a', duration: 2 }));
    store.addVideoClip(video({ name: 'b', duration: 3 }));
    const [first] = store.project().video;
    store.moveVideo(first.id, 1);
    expect(store.project().video.map((c) => c.label)).toEqual(['b', 'a']);
    store.select({ track: 'video', id: first.id });
    store.removeSelected();
    expect(store.project().video.map((c) => c.label)).toEqual(['b']);
    expect(store.selection()).toBeNull();
  });

  it('adds audio at the playhead and text with a default window', () => {
    store.addVideoClip(video());
    store.setPlayhead(2);
    expect(
      store.addAudioClip({ kind: 'audio', url: '/x', fileId: 'm', name: 'song', duration: 30 }),
    ).toBe('ok');
    expect(store.project().audio[0].start).toBe(2);
    store.addText('Hola');
    const t = store.project().texts[0];
    expect([t.start, t.end]).toEqual([2, 5]);
    store.patchText(t.id, { x: 5, color: '#FFFFFF' });
    expect(store.project().texts[0].x).toBe(1);
  });

  it('tracks the dirty flag', () => {
    expect(store.dirty()).toBe(false);
    store.addText('x');
    expect(store.dirty()).toBe(true);
    store.markSaved();
    expect(store.dirty()).toBe(false);
  });

  it('detaches the video sound into a linked clip on the audio track', () => {
    store.addVideoClip({
      kind: 'video',
      url: '/outputs/video/a.mp4',
      name: 'a',
      duration: 5,
      hasAudio: true,
    });
    const video = store.project().video[0];
    expect(video.audio_detached).toBe(true);
    const linked = store.project().audio[0];
    expect(linked.linked_video_id).toBe(video.id);
    expect([linked.track, linked.start, linked.in, linked.out]).toEqual([0, 0, 0, 5]);

    store.setPlayhead(2);
    expect(store.splitAtPlayhead()).toBe(true);
    const audios = store.project().audio;
    expect(audios).toHaveLength(2);
    expect(audios.map((a) => a.start)).toEqual([0, 2]);
    expect([audios[0].out, audios[1].in]).toEqual([2, 2]);

    store.patchAudio(audios[0].id, { volume: 0.4 });
    expect(store.project().video[0].volume).toBe(0.4);
    expect(store.project().audio[0].volume).toBe(0.4);

    store.select({ track: 'audio', id: store.project().audio[0].id });
    store.removeSelected();
    expect(store.project().audio).toHaveLength(1);
    expect(store.project().video[0].has_audio).toBe(false);
  });

  it('adds and removes tracks, shifting the clips above', () => {
    const before = store.project().tracks.length;
    store.addTrack('video');
    store.addTrack('video');
    expect(store.project().tracks.filter((x) => x.kind === 'video')).toHaveLength(3);
    store.addVideoClip(video({ duration: 2 }), undefined, 2, 1);
    store.addVideoClip(video({ duration: 2 }), undefined, 1, 5);
    expect(
      store
        .project()
        .video.map((c) => c.track)
        .sort(),
    ).toEqual([1, 2]);
    expect(store.removeTrack('video', 1)).toBe(true);
    expect(store.project().video).toHaveLength(1);
    expect(store.project().video[0].track).toBe(1); // the old track 2 shifted down
    expect(store.project().tracks.filter((x) => x.kind === 'video')).toHaveLength(2);
    expect(store.removeTrack('text', 0)).toBe(false); // never leave a kind without tracks
    expect(store.project().tracks.length).toBe(before + 1);
  });

  it('places overlay clips at their start and splits them there', () => {
    store.addTrack('video');
    store.addVideoClip(video({ duration: 10 }), undefined, 0);
    store.addVideoClip(video({ duration: 10 }), undefined, 1, 2);
    const overlay = store.project().video.find((c) => c.track === 1)!;
    expect(overlay.start).toBe(2);
    store.setPlayhead(5);
    expect(store.splitAtPlayhead()).toBe(true);
    const parts = store.project().video.filter((c) => c.track === 1);
    expect(parts).toHaveLength(2);
    expect([parts[0].in, parts[0].out, parts[1].in, parts[1].start]).toEqual([0, 3, 3, 5]);
  });

  it('keeps a de-duplicated asset gallery and builds clips from it', () => {
    const a = {
      id: 'a1',
      kind: 'video' as const,
      name: 'a',
      url: '/outputs/video/a.mp4',
      thumb: '',
      duration: 5,
    };
    const dup = { ...a, id: 'a2' }; // same file imported twice
    const img = {
      id: 'i1',
      kind: 'image' as const,
      name: 'i',
      url: '/outputs/i.png',
      thumb: '/outputs/i.png',
      duration: 0,
    };
    const song = {
      id: 's1',
      kind: 'audio' as const,
      name: 's',
      url: '/x',
      fileId: 'f-song',
      thumb: '',
      duration: 20,
    };
    expect(store.addAssets([a, dup, img, song]).map((x) => x.id)).toEqual(['a1', 'i1', 's1']);
    expect(store.addAssets([a])).toEqual([]);
    expect(store.project().assets).toHaveLength(3);

    expect(store.addAssetToTimeline(a)).toBe('ok');
    expect(store.addAssetToTimeline(img, { index: 0 })).toBe('ok'); // dropped before the first clip
    expect(store.project().video.map((c) => c.kind)).toEqual(['image', 'video']);
    expect(store.addAssetToTimeline(song, { start: 4 })).toBe('ok');
    expect(store.project().audio[0].start).toBe(4);
    expect(store.project().audio[0].source).toEqual({ file_id: 'f-song' });

    store.removeAsset('a1');
    expect(store.project().assets.map((x) => x.id)).toEqual(['i1', 's1']);
    expect(store.project().video).toHaveLength(2); // clips are independent of the gallery
  });
});
