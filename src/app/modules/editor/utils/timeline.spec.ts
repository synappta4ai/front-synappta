import { EditorProject, EditorVideoClip } from '../interfaces';
import {
  assignLanes,
  emptyProject,
  formatRuler,
  formatTime,
  formatTimecode,
  insertIndexAt,
  locateVideo,
  moveItem,
  projectDuration,
  sourceFor,
  splitVideoClip,
  videoClipDuration,
  videoStarts,
} from './timeline';

function clip(over: Partial<EditorVideoClip> = {}): EditorVideoClip {
  return {
    id: 'c',
    kind: 'video',
    track: 0,
    source: { file_id: 'f' },
    in: 0,
    out: 4,
    label: 'clip',
    url: '/x.mp4',
    src_duration: 10,
    ...over,
  };
}

function project(...clips: EditorVideoClip[]): EditorProject {
  return { ...emptyProject('p'), video: clips };
}

describe('timeline utils', () => {
  it('computes clip and project durations', () => {
    expect(videoClipDuration(clip({ in: 1, out: 4 }))).toBe(3);
    expect(videoClipDuration(clip({ in: 2, out: 0, src_duration: 10 }))).toBe(8);
    expect(videoClipDuration(clip({ kind: 'image', length: 2.5 }))).toBe(2.5);
    expect(videoClipDuration(clip({ kind: 'image', length: undefined }))).toBe(3);
    const p = project(clip({ id: 'a', out: 4 }), clip({ id: 'b', in: 1, out: 3 }));
    expect(videoStarts(p)).toEqual([0, 4]);
    expect(projectDuration(p)).toBe(6);
  });

  it('locates the clip under a timeline instant', () => {
    const p = project(clip({ id: 'a', out: 4 }), clip({ id: 'b', out: 2 }));
    expect(locateVideo(p, 1)).toEqual({ index: 0, offset: 1, start: 0 });
    expect(locateVideo(p, 4)).toEqual({ index: 1, offset: 0, start: 4 });
    expect(locateVideo(p, 99)).toEqual({ index: 1, offset: 2, start: 4 });
    expect(locateVideo(emptyProject(), 0)).toBeNull();
  });

  it('splits a video clip keeping the source continuous', () => {
    const parts = splitVideoClip(clip({ in: 1, out: 5 }), 1.5, () => 'new');
    expect(parts).not.toBeNull();
    const [a, b] = parts!;
    expect(a.in).toBe(1);
    expect(a.out).toBe(2.5);
    expect(b.id).toBe('new');
    expect(b.in).toBe(2.5);
    expect(b.out).toBe(5);
  });

  it('splits an image clip by length and refuses tiny pieces', () => {
    const [a, b] = splitVideoClip(clip({ kind: 'image', length: 4 }), 1, () => 'n')!;
    expect(a.length).toBe(1);
    expect(b.length).toBe(3);
    expect(splitVideoClip(clip({ in: 0, out: 4 }), 0.05)).toBeNull();
    expect(splitVideoClip(clip({ in: 0, out: 4 }), 3.95)).toBeNull();
  });

  it('moves items without mutating the input', () => {
    const src = ['a', 'b', 'c'];
    expect(moveItem(src, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(src, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(src, 1, 9)).toEqual(['a', 'b', 'c']);
    expect(src).toEqual(['a', 'b', 'c']);
  });

  it('maps URLs to back sources', () => {
    expect(sourceFor('/anything', 'abc')).toEqual({ file_id: 'abc' });
    expect(sourceFor('/outputs/video/a.mp4')).toEqual({ output: '/outputs/video/a.mp4' });
    expect(sourceFor('http://localhost:8099/outputs/video/a.mp4')).toEqual({
      output: '/outputs/video/a.mp4',
    });
    expect(sourceFor('http://localhost:8099/api/v1/t/acme/outputs/video/a.mp4')).toEqual({
      output: '/api/v1/t/acme/outputs/video/a.mp4',
    });
    expect(sourceFor('http://localhost:8099/api/v1/t/acme/files/abc/serve')).toBeNull();
    expect(sourceFor('https://provider.example/clip.mp4')).toBeNull();
  });

  it('assigns overlapping items to separate lanes', () => {
    const { lanes, count } = assignLanes([
      { id: 'a', start: 0, end: 4 },
      { id: 'b', start: 2, end: 6 },
      { id: 'c', start: 4, end: 8 },
    ]);
    expect(count).toBe(2);
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(1);
    expect(lanes.get('c')).toBe(0); // reuses lane 0 once 'a' ended
    expect(assignLanes([]).count).toBe(1);
  });

  it('formats time', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(65.25)).toBe('1:05.3');
  });

  it('formats timecodes and ruler marks', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00:00');
    expect(formatTimecode(7.5, 30)).toBe('00:00:07:15');
    expect(formatTimecode(3725.1, 25)).toBe('01:02:05:02');
    expect(formatRuler(5)).toBe('00:05');
    expect(formatRuler(125)).toBe('02:05');
  });

  it('finds the insertion index for a dropped time', () => {
    const p = project(clip({ id: 'a', out: 4 }), clip({ id: 'b', out: 2 }));
    expect(insertIndexAt(p, 0)).toBe(0);
    expect(insertIndexAt(p, 1.9)).toBe(0);
    expect(insertIndexAt(p, 2.1)).toBe(1);
    expect(insertIndexAt(p, 5.5)).toBe(2);
    expect(insertIndexAt(emptyProject(), 3)).toBe(0);
  });
});
