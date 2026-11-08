import { describe, expect, it } from 'vitest';
import { createZip, readZip } from '../src/library/zip.js';
import { createLibraryBundle, importLibraryBundle } from '../src/library/bundle.js';
import { Library, type TrackMeta } from '../src/library/library.js';
import { MemoryStore } from '../src/library/storage.js';

const encoder = new TextEncoder();

function meta(title: string, overrides: Partial<TrackMeta> = {}): Omit<TrackMeta, 'id' | 'addedAt'> {
  return {
    fileName: `${title}.mp3`,
    title,
    artist: 'Artista',
    album: 'Álbum',
    bpm: 120,
    bpmSource: 'tag',
    durationSec: 180,
    sizeBytes: 4,
    peaks: [0.1, 0.5],
    hasAudio: true,
    analysis: 'complete',
    ...overrides,
  };
}

describe('ZIP mínimo', () => {
  it('hace round-trip con nombres UTF-8 y binarios', () => {
    const entries = [
      { name: 'library.json', data: encoder.encode('{"ok":true}') },
      { name: 'audio/ñandú.mp3', data: new Uint8Array([0, 255, 1, 128, 3]) },
    ];
    const blob = createZip(entries);
    return blob.arrayBuffer().then((buffer) => {
      const files = readZip(new Uint8Array(buffer));
      expect(new TextDecoder().decode(files.get('library.json'))).toBe('{"ok":true}');
      expect([...files.get('audio/ñandú.mp3')!]).toEqual([0, 255, 1, 128, 3]);
    });
  });

  it('rechaza datos que no son ZIP', () => {
    expect(() => readZip(encoder.encode('no soy un zip'))).toThrow(/ZIP/);
  });
});

describe('biblioteca completa con audio', () => {
  it('exporta e importa pistas, bytes, playlists y portada', async () => {
    const store = new MemoryStore();
    const original = new Library(store);
    await original.init();
    const a = await original.addTrack(meta('Uno'), new Uint8Array([1, 2, 3, 4]));
    const b = await original.addTrack(meta('Dos', { hasAudio: false, peaks: [] }), new Uint8Array());
    const playlist = await original.createPlaylist('Sesión');
    await original.addToPlaylist(playlist.id, a.id);
    await original.addToPlaylist(playlist.id, b.id);
    await original.setPlaylistCover(playlist.id, 'data:image/jpeg;base64,AAAA');

    const blob = await createLibraryBundle(original, store);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const targetStore = new MemoryStore();
    const target = new Library(targetStore);
    await target.init();
    const result = await importLibraryBundle(bytes, target, targetStore);

    expect(result.tracksAdded).toBe(2);
    expect(result.playlistsAdded).toBe(1);
    expect(target.tracks.map((track) => track.title).sort()).toEqual(['Dos', 'Uno']);
    const restored = target.tracks.find((track) => track.title === 'Uno')!;
    expect([...(await targetStore.getBytes(restored.id))!]).toEqual([1, 2, 3, 4]);
    expect(target.playlists[0]?.name).toBe('Sesión');
    expect(target.playlists[0]?.coverUrl).toBe('data:image/jpeg;base64,AAAA');

    const again = await importLibraryBundle(bytes, target, targetStore);
    expect(again.tracksAdded).toBe(0);
    expect(again.tracksSkipped).toBe(2);
  });
});
