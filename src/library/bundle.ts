/**
 * Exportación e importación completa de la biblioteca (metadatos + audio)
 * en un único ZIP local, sin servidor ni dependencias.
 */

import type { Library, Playlist, TrackMeta } from './library.js';
import type { SmartPlaylist } from './smart.js';
import type { TrackStore } from './storage.js';
import { createZip, readZip, type ZipEntry } from './zip.js';

interface BundleTrack {
  meta: TrackMeta;
  file?: string;
}

interface BundleManifest {
  format: 'audiolad-library';
  version: 1;
  exportedAt: string;
  tracks: BundleTrack[];
  playlists: Playlist[];
  smartPlaylists: SmartPlaylist[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function safeExtension(fileName: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(fileName);
  return match?.[1]?.toLowerCase() ?? 'bin';
}

export async function createLibraryBundle(library: Library, store: TrackStore): Promise<Blob> {
  const entries: ZipEntry[] = [];
  const tracks: BundleTrack[] = [];
  for (const meta of library.tracks) {
    let file: string | undefined;
    if (meta.hasAudio) {
      const bytes = await store.getBytes(meta.id);
      if (bytes) {
        file = `audio/${meta.id}.${safeExtension(meta.fileName)}`;
        entries.push({ name: file, data: bytes });
      }
    }
    tracks.push({ meta, file });
  }
  const manifest: BundleManifest = {
    format: 'audiolad-library',
    version: 1,
    exportedAt: new Date().toISOString(),
    tracks,
    playlists: [...library.playlists],
    smartPlaylists: [...library.smartPlaylists],
  };
  entries.unshift({ name: 'library.json', data: encoder.encode(JSON.stringify(manifest)) });
  entries.push({
    name: 'LEEME.txt',
    data: encoder.encode(
      'Biblioteca de AudioLad Studio.\nContiene library.json + audio/ con los archivos originales.\nImporta este ZIP desde Biblioteca → Importar.\n',
    ),
  });
  return createZip(entries);
}

export interface BundleImportResult {
  tracksAdded: number;
  tracksSkipped: number;
  playlistsAdded: number;
  smartAdded: number;
}

export async function importLibraryBundle(
  bytes: Uint8Array,
  library: Library,
  _store: TrackStore,
): Promise<BundleImportResult> {
  const files = readZip(bytes);
  const raw = files.get('library.json');
  if (!raw) throw new Error('El ZIP no contiene library.json.');
  const manifest = JSON.parse(decoder.decode(raw)) as BundleManifest;
  if (manifest.format !== 'audiolad-library' || manifest.version !== 1) {
    throw new Error('Formato de biblioteca no reconocido.');
  }

  const result: BundleImportResult = { tracksAdded: 0, tracksSkipped: 0, playlistsAdded: 0, smartAdded: 0 };
  for (const entry of manifest.tracks) {
    const meta = entry.meta;
    if (!meta?.id || !meta.fileName) continue;
    if (library.getTrack(meta.id) || (meta.contentHash && library.findDuplicate(meta.contentHash))) {
      result.tracksSkipped += 1;
      continue;
    }
    const audio = entry.file ? files.get(entry.file) : undefined;
    await library.restoreTrack(meta, audio ?? null);
    result.tracksAdded += 1;
  }

  for (const playlist of manifest.playlists ?? []) {
    if (library.playlists.some((existing) => existing.name === playlist.name)) continue;
    const created = await library.createPlaylist(playlist.name);
    for (const trackId of playlist.trackIds) {
      if (library.getTrack(trackId)) await library.addToPlaylist(created.id, trackId);
    }
    if (playlist.coverUrl) await library.setPlaylistCover(created.id, playlist.coverUrl);
    result.playlistsAdded += 1;
  }

  for (const smart of manifest.smartPlaylists ?? []) {
    if (library.smartPlaylists.some((existing) => existing.id === smart.id)) continue;
    await library.addSmartPlaylist(smart);
    result.smartAdded += 1;
  }
  return result;
}
