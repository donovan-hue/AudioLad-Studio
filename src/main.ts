import { AudioEngine } from './audio/engine.js';
import type { DeckId } from './audio/deck.js';
import { decodeAudioBytes, computePeaks, estimateBpm, toMono } from './audio/analysis.js';
import { effectiveBpm, syncRate } from './audio/rate.js';
import type { LoopBeats } from './audio/key.js';
import { beatLoop, beatSeconds, estimateKey, formatKey } from './audio/key.js';
import type { FxKind } from './audio/fx.js';
import { DEFAULT_MIXER_STATE, type EqBand } from './audio/settings.js';
import { MasterRecorder } from './audio/recorder.js';
import { audioBufferToMp3, audioBufferToWav, downloadBlob } from './audio/exportAudio.js';
import { SAMPLER_PADS, type SamplerPad } from './audio/sampler.js';
import type { TrackMeta } from './library/library.js';
import { Library } from './library/library.js';
import { createTrackStore } from './library/storage.js';
import { validateAudioFile } from './library/fileValidate.js';
import { parseId3 } from './util/id3.js';
import { DeckView } from './ui/deckView.js';
import { MixerView } from './ui/mixerView.js';
import { LibraryView } from './ui/libraryView.js';
import { QueueView } from './ui/queueView.js';
import { SamplerView } from './ui/samplerView.js';
import { RecorderView } from './ui/recorderView.js';
import { HistoryView } from './ui/historyView.js';
import { ConverterView } from './ui/converterView.js';
import { SettingsView } from './ui/settingsView.js';
import { HelpView } from './ui/helpView.js';
import { installThemeToggle } from './ui/theme.js';
import { showToast, type ToastAction, type ToastKind } from './ui/toast.js';
import { loadMixerState, saveMixerState } from './ui/mixerStore.js';
import { ImportQueueView } from './ui/importQueue.js';
import { createShell } from './ui/shell.js';
import { Router, type Route, type ToolId } from './ui/router.js';
import { HomeView } from './ui/homeView.js';
import { SearchView } from './ui/searchView.js';
import { CollectionView } from './ui/collectionView.js';
import { NowPlayingBar } from './ui/nowPlayingBar.js';
import { NotificationCenter } from './ui/notificationCenter.js';
import { CommandPalette, type PaletteCommand } from './ui/commandPalette.js';
import { ShortcutManager, formatCombo, type ShortcutAction } from './ui/shortcuts.js';
import { h, isEditableTarget, openModal } from './ui/components.js';
import { openEqPanel } from './ui/eqPanel.js';
import { SleepTimer } from './audio/sleepTimer.js';
import { PwaController, WakeLockKeeper } from './ui/pwa.js';
import { openLyricsPanel } from './ui/lyrics.js';
import { DiscoveryView } from './ui/discoveryView.js';
import { radioFrom } from './library/discovery.js';
import { loadRecommendationHistory, recordRecommendation, type RecommendationEvent } from './library/recommendations.js';
import { sha256Hex } from './util/hash.js';
import { computeQuality, type QualityInfo } from './util/quality.js';
import { integratedLoudness, normalizationGainDb } from './audio/loudness.js';
import { audioFingerprint, fingerprintSimilarity } from './audio/fingerprint.js';
import { createLibraryBundle, importLibraryBundle } from './library/bundle.js';
import { loadPlaybackSettings, savePlaybackSettings, type PlaybackSettings, type RepeatMode } from './audio/playbackSettings.js';
import { updateSessionTrack, updateSessionState, bindSessionHandlers } from './audio/mediaSession.js';
import { saveSession, loadSession } from './audio/sessionStore.js';
import { parseSpotifyPlaylistUrl } from './library/spotify.js';
import { requestAudio, matchCandidates, fetchSpotifyPlaylist, downloadJson } from './ui/convertApi.js';
import type { SmartPlaylist } from './library/smart.js';

const PEAK_BUCKETS = 1400;

type DeckBpmSource = TrackMeta['bpmSource'];

interface AppState {
  baseBpm: Record<DeckId, number | null>;
  bpmSource: Record<DeckId, DeckBpmSource>;
  loadedTrackId: Record<DeckId, string | null>;
  loadedMeta: Record<DeckId, TrackMeta | null>;
}

async function main(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) throw new Error('Missing #app');

  // ---------- Shell: barra lateral, topbar, páginas, cola lateral ----------
  const router = new Router();
  const shell = createShell((route) => router.navigate(route));
  app.textContent = '';
  app.appendChild(shell.el.root);

  const notifications = new NotificationCenter(
    shell.el.notificationButton,
    shell.el.notificationPanel,
    shell.el.notificationBadge,
  );
  const toast = (message: string, kind: ToastKind = 'info', action?: ToastAction): void => {
    showToast(shell.el.toasts, message, kind, action);
    notifications.push(message, kind);
  };
  installThemeToggle(shell.el.themeButton, toast);
  const pwa = new PwaController(toast, (available) => settingsView.setInstallAvailable(available));
  pwa.init();
  const wakeLock = new WakeLockKeeper();

  const layout = document.createElement('main');
  layout.className = 'layout';

  shell.el.menuButton.addEventListener('click', () => shell.toggleMobile());
  shell.el.sidebarBackdrop.addEventListener('click', () => shell.closeMobile());
  shell.el.backButton.addEventListener('click', () => router.back());
  shell.el.forwardButton.addEventListener('click', () => router.forward());

  // ---------- Storage + biblioteca ----------
  const store = await createTrackStore();
  if (store.kind === 'memory') {
    toast('Tu navegador no expone OPFS ni IndexedDB: la biblioteca vive solo en memoria.', 'error');
  }
  const library = new Library(store);
  await library.init();

  // ---------- Motor de audio (contexto en el primer gesto) ----------
  const engine = new AudioEngine();
  const playback: PlaybackSettings = loadPlaybackSettings();
  let mixerApplied = false;
  const ensureEngine = (): AudioContext => {
    const ctx = engine.ensure();
    if (!mixerApplied) {
      engine.applyState(loadMixerState());
      engine.setMasterEqGains(playback.masterEq);
      engine.deckA.setSpeed(playback.speed);
      engine.deckB.setSpeed(playback.speed);
      mixerApplied = true;
    }
    return ctx;
  };

  const state: AppState = {
    baseBpm: { A: null, B: null },
    bpmSource: { A: 'estimated', B: 'estimated' },
    loadedTrackId: { A: null, B: null },
    loadedMeta: { A: null, B: null },
  };
  let queueAuto = true;
  let recorder: MasterRecorder | null = null;
  let sessionTracks = new Set<string>();
  let sleepRemainingSec: number | null = null;
  const shuffleHistory: string[] = [];
  let consumedQueue: string[] = [];
  let recommendationHistory: RecommendationEvent[] = loadRecommendationHistory();
  let radioSeedId: string | null = null;
  const playHistory: string[] = [];
  let lastSessionPersist = 0;
  let lastMediaUpdate = 0;
  let lastSessionPersistTrack: string | null = null;

  // ---------- Barra persistente «Ahora suena» ----------
  let masterVolume = loadMixerState().master;
  let volumeBeforeMute = masterVolume > 0 ? masterVolume : 0.8;
  function applyMasterVolume(position: number, announce = false): void {
    ensureEngine();
    masterVolume = Math.min(1, Math.max(0, position));
    engine.setMasterVolume(masterVolume);
    nowPlaying?.setVolume(masterVolume);
    mixerView.setMaster(masterVolume);
    markMixerDirty();
    if (announce) toast(`Volumen: ${Math.round(masterVolume * 100)} %.`, 'info');
  }
  function adjustVolume(delta: number): void {
    applyMasterVolume(masterVolume + delta, true);
  }
  function toggleMute(): void {
    if (masterVolume > 0) {
      volumeBeforeMute = masterVolume;
      applyMasterVolume(0, true);
    } else {
      applyMasterVolume(volumeBeforeMute > 0 ? volumeBeforeMute : 0.8, true);
    }
  }
  const nowPlaying = new NowPlayingBar({
    onPlayPause: (deckId) => {
      const deck = engine.deck(deckId);
      if (!deck.hasTrack) {
        toast(`El Deck ${deckId} está vacío.`, 'info');
        return;
      }
      if (deck.isPlaying) deck.pause();
      else deck.play();
    },
    onStop: (deckId) => engine.deck(deckId).stop(),
    onSeek: (deckId, seconds) => engine.deck(deckId).seek(seconds),
    onVolume: (position) => applyMasterVolume(position),
    onOpenQueue: () => router.navigate({ name: 'queue' }),
    onOpenCabina: () => router.navigate({ name: 'cabina' }),
    onOpenCurrent: () => router.navigate({ name: 'cabina' }),
    onToggleShuffle: () => toggleShuffle(),
    onCycleRepeat: () => cycleRepeat(),
    onNext: () => void nextFromQueue(),
    onPrevious: () => void previousTrack(),
    onSpeed: (speed) => setPlaybackSpeed(speed),
    onOpenEq: () => openEq(),
    onSleepTimer: () => openSleepTimer(),
  });
  const sleepTimer = new SleepTimer(
    (remaining) => {
      sleepRemainingSec = remaining;
    },
    () => sleepNow(),
  );
  nowPlaying.setVolume(masterVolume);
  shell.el.nowPlaying.appendChild(nowPlaying.el);

  // ---------- Acciones de biblioteca ----------
  async function artworkThumb(data: Uint8Array, mime: string): Promise<string | null> {
    try {
      const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: mime });
      const bitmap = await createImageBitmap(blob);
      const size = 320;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return null;
      const scale = Math.max(size / bitmap.width, size / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      ctx2d.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
      bitmap.close();
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch {
      return null;
    }
  }

  /** Análisis REAL: decodifica y calcula picos, BPM y tonalidad. Falla honesto. */
  async function analyzeBytes(bytes: Uint8Array): Promise<{
    buffer: AudioBuffer;
    peaks: number[];
    tags: ReturnType<typeof parseId3>;
    bpm: number | null;
    bpmSource: DeckBpmSource;
    key: ReturnType<typeof estimateKey>;
    loudnessLufs: number;
    fingerprint: string;
  }> {
    const ctx = ensureEngine();
    const buffer = await decodeAudioBytes(ctx, bytes.buffer as ArrayBuffer);
    if (!buffer) throw new Error('No se pudo decodificar el audio (archivo corrupto o formato incompatible).');
    const mono = toMono((i) => buffer.getChannelData(i), buffer.numberOfChannels, buffer.length);
    const peaks = Array.from(computePeaks(mono, PEAK_BUCKETS));
    const tags = parseId3(bytes);
    const bpm = tags.bpm ? tags.bpm : estimateBpm(mono, buffer.sampleRate);
    const bpmSource: DeckBpmSource = tags.bpm ? 'tag' : 'estimated';
    const key = estimateKey(mono, buffer.sampleRate);
    const loudnessLufs = integratedLoudness(mono, buffer.sampleRate);
    const fingerprint = audioFingerprint(mono, buffer.sampleRate);
    return { buffer, peaks, tags, bpm, bpmSource, key, loudnessLufs, fingerprint };
  }

  function analysisState(bpm: number | null, key: unknown): 'complete' | 'partial' {
    return bpm !== null && key !== null && key !== undefined ? 'complete' : 'partial';
  }

  /**
   * Pipeline real de importación: hash (dedup por contenido) → análisis →
   * metadatos → OPFS. Devuelve la pista y si era un duplicado físico.
   */
  async function importAudioBytes(
    fileName: string,
    bytes: Uint8Array,
    origin: TrackMeta['origin'],
    qualityHint?: QualityInfo,
    folder?: string,
  ): Promise<{ track: TrackMeta; duplicate: boolean }> {
    const hash = await sha256Hex(bytes);
    const existing = library.findDuplicate(hash);
    if (existing) return { track: existing, duplicate: true };

    const a = await analyzeBytes(bytes);
    const artwork = a.tags.artwork ? await artworkThumb(a.tags.artwork.data, a.tags.artwork.mime) : null;
    const similar = a.fingerprint
      ? library.tracks.find(
          (track) => track.fingerprint && track.contentHash !== hash && fingerprintSimilarity(track.fingerprint, a.fingerprint) >= 0.94,
        )
      : undefined;
    const quality: QualityInfo =
      qualityHint ??
      computeQuality(fileName, bytes.byteLength, {
        sampleRate: a.buffer.sampleRate,
        channels: a.buffer.numberOfChannels,
        durationSec: a.buffer.duration,
      });
    const track = await library.addTrack(
      {
        fileName,
        title: a.tags.title || stripExtension(fileName),
        artist: a.tags.artist || 'Desconocido',
        album: a.tags.album ?? '',
        bpm: a.bpm,
        bpmSource: a.bpmSource,
        loudnessLufs: Number.isFinite(a.loudnessLufs) ? Math.round(a.loudnessLufs * 10) / 10 : null,
        durationSec: a.buffer.duration,
        sizeBytes: bytes.byteLength,
        peaks: a.peaks,
        key: a.key,
        genre: a.tags.genre ?? '',
        date: a.tags.date ?? '',
        trackNumber: a.tags.trackNumber,
        artwork: artwork ?? undefined,
        origin,
        favorite: false,
        hotCues: new Array<number | null>(8).fill(null),
        playCount: 0,
        lastPlayedAt: null,
        contentHash: hash,
        fingerprint: a.fingerprint || undefined,
        quality,
        folder: folder || undefined,
        hasAudio: true,
        analysis: analysisState(a.bpm, a.key),
      },
      bytes,
    );
    if (similar) toast(`Posible duplicado difuso de "${similar.title}" (${similar.artist}). Se importó igualmente.`, 'info');
    return { track, duplicate: false };
  }

  /** Re-análisis real de una pista existente (BPM, tonalidad, picos, calidad). */
  async function reanalyzeTrack(trackId: string): Promise<void> {
    const meta = library.getTrack(trackId);
    if (!meta || !meta.hasAudio) return;
    const qid = importQueue.push(`Re-análisis: ${meta.title}`, 'procesando');
    const bytes = await store.getBytes(trackId);
    if (!bytes) {
      await library.setAnalysis(trackId, 'failed', 'No se encontraron los bytes de la pista.');
      importQueue.set(qid, 'error', 'bytes no encontrados');
      refreshAll();
      return;
    }
    try {
      const a = await analyzeBytes(bytes);
      await library.setTrackAnalysisData(trackId, {
        peaks: a.peaks,
        bpm: a.bpm,
        bpmSource: a.bpmSource,
        key: a.key,
        loudnessLufs: Number.isFinite(a.loudnessLufs) ? Math.round(a.loudnessLufs * 10) / 10 : null,
        fingerprint: a.fingerprint,
        durationSec: a.buffer.duration,
      });
      await library.setQuality(
        trackId,
        computeQuality(meta.fileName, bytes.byteLength, {
          sampleRate: a.buffer.sampleRate,
          channels: a.buffer.numberOfChannels,
          durationSec: a.buffer.duration,
        }),
      );
      await library.setAnalysis(trackId, analysisState(a.bpm, a.key));
      importQueue.set(qid, 'completada');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await library.setAnalysis(trackId, 'failed', message);
      importQueue.set(qid, 'error', message);
    }
    refreshAll();
  }

  async function importFiles(files: File[]): Promise<void> {
    if (files.length > 1) {
      importQueue.begin(files.map((f) => f.name));
      switchTab('lotes');
    }
    let index = 0;
    for (const file of files) {
      const qid = files.length > 1 ? String(index) : null;
      index += 1;
      const verdict = validateAudioFile(file.name, file.size, file.type);
      if (!verdict.ok) {
        toast(verdict.reason, 'error');
        if (qid) importQueue.set(qid, 'error', verdict.reason);
        continue;
      }
      importQueue.set(qid ?? '_', 'procesando');
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length === 0) {
          toast(`"${file.name}" está vacío.`, 'error');
          if (qid) importQueue.set(qid, 'error', 'archivo vacío');
          continue;
        }
        const folder = ((file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '').split('/').slice(0, -1).join('/');
        const { track, duplicate } = await importAudioBytes(file.name, bytes, { type: 'import' }, undefined, folder);
        if (duplicate) {
          toast(`"${track.title}" ya está en la biblioteca (duplicado por contenido): no se copió de nuevo.`, 'info');
          if (qid) importQueue.set(qid, 'completada', 'duplicado: referencia existente');
        } else {
          toast(
            `"${track.title}" importada · ${track.bpm ? `${track.bpm.toFixed(1)} BPM · ` : ''}${formatKey(track.key)}`,
            'ok',
          );
          if (qid) importQueue.set(qid, 'completada');
        }
        refreshAll();
      } catch (error) {
        console.error(error);
        const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
        const message = quota
          ? 'Espacio insuficiente en el almacenamiento del navegador para este archivo.'
          : error instanceof Error
            ? error.message
            : String(error);
        toast(`Error importando "${file.name}": ${message}`, 'error');
        if (qid) importQueue.set(qid, 'error', message.slice(0, 120));
      }
    }
  }

  const bufferCache = new Map<string, AudioBuffer>();
  let preloadInFlight: string | null = null;
  let crossfading = false;
  let gaplessScheduled: string | null = null;

  /** Decodifica una pista con caché LRU (precarga para crossfade/gapless). */
  async function decodeTrackBuffer(trackId: string): Promise<AudioBuffer | null> {
    const cached = bufferCache.get(trackId);
    if (cached) return cached;
    const bytes = await store.getBytes(trackId);
    if (!bytes) return null;
    const ctx = ensureEngine();
    const buffer = await decodeAudioBytes(ctx, bytes.buffer as ArrayBuffer);
    if (buffer) {
      bufferCache.set(trackId, buffer);
      if (bufferCache.size > 4) {
        const oldest = bufferCache.keys().next().value;
        if (oldest) bufferCache.delete(oldest);
      }
    }
    return buffer;
  }

  /** Actualiza estado, deck view y Media Session para una pista ya cargada. */
  function applyLoadedTrackMetadata(trackId: string, deckId: DeckId, buffer: AudioBuffer): boolean {
    const meta = library.getTrack(trackId);
    if (!meta?.hasAudio) return false;
    state.baseBpm[deckId] = meta.bpm;
    state.bpmSource[deckId] = meta.bpmSource;
    state.loadedTrackId[deckId] = trackId;
    state.loadedMeta[deckId] = meta;
    deckViews[deckId].setTrack({
      title: meta.title,
      artist: meta.artist,
      keyLabel: formatKey(meta.key),
      genre: meta.genre ?? '',
      bpm: meta.bpm,
      bpmSource: meta.bpmSource,
      durationSec: buffer.duration,
      peaks: meta.peaks,
      artwork: meta.artwork ?? null,
      hotCues: meta.hotCues ?? new Array<number | null>(8).fill(null),
      lyrics: meta.lyrics,
    });
    if (recorder && recorder.state !== 'idle') sessionTracks.add(trackId);
    if (playHistory[playHistory.length - 1] !== trackId) playHistory.push(trackId);
    if (playHistory.length > 100) playHistory.shift();
    syncMediaTrack(deckId);
    return true;
  }

  /** Aplica una pista ya decodificada a un deck y sincroniza toda la UI. */
  function applyTrackToDeck(trackId: string, deckId: DeckId, buffer: AudioBuffer): boolean {
    const meta = library.getTrack(trackId);
    if (!meta?.hasAudio) return false;
    const deck = engine.deck(deckId);
    deck.load(buffer); // el estado del mezclador sobrevive a la carga
    deck.setSpeed(playback.speed);
    deck.setNormalizationGain(playback.normalize ? normalizationGainDb(meta.loudnessLufs) : 0);
    deck.onEnded = () => void handleDeckEnded(deckId);
    void deck.setKeylock(playback.keylock).then((ok) => {
      if (playback.keylock && !ok) toast('Keylock no disponible en este navegador (sin AudioWorklet).', 'error');
    });
    return applyLoadedTrackMetadata(trackId, deckId, buffer);
  }

  async function loadTrackToDeck(trackId: string, deckId: DeckId): Promise<boolean> {
    const meta = library.getTrack(trackId);
    if (!meta) return false;
    if (!meta.hasAudio) {
      toast('Esa pista es solo metadatos: busca una fuente de audio autorizada primero (Fuente…).', 'error');
      return false;
    }
    const buffer = await decodeTrackBuffer(trackId);
    if (!buffer) {
      toast(`No se pudo decodificar "${meta.fileName}" ahora mismo.`, 'error');
      return false;
    }
    const ok = applyTrackToDeck(trackId, deckId, buffer);
    refreshAll();
    return ok;
  }

  /** Precarga la siguiente pista de la cola para que el salto no espere al decoder. */
  async function preloadNextTrack(): Promise<void> {
    if (crossfading || preloadInFlight) return;
    const nextId = nextQueueId();
    if (!nextId || bufferCache.has(nextId)) return;
    preloadInFlight = nextId;
    try {
      await decodeTrackBuffer(nextId);
    } catch {
      /* la precarga es best-effort */
    } finally {
      preloadInFlight = null;
    }
  }

  /** Crossfade automático de dos decks cuando quedan N segundos de la pista. */
  async function maybeCrossfade(): Promise<void> {
    if (playback.crossfadeSec <= 0 || crossfading || playback.repeat === 'one') return;
    const from = activeDeckId();
    const fromDeck = engine.peekDeck(from);
    if (!fromDeck?.isPlaying || fromDeck.duration <= 0) return;
    const remaining = (fromDeck.duration - fromDeck.position) / Math.max(0.01, fromDeck.rate * fromDeck.speed);
    if (remaining > playback.crossfadeSec) {
      void preloadNextTrack();
      return;
    }
    const to: DeckId = from === 'A' ? 'B' : 'A';
    const toDeck = engine.peekDeck(to);
    if (toDeck?.isPlaying) return;
    const nextId = nextQueueId();
    if (!nextId) return;
    crossfading = true;
    try {
      const buffer = await decodeTrackBuffer(nextId);
      if (!buffer) {
        crossfading = false;
        return;
      }
      if (!applyTrackToDeck(nextId, to, buffer)) {
        crossfading = false;
        return;
      }
      await library.dequeue(nextId);
      if (playback.shuffle) shuffleHistory.push(nextId);
      consumedQueue.push(nextId);
      const target = engine.deck(to);
      target.setFade(0, 0);
      target.play();
      target.setFade(1, playback.crossfadeSec);
      fromDeck.setFade(0, playback.crossfadeSec);
      if (state.loadedTrackId[from]) {
        void library.logPlayed(state.loadedTrackId[from]!, from, fromDeck.duration);
      }
      refreshAll();
      window.setTimeout(() => {
        fromDeck.pause();
        fromDeck.setFade(1, 0);
        crossfading = false;
      }, playback.crossfadeSec * 1000 + 100);
    } catch {
      crossfading = false;
    }
  }

  /** Aplica la pista que ya arrancó por gapless (el deck ya cambió de buffer). */
  function applyQueuedTrack(trackId: string, deckId: DeckId, buffer: AudioBuffer): void {
    const meta = library.getTrack(trackId);
    if (!meta?.hasAudio) return;
    const oldTrack = state.loadedTrackId[deckId];
    const deck = engine.deck(deckId);
    deck.setNormalizationGain(playback.normalize ? normalizationGainDb(meta.loudnessLufs) : 0);
    applyLoadedTrackMetadata(trackId, deckId, buffer);
    if (oldTrack) void library.logPlayed(oldTrack, deckId, deck.duration);
    void library.dequeue(trackId).then(() => refreshAll());
    consumedQueue.push(trackId);
    if (playback.shuffle) shuffleHistory.push(trackId);
    refreshAll();
  }

  /** Gapless: programa la siguiente pista antes de que acabe la actual. */
  async function maybeGapless(): Promise<void> {
    if (playback.crossfadeSec > 0 || !queueAuto || playback.repeat === 'one') return;
    const from = activeDeckId();
    const deck = engine.peekDeck(from);
    if (!deck?.isPlaying) {
      if (gaplessScheduled) gaplessScheduled = null;
      return;
    }
    if (deck.reversed || deck.beatRepeatActive) return;
    if (gaplessScheduled) {
      if (!deck.hasScheduledNext) gaplessScheduled = null;
      return;
    }
    if (deck.duration <= 0) return;
    const remaining = (deck.duration - deck.position) / Math.max(0.01, deck.rate * deck.speed);
    if (remaining > 2 || remaining <= 0.05) return;
    const nextId = nextQueueId();
    if (!nextId || nextId === state.loadedTrackId[from]) return;
    const buffer = await decodeTrackBuffer(nextId);
    if (!buffer) return;
    if (!deck.isPlaying) return;
    const scheduled = deck.scheduleNext(buffer, () => {
      gaplessScheduled = null;
      applyQueuedTrack(nextId, from, buffer);
    });
    if (scheduled !== null) gaplessScheduled = nextId;
  }

  /** Reproduce una pista en el deck libre (Inicio, búsqueda y colecciones). */
  async function playTrack(trackId: string): Promise<void> {
    const deckId = idleDeckId();
    const ok = await loadTrackToDeck(trackId, deckId);
    if (ok) engine.deck(deckId).play();
  }

  /** Copia un deep link de la vista actual (o de la ruta indicada). */
  async function copyLink(route: Route = router.current()): Promise<void> {
    const url = router.shareUrl(route);
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado al portapapeles.', 'ok');
    } catch {
      toast(url, 'info');
    }
  }

  async function removeTrack(trackId: string): Promise<void> {
    const snapshot = library.getTrack(trackId);
    const snapshotCopy = snapshot ? (structuredClone(snapshot) as TrackMeta) : null;
    await library.removeTrack(trackId);
    for (const id of ['A', 'B'] as const) {
      if (state.loadedTrackId[id] === trackId) {
        state.loadedTrackId[id] = null;
        state.loadedMeta[id] = null;
        state.baseBpm[id] = null;
        if (engine.booted) engine.deck(id).stop();
        deckViews[id].clearTrack();
      }
    }
    refreshAll();
    if (snapshotCopy) {
      const removed = snapshotCopy;
      toast(`"${removed.title}" eliminada de la biblioteca.`, 'info', {
        label: 'Deshacer',
        onClick: () => {
          void library.restoreFromTrash(removed.id).then((restored) => {
            toast(restored ? 'Pista restaurada.' : 'Ya no está en la papelera.', restored ? 'ok' : 'info');
            refreshAll();
          });
        },
      });
    }
  }

  /** Elige la siguiente pista de la cola respetando shuffle. */
  function nextQueueId(): string | null {
    if (library.queue.length === 0) return null;
    if (!playback.shuffle) return library.queue[0] ?? null;
    const index = Math.floor(Math.random() * library.queue.length);
    return library.queue[index] ?? library.queue[0] ?? null;
  }

  /** Carga la siguiente pista de la cola en un deck (auto-DJ o manual). */
  async function loadNextInto(deckId: DeckId, autoplay: boolean): Promise<void> {
    if (library.queue.length === 0 && playback.repeat === 'all' && consumedQueue.length > 0) {
      await library.enqueueMany(consumedQueue);
      consumedQueue = [];
    }
    const head = nextQueueId();
    if (!head) {
      toast('La cola está vacía.', 'info');
      return;
    }
    const ok = await loadTrackToDeck(head, deckId);
    if (!ok) {
      await library.dequeue(head); // pista rota: fuera de la cola
      refreshAll();
      return;
    }
    await library.dequeue(head);
    if (playback.shuffle) shuffleHistory.push(head);
    consumedQueue.push(head);
    refreshAll();
    if (autoplay) engine.deck(deckId).play();
    syncMediaTrack(deckId);
  }

  function activeDeckId(): DeckId {
    if (engine.booted) {
      const playing = (['A', 'B'] as const).find((id) => engine.deck(id).isPlaying);
      if (playing) return playing;
    }
    return state.loadedTrackId.A ? 'A' : state.loadedTrackId.B ? 'B' : 'A';
  }

  async function nextFromQueue(): Promise<void> {
    await loadNextInto(activeDeckId(), true);
  }

  async function playFromQueue(trackId: string): Promise<void> {
    const deckId = idleDeckId();
    const ok = await loadTrackToDeck(trackId, deckId);
    if (!ok) return;
    await library.dequeue(trackId);
    consumedQueue.push(trackId);
    engine.deck(deckId).play();
    refreshAll();
  }

  async function previousTrack(): Promise<void> {
    const deckId = activeDeckId();
    const deck = engine.deck(deckId);
    if (deck.position > 3) {
      deck.seek(0);
      return;
    }
    const current = state.loadedTrackId[deckId];
    let previous: string | undefined;
    while (playHistory.length > 0) {
      const candidate = playHistory.pop();
      if (candidate && candidate !== current) {
        previous = candidate;
        break;
      }
    }
    if (!previous) {
      deck.seek(0);
      toast('No hay una pista anterior en esta sesión.', 'info');
      return;
    }
    const ok = await loadTrackToDeck(previous, deckId);
    if (ok) deck.play();
  }

  function persistPlayback(): void {
    savePlaybackSettings(playback);
  }

  function toggleShuffle(): void {
    playback.shuffle = !playback.shuffle;
    persistPlayback();
    if (!playback.shuffle) shuffleHistory.length = 0;
    toast(playback.shuffle ? 'Aleatorio activado: la cola se reproducirá en orden aleatorio.' : 'Aleatorio desactivado.', 'ok');
  }

  function cycleRepeat(): void {
    const order: RepeatMode[] = ['off', 'all', 'one'];
    const index = order.indexOf(playback.repeat);
    playback.repeat = order[(index + 1) % order.length] ?? 'off';
    persistPlayback();
    const label = playback.repeat === 'one' ? 'Repetir una pista' : playback.repeat === 'all' ? 'Repetir toda la cola' : 'Sin repetición';
    toast(`Modo repetición: ${label}.`, 'ok');
  }

  function setPlaybackSpeed(speed: number): void {
    playback.speed = Math.min(2, Math.max(0.5, speed));
    persistPlayback();
    if (engine.booted) {
      engine.deckA.setSpeed(playback.speed);
      engine.deckB.setSpeed(playback.speed);
    }
    toast(`Velocidad: ${playback.speed}×.`, 'info');
  }

  function applyNormalization(): void {
    for (const deckId of ['A', 'B'] as const) {
      const meta = state.loadedMeta[deckId];
      if (!meta || !engine.booted) continue;
      engine.deck(deckId).setNormalizationGain(playback.normalize ? normalizationGainDb(meta.loudnessLufs) : 0);
    }
  }

  function openEq(): void {
    openEqPanel({
      gains: playback.masterEq,
      normalize: playback.normalize,
      onGains: (gains) => {
        playback.masterEq = gains;
        persistPlayback();
        ensureEngine();
        engine.setMasterEqGains(gains);
      },
      onNormalize: (enabled) => {
        playback.normalize = enabled;
        persistPlayback();
        applyNormalization();
      },
    });
  }

  function openSleepTimer(): void {
    const modal = openModal({ title: 'Temporizador de apagado', className: 'sleep-modal' });
    const hint = h('p', {
      className: 'modal-hint',
      text: 'El volumen baja suavemente y la reproducción se pausa al terminar la cuenta. La cola y los decks se conservan.',
    });
    const options = h('div', { className: 'sleep-options' });
    for (const minutes of [15, 30, 45, 60]) {
      const button = h('button', { className: 'btn btn-mini sleep-option', text: `${minutes} min` });
      button.type = 'button';
      button.addEventListener('click', () => {
        sleepTimer.arm(minutes);
        toast(`Temporizador: ${minutes} minutos.`, 'ok');
        modal.close();
      });
      options.appendChild(button);
    }
    const cancel = h('button', { className: 'btn btn-ghost btn-mini', text: 'Cancelar temporizador' });
    cancel.type = 'button';
    cancel.disabled = sleepRemainingSec === null;
    cancel.addEventListener('click', () => {
      sleepTimer.cancel();
      toast('Temporizador cancelado.', 'info');
      modal.close();
    });
    modal.body.append(hint, options, cancel);
  }

  function sleepNow(): void {
    if (!engine.booted) {
      toast('Temporizador: no había reproducción activa.', 'info');
      return;
    }
    engine.fadeMaster(0, 4);
    window.setTimeout(() => {
      engine.deckA.pause();
      engine.deckB.pause();
      engine.fadeMaster(masterVolume, 0.4);
      toast('Temporizador: reproducción pausada. Buenas noches.', 'info');
    }, 4200);
  }

  function syncMediaTrack(deckId: DeckId): void {
    const meta = state.loadedMeta[deckId];
    const deck = engine.booted ? engine.deck(deckId) : null;
    if (!meta || !deck) {
      updateSessionTrack(null);
      return;
    }
    updateSessionTrack({
      title: meta.title,
      artist: meta.artist,
      album: meta.album || 'AudioLad Studio',
      artwork: meta.artwork,
      duration: deck.duration,
    });
  }

  function idleDeckId(): DeckId {
    if (engine.booted) {
      if (!engine.deck('A').isPlaying) return 'A';
      if (!engine.deck('B').isPlaying) return 'B';
    }
    return 'A';
  }

  async function handleDeckEnded(deckId: DeckId): Promise<void> {
    const trackId = state.loadedTrackId[deckId];
    if (trackId) await library.logPlayed(trackId, deckId, engine.deck(deckId).duration);

    if (playback.repeat === 'one' && trackId) {
      const ok = await loadTrackToDeck(trackId, deckId);
      if (ok) engine.deck(deckId).play();
      refreshAll();
      return;
    }

    if (queueAuto) {
      if (library.queue.length > 0) {
        toast(`Deck ${deckId}: siguiente de la cola…`, 'info');
        await loadNextInto(deckId, true);
      } else if (playback.repeat === 'all' && consumedQueue.length > 0) {
        await library.enqueueMany(consumedQueue);
        consumedQueue = [];
        toast('Repetir todo: reconstruyo la cola de la sesión.', 'info');
        await loadNextInto(deckId, true);
      }
    }
    refreshAll();
  }

  // ---------- Callbacks de deck ----------
  function deckCallbacks(id: DeckId) {
    const view = () => deckViews[id];
    return {
      onPlayPause: () => {
        const d = engine.deck(id);
        if (!d.hasTrack) return;
        if (d.isPlaying) d.pause();
        else d.play();
      },
      onStop: () => engine.deck(id).stop(),
      onCueJump: () => engine.deck(id).cueJump(),
      onCueSet: () => {
        const d = engine.deck(id);
        d.setCue();
        toast(`Cue ${id} fijado en ${d.position.toFixed(1)}s`, 'ok');
      },
      onLoopIn: () => engine.deck(id).loopIn(),
      onLoopOut: () => engine.deck(id).loopOut(),
      onLoopExit: () => engine.deck(id).setLoop(null),
      onLoopBeats: (beats: LoopBeats) => {
        const d = engine.deck(id);
        const bpm = state.baseBpm[id];
        const beatSec = beatSeconds(bpm ?? NaN, d.rate * d.speed);
        if (!beatSec) {
          toast('Los loops por beat necesitan BPM conocido (fija o ajusta el BPM).', 'error');
          return;
        }
        const region = beatLoop(d.position, beatSec, beats, d.duration);
        if (!region) {
          toast('Ese loop no cabe desde esta posición.', 'error');
          return;
        }
        d.setLoop(region);
      },
      onBeatJump: (beats: number) => {
        const d = engine.deck(id);
        const beatSec = beatSeconds(state.baseBpm[id] ?? NaN, d.rate * d.speed);
        if (!beatSec) {
          toast('Beat jump necesita BPM conocido.', 'error');
          return;
        }
        d.beatJump(beats, beatSec);
      },
      onLoopRoll: () => {
        const d = engine.deck(id);
        const beatSec = beatSeconds(state.baseBpm[id] ?? NaN, d.rate * d.speed);
        if (!beatSec) {
          toast('Loop roll necesita BPM conocido.', 'error');
          return;
        }
        d.loopRoll(4, beatSec);
      },
      onSlipToggle: () => {
        const d = engine.deck(id);
        d.setSlip(!d.slip);
        toast(`Deck ${id}: slip ${d.slip ? 'activado' : 'desactivado'}.`, 'info');
      },
      onShowLyrics: () => {
        const meta = state.loadedMeta[id];
        if (!meta?.lyrics) {
          toast('Esta pista no tiene letra. Añádela desde Biblioteca → Metadatos.', 'info');
          return;
        }
        openLyricsPanel(meta.lyrics, meta.title, () => engine.deck(id).position);
      },
      onPitch: (rate: number) => {
        engine.deck(id).setRate(rate);
        markMixerDirty();
      },
      onPitchReset: () => {
        engine.deck(id).setRate(1);
        markMixerDirty();
      },
      onSync: () => {
        const otherId: DeckId = id === 'A' ? 'B' : 'A';
        const target = effectiveBpm(state.baseBpm[otherId], engine.deck(otherId).rate * engine.deck(otherId).speed);
        const base = state.baseBpm[id];
        if (!base || !target) {
          toast('Sync necesita BPM conocidos en ambos decks.', 'error');
          return;
        }
        const rate = syncRate(base, target);
        if (rate === null) {
          toast(`Fuera de rango de pitch (±8%): ${base.toFixed(1)} → ${target.toFixed(1)} BPM.`, 'error');
          return;
        }
        const d = engine.deck(id);
        d.setRate(rate);
        view().setPitchDisplay(rate);
        markMixerDirty();
        toast(`Deck ${id} sincronizado a ${target.toFixed(1)} BPM.`, 'ok');
      },
      onWaveSeek: (seconds: number) => engine.deck(id).seek(seconds),
      onJogScrub: (deltaSec: number) => {
        const d = engine.deck(id);
        d.seek(d.position + deltaSec);
      },
      onJogNudge: (factor: number) => engine.deck(id).setNudge(factor),
      onJogEnd: () => engine.deck(id).clearNudge(),
      onFx: (kind: FxKind | null) => {
        const d = engine.deck(id);
        const beatSec = beatSeconds(state.baseBpm[id] ?? NaN, d.rate * d.speed);
        if (kind !== 'reverse') d.setReverse(false);
        if (kind !== 'beatrepeat') d.stopBeatRepeat();
        if (kind === 'reverse') {
          d.setFx(null);
          d.setReverse(true);
          return;
        }
        if (kind === 'beatrepeat') {
          d.setFx(null);
          if (!beatSec) {
            toast('Beat repeat necesita BPM conocido.', 'error');
            return;
          }
          d.startBeatRepeat(beatSec);
          return;
        }
        d.setFx(kind);
        if (kind === 'echo' && beatSec) d.setFxTime(beatSec * 0.75); // echo sincronizado (dotted ⅛)
      },
      onFxAmount: (amount: number) => engine.deck(id).setFxAmount(amount),
      onHotCue: (index: number, action: 'hit' | 'set' | 'clear') => {
        const trackId = state.loadedTrackId[id];
        if (!trackId) {
          toast(`Deck ${id} no tiene pista.`, 'error');
          return;
        }
        const d = engine.deck(id);
        const meta = library.getTrack(trackId);
        const cues = meta?.hotCues ?? new Array<number | null>(8).fill(null);
        if (action === 'set' || (action === 'hit' && cues[index] == null)) {
          const pos = d.position;
          void library.setHotCue(trackId, index as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7, pos).then(() => {
            const updated = library.getTrack(trackId)?.hotCues ?? cues;
            view().refreshHotCues(updated);
            state.loadedMeta[id] = library.getTrack(trackId);
            toast(`Hot cue ${index + 1} fijado en ${pos.toFixed(1)}s.`, 'ok');
          });
          return;
        }
        if (action === 'clear') {
          void library.setHotCue(trackId, index as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7, null).then(() => {
            const updated = library.getTrack(trackId)?.hotCues ?? cues;
            view().refreshHotCues(updated);
            state.loadedMeta[id] = library.getTrack(trackId);
          });
          return;
        }
        const pos = cues[index];
        if (pos != null) d.seek(pos);
      },
      onBpmSet: (bpm: number) => {
        const trackId = state.loadedTrackId[id];
        if (!trackId) return;
        void library.setBpm(trackId, bpm, 'manual').then(() => {
          state.baseBpm[id] = bpm;
          state.bpmSource[id] = 'manual';
          state.loadedMeta[id] = library.getTrack(trackId);
          deckViews[id].refreshBpm(bpm, 'manual');
          refreshAll();
        });
      },
      onBpmMultiply: (factor: 2 | 0.5) => {
        const trackId = state.loadedTrackId[id];
        const base = state.baseBpm[id];
        if (!trackId || !base) return;
        const next = Math.round(base * factor * 10) / 10;
        void library.setBpm(trackId, next, 'manual').then(() => {
          state.baseBpm[id] = next;
          state.bpmSource[id] = 'manual';
          state.loadedMeta[id] = library.getTrack(trackId);
          deckViews[id].refreshBpm(next, 'manual');
          refreshAll();
        });
      },
    };
  }

  // ---------- Vistas ----------
  const mixerView = new MixerView({
    onTrim: (deck, gain) => {
      engine.deck(deck).setTrim(gain);
      markMixerDirty();
    },
    onEq: (deck, band: EqBand, db) => {
      engine.deck(deck).setEq(band, db);
      markMixerDirty();
    },
    onFilter: (deck, position) => {
      engine.deck(deck).setFilter(position);
      markMixerDirty();
    },
    onVolume: (deck, position) => {
      engine.deck(deck).setVolume(position);
      markMixerDirty();
    },
    onCueToggle: (deck, on) => engine.deck(deck).setCueSend(on),
    onMaster: (pos) => {
      engine.setMasterVolume(pos);
      markMixerDirty();
    },
    onLimiterToggle: (enabled) => {
      engine.setLimiterEnabled(enabled);
      markMixerDirty();
    },
    onCrossfader: (pos) => {
      engine.setCrossfader(pos);
      markMixerDirty();
    },
    onCueMix: (mix) => {
      engine.setCueMix(mix);
      markMixerDirty();
    },
  });

  // ---------- Reproducción previa real (HTMLAudio independiente de los decks) ----------
  const previewAudio = new Audio();
  previewAudio.volume = 0.9;
  let previewTrackId: string | null = null;
  let previewUrl: string | null = null;

  async function togglePreview(trackId: string): Promise<void> {
    if (previewTrackId === trackId && !previewAudio.paused) {
      previewAudio.pause();
      libraryView.setPreview(null);
      previewTrackId = null;
      return;
    }
    const bytes = await store.getBytes(trackId);
    if (!bytes) {
      toast('No encontré los bytes de esa pista.', 'error');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer]));
    previewAudio.src = previewUrl;
    previewAudio.onended = () => {
      libraryView.setPreview(null);
      previewTrackId = null;
    };
    previewTrackId = trackId;
    libraryView.setPreview(trackId);
    try {
      await previewAudio.play();
    } catch {
      toast('El navegador bloqueó la reproducción: interactúa con la página y repite.', 'error');
    }
  }

  // ---------- Spotify (metadatos oficiales; sin audio protegido) ----------
  async function importSpotifyPlaylist(rawUrl: string): Promise<void> {
    const check = parseSpotifyPlaylistUrl(rawUrl);
    if (!check.ok) {
      toast(check.reason, 'error');
      return;
    }
    toast('Pidiendo metadatos a la API de Spotify…');
    const result = await fetchSpotifyPlaylist(rawUrl);
    if (!result.ok) {
      toast(result.error, 'error');
      if (result.detail) console.warn('Detalle Spotify:', result.detail);
      return;
    }
    const { playlist } = result;
    const created = await library.createPlaylist(playlist.name, playlist.coverUrl ?? undefined);
    importQueue.begin(playlist.tracks.map((t) => `${t.artists} — ${t.title}`));
    switchTab('lotes');
    for (const t of playlist.tracks) {
      const dup = library.findDuplicate(undefined, t.spotifyId);
      if (dup) {
        await library.addToPlaylist(created.id, dup.id);
        importQueue.set(t.spotifyId, 'completada', 'referencia (ya en biblioteca)');
        continue;
      }
      const createdTrack = await library.addMetadataTrack({
        fileName: `${t.artists} - ${t.title}.spotify`,
        title: t.title,
        artist: t.artists || 'Desconocido',
        album: t.album,
        bpm: null,
        bpmSource: 'estimated',
        durationSec: t.durationMs / 1000,
        sizeBytes: 0,
        peaks: [],
        key: null,
        genre: '',
        date: t.releaseDate,
        trackNumber: t.trackNumber !== null ? String(t.trackNumber) : undefined,
        artwork: t.coverUrl ?? undefined,
        origin: { type: 'spotify', sourceUrl: t.spotifyUrl },
        spotifyId: t.spotifyId,
        favorite: false,
        hotCues: new Array<number | null>(8).fill(null),
        playCount: 0,
        lastPlayedAt: null,
      });
      await library.addToPlaylist(created.id, createdTrack.id);
      importQueue.set(t.spotifyId, 'pendiente', 'requiere fuente de audio autorizada');
    }
    refreshAll();
    toast(
      `Playlist "${playlist.name}" de ${playlist.owner}: ${playlist.tracks.length} referencias creadas, pendientes de fuente de audio autorizada.`,
      'ok',
    );
  }

  /** Busca candidatos REALES (yt-dlp) para una pista solo-metadatos. */
  async function findSources(trackId: string): Promise<void> {
    const meta = library.getTrack(trackId);
    if (!meta) return;
    const query = [meta.artist !== 'Desconocido' ? meta.artist : '', meta.title].filter(Boolean).join(' ').trim();
    toast(`Buscando fuentes para "${meta.title}"…`);
    const result = await matchCandidates(query);
    if (!result.ok) {
      libraryView.showMatchError(result.error, result.detail);
      toast(result.error, 'error');
      return;
    }
    libraryView.showCandidates(trackId, result.candidates);
    if (result.candidates.length === 0) toast('Sin resultados para esa búsqueda.', 'info');
  }

  /** Trae el audio EXACTO elegido por el usuario (sin sustituir versiones). */
  async function pickSource(trackId: string, url: string): Promise<void> {
    const meta = library.getTrack(trackId);
    if (!meta) return;
    toast(`Trayendo audio elegido para "${meta.title}"…`);
    const result = await requestAudio(url, 'original');
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const hash = await sha256Hex(bytes);
    if (library.findDuplicate(hash)) {
      toast('Ese audio ya está en la biblioteca (duplicado por contenido).', 'info');
      return;
    }
    let analysis: Awaited<ReturnType<typeof analyzeBytes>>;
    try {
      analysis = await analyzeBytes(bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await library.setAnalysis(trackId, 'failed', message);
      refreshAll();
      toast(`El audio llegó pero no se pudo analizar: ${message}`, 'error');
      return;
    }
    await library.attachAudio(trackId, bytes, {
      fileName: result.fileName,
      durationSec: analysis.buffer.duration,
      sizeBytes: bytes.byteLength,
      peaks: analysis.peaks,
      bpm: analysis.bpm,
      bpmSource: analysis.bpmSource,
      key: analysis.key,
      contentHash: hash,
      quality: result.quality,
      origin: { type: 'match', sourceUrl: url },
      analysis: analysisState(analysis.bpm, analysis.key),
      analysisError: undefined,
    });
    refreshAll();
    const q = result.quality;
    toast(
      `"${meta.title}" tiene audio: ${q.format}${q.bitrateKbps != null ? ` · ${q.bitrateKbps} kbps` : ''} (fuente elegida por ti).`,
      'ok',
    );
  }

  // ---------- Acciones por lotes ----------
  async function batchToDeck(deckId: DeckId, trackIds: string[]): Promise<void> {
    const first = trackIds.map((id) => library.getTrack(id)).find((t) => t?.hasAudio);
    if (!first) {
      toast('Ninguna de las pistas elegidas tiene audio todavía.', 'error');
      return;
    }
    const ok = await loadTrackToDeck(first.id, deckId);
    if (ok) toast(`"${first.title}" → Deck ${deckId} (primera de ${trackIds.length} elegidas).`, 'ok');
  }

  async function batchReanalyze(trackIds: string[]): Promise<void> {
    importQueue.begin(trackIds.map((id) => library.getTrack(id)?.title ?? id));
    switchTab('lotes');
    let index = 0;
    for (const id of trackIds) {
      await reanalyzeTrack(id);
      importQueue.set(String(index), library.getTrack(id)?.analysis === 'failed' ? 'error' : 'completada');
      index += 1;
    }
  }

  async function batchRemove(trackIds: string[]): Promise<void> {
    if (!window.confirm(`¿Quitar ${trackIds.length} pistas de la biblioteca? Los archivos se borran del almacenamiento.`)) return;
    for (const id of trackIds) await removeTrack(id);
    checkedClear();
    refreshAll();
  }

  function checkedClear(): void {
    // La vista limpia su propia selección al re-renderizar la barra.
  }

  async function applyBatchMetadata(
    ids: string[],
    patch: Partial<Pick<TrackMeta, 'artist' | 'album' | 'genre' | 'tags' | 'lyrics'>>,
  ): Promise<void> {
    let updated = 0;
    for (const id of ids) {
      const result = await library.updateMetadata(id, patch);
      if (result) updated += 1;
    }
    toast(`Metadatos actualizados en ${updated} pistas.`, 'ok');
    refreshAll();
  }

  interface MusicBrainzRecording {
    id: string;
    title: string;
    'artist-credit'?: { name?: string }[];
    releases?: { id?: string; title?: string; date?: string }[];
  }

  async function enrichTrack(trackId: string): Promise<void> {
    const meta = library.getTrack(trackId);
    if (!meta) return;
    const query = `recording:"${meta.title.replace(/"/g, '')}" AND artist:"${meta.artist.replace(/"/g, '')}"`;
    try {
      toast('Consultando MusicBrainz…', 'info');
      const response = await fetch(
        `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) throw new Error(`MusicBrainz respondió ${response.status}.`);
      const data = (await response.json()) as { recordings?: MusicBrainzRecording[] };
      const recordings = data.recordings ?? [];
      if (recordings.length === 0) {
        toast('MusicBrainz no encontró coincidencias.', 'info');
        return;
      }
      const modal = openModal({ title: `MusicBrainz · ${meta.title}`, className: 'enrich-modal' });
      modal.body.appendChild(
        h('p', {
          className: 'modal-hint',
          text: 'Elige la grabación correcta. Nada se sustituye automáticamente: tú confirmas los metadatos.',
        }),
      );
      const list = h('div', { className: 'enrich-list' });
      for (const recording of recordings) {
        const release = recording.releases?.[0];
        const artists = (recording['artist-credit'] ?? []).map((credit) => credit.name ?? '').filter(Boolean).join(', ');
        const item = h('button', { className: 'enrich-item', attrs: { type: 'button' } });
        item.append(
          h('strong', { text: recording.title }),
          h('span', { text: `${artists || meta.artist}${release?.title ? ` · ${release.title}` : ''}${release?.date ? ` · ${release.date.slice(0, 4)}` : ''}` }),
        );
        item.addEventListener('click', () => {
          void (async () => {
            const patch: Partial<Pick<TrackMeta, 'artist' | 'album' | 'date'>> = {};
            if (artists) patch.artist = artists;
            if (release?.title) patch.album = release.title;
            if (release?.date) patch.date = release.date.slice(0, 4);
            if (Object.keys(patch).length > 0) await library.updateMetadata(trackId, patch);
            if (release?.id) {
              try {
                const cover = await fetch(`https://coverartarchive.org/release/${release.id}/front-500`, { redirect: 'follow' });
                if (cover.ok) {
                  const blob = await cover.blob();
                  const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(blob);
                  });
                  await library.updateMetadata(trackId, { artwork: dataUrl });
                }
              } catch {
                /* sin portada disponible */
              }
            }
            toast('Metadatos enriquecidos desde MusicBrainz.', 'ok');
            modal.close();
            refreshAll();
          })();
        });
        list.appendChild(item);
      }
      modal.body.appendChild(list);
    } catch (error) {
      toast(`MusicBrainz no disponible: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  function openTrash(): void {
    const modal = openModal({ title: `Papelera (${library.trash.length})`, className: 'trash-modal' });
    if (library.trash.length === 0) {
      modal.body.appendChild(h('p', { className: 'modal-hint', text: 'La papelera está vacía.' }));
    } else {
      modal.body.appendChild(
        h('p', {
          className: 'modal-hint',
          text: 'Las pistas eliminadas conservan su audio hasta que vacíes la papelera.',
        }),
      );
      const list = h('div', { className: 'trash-list' });
      for (const entry of library.trash) {
        const row = h('div', { className: 'trash-row' });
        row.append(
          h('span', { className: 'trash-name', text: `${entry.track.artist} — ${entry.track.title}` }),
          h('small', { text: `eliminada ${entry.deletedAt.slice(0, 10)}` }),
        );
        const restore = h('button', { className: 'btn btn-mini', text: 'Restaurar', attrs: { type: 'button' } });
        restore.addEventListener('click', () => {
          void library.restoreFromTrash(entry.track.id).then(() => {
            modal.close();
            toast('Pista restaurada.', 'ok');
            refreshAll();
          });
        });
        row.appendChild(restore);
        list.appendChild(row);
      }
      modal.body.appendChild(list);
      const empty = h('button', { className: 'btn btn-danger btn-mini', text: 'Vaciar papelera', attrs: { type: 'button' } });
      empty.addEventListener('click', () => {
        if (!window.confirm('Se borrarán definitivamente el audio y los metadatos. ¿Continuar?')) return;
        void library.emptyTrash().then((count) => {
          modal.close();
          toast(`Papelera vaciada (${count} pistas).`, 'ok');
          refreshAll();
        });
      });
      modal.body.appendChild(empty);
    }
  }

  async function exportLibrary(): Promise<void> {
    try {
      toast(`Empaquetando ${library.tracks.length} pistas con su audio…`, 'info');
      const blob = await createLibraryBundle(library, store);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `audiolad-biblioteca-${date}.zip`);
      toast(`Biblioteca exportada (${(blob.size / 1024 / 1024).toFixed(1)} MB).`, 'ok');
    } catch (error) {
      toast(`No pude exportar la biblioteca: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  async function importBundle(files: File[]): Promise<void> {
    let added = 0;
    let skipped = 0;
    for (const file of files) {
      try {
        toast(`Importando ${file.name}…`, 'info');
        const result = await importLibraryBundle(new Uint8Array(await file.arrayBuffer()), library, store);
        added += result.tracksAdded;
        skipped += result.tracksSkipped;
        toast(
          `${file.name}: ${result.tracksAdded} pistas, ${result.playlistsAdded} playlists, ${result.smartAdded} inteligentes.` +
            (result.tracksSkipped > 0 ? ` ${result.tracksSkipped} ya existían.` : ''),
          'ok',
        );
      } catch (error) {
        toast(`Error importando ${file.name}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
    refreshAll();
    if (files.length > 1) toast(`Importación completa: ${added} pistas añadidas, ${skipped} omitidas.`, 'info');
  }

  async function setTrackArtwork(trackId: string, dataUrl: string | null): Promise<void> {
    if (!dataUrl) {
      await library.updateMetadata(trackId, { artwork: undefined });
      toast('Portada eliminada.', 'ok');
      refreshAll();
      return;
    }
    try {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const size = 640;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D no disponible.');
      const scale = Math.min(size / bitmap.width, size / bitmap.height);
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      ctx.drawImage(bitmap, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
      bitmap.close();
      await library.updateMetadata(trackId, { artwork: canvas.toDataURL('image/jpeg', 0.86) });
      toast('Portada actualizada.', 'ok');
      refreshAll();
    } catch (error) {
      toast(`No pude procesar la portada: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  async function downloadPlaylist(playlistId: string): Promise<void> {
    const playlist = library.playlists.find((item) => item.id === playlistId);
    if (!playlist) return;
    let count = 0;
    for (const trackId of playlist.trackIds) {
      const meta = library.getTrack(trackId);
      if (!meta?.hasAudio) continue;
      const bytes = await store.getBytes(trackId);
      if (!bytes) continue;
      downloadBlob(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' }), meta.fileName);
      count += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
    toast(count > 0 ? `Descargando ${count} archivos de la playlist…` : 'La playlist no tiene audio descargable.', count > 0 ? 'ok' : 'info');
  }

  const libraryView = new LibraryView({
    onImportFiles: (files) => void importFiles(files),
    onLoadToDeck: (trackId, deckId) => void loadTrackToDeck(trackId, deckId),
    onPreview: (trackId) => void togglePreview(trackId),
    onRemoveTrack: (trackId) => void removeTrack(trackId),
    onToggleFavorite: (trackId) =>
      void library.toggleFavorite(trackId).then(() => refreshAll()),
    onEnqueue: (trackId) =>
      void library.enqueue(trackId).then((added) => {
        if (!added) toast('Esa pista ya está en la cola.', 'info');
        refreshAll();
      }),
    onPlayNext: (trackId) =>
      void library.enqueueNext(trackId).then((ok) => {
        toast(ok ? 'Se reproducirá a continuación.' : 'No encontré esa pista.', ok ? 'ok' : 'error');
        refreshAll();
      }),
    onOpenAlbum: (album) => router.navigate({ name: 'album', album }),
    onOpenArtist: (artist) => router.navigate({ name: 'artist', artist }),
    onSetPlaylistCover: (playlistId, dataUrl) =>
      void library.setPlaylistCover(playlistId, dataUrl).then(() => {
        toast(dataUrl ? 'Portada actualizada.' : 'Portada eliminada.', 'ok');
        refreshAll();
      }),
    onReorderPlaylist: (playlistId, fromId, toId) =>
      void library.reorderPlaylist(playlistId, fromId, toId).then((moved) => {
        if (moved) refreshAll();
      }),
    onDownloadPlaylist: (playlistId) => void downloadPlaylist(playlistId),
    onBatchMetadata: (ids, patch) => void applyBatchMetadata(ids, patch),
    onEnrich: (trackId) => void enrichTrack(trackId),
    onExportBundle: () => void exportLibrary(),
    onImportBundle: (files) => void importBundle(files),
    onOpenTrash: () => openTrash(),
    onCreatePlaylist: (name) => void library.createPlaylist(name).then(refreshAll),
    onDeletePlaylist: (playlistId) => void library.deletePlaylist(playlistId).then(refreshAll),
    onAddToPlaylist: (playlistId, trackId) =>
      void library.addToPlaylist(playlistId, trackId).then((added) => {
        if (!added) toast('Esa referencia ya está en la playlist.', 'info');
        refreshAll();
      }),
    onRemoveFromPlaylist: (playlistId, trackId) =>
      void library.removeFromPlaylist(playlistId, trackId).then(refreshAll),
    onMove: (playlistId, trackId, delta) =>
      void library.moveInPlaylist(playlistId, trackId, delta).then(refreshAll),
    onUpdateMetadata: (trackId, patch) =>
      void library.updateMetadata(trackId, patch).then((updated) => {
        if (updated) toast('Metadatos actualizados.', 'ok');
        refreshAll();
      }),
    onReanalyze: (trackId) => void reanalyzeTrack(trackId),
    onSetArtwork: (trackId, dataUrl) => void setTrackArtwork(trackId, dataUrl),
    onBatchToDeck: (deckId, ids) => void batchToDeck(deckId, ids),
    onBatchToPlaylist: (playlistId, ids) => {
      let added = 0;
      const chain = ids.reduce<Promise<unknown>>((acc, id) => acc.then(() => library.addToPlaylist(playlistId, id).then((ok) => { if (ok) added += 1; })), Promise.resolve());
      void chain.then(() => {
        toast(`${added} referencias añadidas a la playlist.`, 'ok');
        refreshAll();
      });
    },
    onBatchReanalyze: (ids) => void batchReanalyze(ids),
    onBatchRemove: (ids) => void batchRemove(ids),
    onImportSpotify: (url) => void importSpotifyPlaylist(url),
    onFindSources: (trackId) => void findSources(trackId),
    onPickSource: (trackId, url) => void pickSource(trackId, url),
    onExportLibrary: () => {
      const doc = { app: 'audiolad-studio', kind: 'library-metadata', version: 1, exportedAt: new Date().toISOString(), data: library.exportDoc() };
      downloadJson(`audiolad-studio-biblioteca-${new Date().toISOString().slice(0, 10)}.json`, doc);
      toast('Metadatos exportados (los archivos de audio no viajan en el JSON).', 'ok');
    },
    onImportLibraryJson: (file) => {
      void file
        .text()
        .then((text) => {
          const parsed = JSON.parse(text) as { data?: Parameters<Library['importDoc']>[0] };
          const doc = parsed?.data ?? (parsed as Parameters<Library['importDoc']>[0]);
          if (!doc || !Array.isArray(doc.tracks)) throw new Error('El JSON no contiene pistas.');
          return library.importDoc(doc).then(({ added, skipped }) => {
            toast(`Metadatos importados: ${added} nuevas, ${skipped} duplicadas/omitidas.`, 'ok');
            refreshAll();
          });
        })
        .catch((error) => {
          console.error(error);
          toast(`JSON inválido: ${error instanceof Error ? error.message : String(error)}`, 'error');
        });
    },
    onCreateSmart: (spec: SmartPlaylist) => void library.saveSmartPlaylist(spec).then(refreshAll),
    onDeleteSmart: (id) => void library.removeSmartPlaylist(id).then(refreshAll),
  });
  libraryView.el.addEventListener('libtoast', (event) => {
    const detail = (event as CustomEvent<string>).detail;
    if (detail) toast(detail, 'info');
  });

  const importQueue = new ImportQueueView();

  const queueView = new QueueView(
    {
      onNext: () => void loadNextInto(idleDeckId(), true),
    onPlayNow: (trackId) => void playFromQueue(trackId),
      onRemove: (trackId) => void library.dequeue(trackId).then(refreshAll),
      onMove: (trackId, delta) => void library.moveInQueue(trackId, delta).then(refreshAll),
      onClear: () => void library.clearQueue().then(refreshAll),
      onSaveAsPlaylist: (name) =>
        void library.saveQueueAsPlaylist(name).then((playlist) => {
          if (playlist) toast(`Cola guardada como playlist "${name}".`, 'ok');
          refreshAll();
        }),
      onAutoToggle: (auto) => {
        queueAuto = auto;
      },
    },
    toast,
  );

  const samplerView = new SamplerView(
    {
      onTrigger: (pad) => {
        ensureEngine();
        return engine.sampler.play(pad);
      },
      onVolume: (position) => {
        ensureEngine();
        engine.sampler.bus.gain.setTargetAtTime(Math.max(0, Math.min(1, position)), engine.sampler.bus.context.currentTime, 0.02);
      },
    },
    toast,
  );

  async function exportRecording(recordingId: string, format: 'wav' | 'mp3'): Promise<void> {
    const rec = library.recordings.find((item) => item.id === recordingId);
    if (!rec) {
      toast('No encontré esa grabación.', 'error');
      return;
    }
    const bytes = await library.getRecordingBytes(recordingId);
    if (!bytes) {
      toast('No encontré los bytes de esa grabación.', 'error');
      return;
    }
    try {
      const ctx = ensureEngine();
      const buffer = await decodeAudioBytes(ctx, bytes.buffer as ArrayBuffer);
      if (!buffer) throw new Error('El navegador no pudo decodificar esta grabación.');
      toast(format === 'mp3' ? 'Codificando MP3…' : 'Preparando WAV…', 'info');
      const blob = format === 'wav' ? audioBufferToWav(buffer) : await audioBufferToMp3(buffer);
      const safeName = rec.name.replace(/[\\/:*?"<>|]/g, '_');
      downloadBlob(blob, `${safeName}.${format}`);
      toast(`Grabación exportada a ${format.toUpperCase()}.`, 'ok');
    } catch (error) {
      toast(`No se pudo exportar: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  const recorderView = new RecorderView(
    {
      onRecordStart: () => {
        ensureEngine();
        const stream = engine.recordStream;
        if (!stream) throw new Error('Este navegador no expone el stream de audio para grabar.');
        recorder = new MasterRecorder(stream);
        recorder.start(); // lanza si MediaRecorder no soporta audio
        sessionTracks = new Set(Object.values(state.loadedTrackId).filter((v): v is string => v !== null));
      },
      onRecordPause: () => recorder?.pause(),
      onRecordResume: () => recorder?.resume(),
      onRecordStopAndSave: async (name) => {
        if (!recorder) throw new Error('No hay grabación activa.');
        const result = await recorder.stop();
        recorder = null;
        if (!result) throw new Error('La grabación quedó vacía.');
        // Pistas cargadas durante la sesión completa.
        for (const id of ['A', 'B'] as const) {
          const tid = state.loadedTrackId[id];
          if (tid) sessionTracks.add(tid);
        }
        const bytes = new Uint8Array(await result.blob.arrayBuffer());
        return library.addRecording(
          {
            name,
            at: new Date().toISOString(),
            durationSec: result.durationSec,
            mimeType: result.mimeType,
            sizeBytes: bytes.byteLength,
            trackIds: [...sessionTracks],
          },
          bytes,
        );
      },
      onDiscard: async () => {
        if (recorder) {
          await recorder.stop();
          recorder = null;
        }
      },
      onDelete: (recordingId) => void library.removeRecording(recordingId).then(refreshAll),
      onExport: (recordingId, format) => void exportRecording(recordingId, format),
    },
    toast,
    MasterRecorder.available(),
  );
  recorderView.setBytesProvider((id) => library.getRecordingBytes(id));

  const historyView = new HistoryView({
    onClear: () => void library.clearHistory().then(refreshAll),
  });

  const converterView = new ConverterView(toast, {
    onAddToLibrary: async (blob, info) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length === 0) throw new Error('El audio traído está vacío.');
      const { track, duplicate } = await importAudioBytes(info.fileName, bytes, { type: 'convert', sourceUrl: info.sourceUrl }, info.quality);
      await library.logConversion(info.sourceUrl ?? '', track.title, track.fileName);
      refreshAll();
      if (duplicate) throw new Error(`ya estaba en la biblioteca como "${track.title}" (deduplicado por contenido)`);
      toast(
        `"${track.title}" añadida a la biblioteca · ${track.quality ? `${track.quality.format}${track.quality.bitrateKbps != null ? ` · ${track.quality.bitrateKbps} kbps` : ''}` : 'calidad registrada'}.`,
        'ok',
      );
    },
  });

  const settingsView = new SettingsView({
    onResetMixer: () => {
      const def = { ...DEFAULT_MIXER_STATE, decks: { A: { ...DEFAULT_MIXER_STATE.decks.A }, B: { ...DEFAULT_MIXER_STATE.decks.B } } };
      ensureEngine();
      engine.applyState(def);
      saveMixerState(def);
      mixerView.setFaders(def);
      for (const id of ['A', 'B'] as const) {
        deckViews[id].setPitchDisplay(1);
      }
      toast('Mezclador restablecido a sus valores por defecto.', 'ok');
    },
    onExportLibrary: () => {
      const doc = { app: 'audiolad-studio', kind: 'library-metadata', version: 1, exportedAt: new Date().toISOString(), data: library.exportDoc() };
      downloadJson(`audiolad-studio-biblioteca-${new Date().toISOString().slice(0, 10)}.json`, doc);
      toast('Metadatos exportados (formato JSON).', 'ok');
    },
    onConfigureShortcuts: () => openShortcuts(),
    onCrossfade: (seconds) => {
      playback.crossfadeSec = Math.min(12, Math.max(0, seconds));
      persistPlayback();
      toast(playback.crossfadeSec > 0 ? `Crossfade automático: ${playback.crossfadeSec} s.` : 'Crossfade desactivado (corte directo).', 'info');
      if (playback.crossfadeSec > 0) void preloadNextTrack();
    },
    onNormalize: (enabled) => {
      playback.normalize = enabled;
      persistPlayback();
      applyNormalization();
      toast(enabled ? 'Normalización de volumen activada.' : 'Normalización desactivada.', 'info');
    },
    onInstall: () => void pwa.promptInstall(),
    onKeylock: (enabled) => {
      playback.keylock = enabled;
      persistPlayback();
      if (!engine.booted) {
        toast(enabled ? 'Keylock se activará al iniciar el audio.' : 'Keylock desactivado.', 'info');
        return;
      }
      void Promise.all([engine.deckA.setKeylock(enabled), engine.deckB.setKeylock(enabled)]).then((results) => {
        const ok = results.every(Boolean);
        if (enabled && !ok) {
          playback.keylock = false;
          persistPlayback();
          settingsView.setPlaybackSettings(playback);
          toast('Keylock no disponible: este navegador no soporta AudioWorklet.', 'error');
          return;
        }
        toast(enabled ? 'Keylock activado.' : 'Keylock desactivado.', 'ok');
      });
    },
  });
  settingsView.setStorageKind(store.kind);
  settingsView.setPlaybackSettings(playback);
  settingsView.setInstallAvailable(pwa.installable);

  const helpView = new HelpView();

  const deckCbs = { A: deckCallbacks('A'), B: deckCallbacks('B') };
  // Acento CSS (var) para la UI + color concreto para el canvas de la waveform.
  const deckViews: Record<DeckId, DeckView> = {
    A: new DeckView('A', 'var(--accent-a)', '#2ff3cf', deckCbs.A),
    B: new DeckView('B', 'var(--accent-b)', '#00c2a8', deckCbs.B),
  };

  layout.append(deckViews.A.el, mixerView.el, deckViews.B.el);

  // Arrastrar una pista de la biblioteca directamente a un deck.
  for (const id of ['A', 'B'] as const) {
    const element = deckViews[id].el;
    element.addEventListener('dragover', (event) => {
      if (event.dataTransfer?.types.includes('application/x-audiolad-track')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    });
    element.addEventListener('drop', (event) => {
      const trackId = event.dataTransfer?.getData('application/x-audiolad-track');
      if (!trackId) return;
      event.preventDefault();
      void loadTrackToDeck(trackId, id).then((ok) => {
        if (ok) toast(`"${library.getTrack(trackId)?.title ?? 'Pista'}" cargada en Deck ${id}.`, 'ok');
      });
    });
  }

  // Arrastrar archivos o carpetas a cualquier parte de la ventana.
  window.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
  window.addEventListener('drop', (event) => {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    void importFiles(files);
  });

  // ---------- Vistas de la shell ----------
  async function playMix(trackIds: string[], name: string): Promise<void> {
    radioSeedId = null;
    const playable = trackIds.filter((id) => library.getTrack(id)?.hasAudio);
    if (playable.length === 0) {
      toast('Esa mezcla no tiene pistas reproducibles.', 'info');
      return;
    }
    await library.clearQueue();
    await library.enqueueMany(playable);
    await playTrack(playable[0]!);
    toast(`Reproduciendo «${name}» (${playable.length} pistas).`, 'ok');
    refreshAll();
  }

  async function replenishRadio(): Promise<void> {
    if (!radioSeedId || library.queue.length >= 5) return;
    const seed = library.getTrack(radioSeedId);
    if (!seed) {
      radioSeedId = null;
      return;
    }
    const exclude = new Set<string>([...library.queue, ...consumedQueue, state.loadedTrackId.A, state.loadedTrackId.B].filter((id): id is string => !!id));
    const next = radioFrom(seed, library.tracks, 60)
      .filter((track) => !exclude.has(track.id))
      .slice(0, 12);
    if (next.length === 0) return;
    await library.enqueueMany(next.map((track) => track.id));
    refreshAll();
  }

  window.setInterval(() => void replenishRadio(), 12_000);

  async function startRadio(seedId: string): Promise<void> {
    const seed = library.getTrack(seedId);
    if (!seed) {
      toast('Elige una pista válida para la radio.', 'info');
      return;
    }
    const queue = radioFrom(seed, library.tracks, 30);
    if (queue.length <= 1) {
      toast('Necesitas más pistas con audio para encadenar una radio.', 'info');
      return;
    }
    await playMix(queue.map((track) => track.id), `Radio · ${seed.title}`);
    radioSeedId = seed.id;
  }

  const discoveryView = new DiscoveryView({
    onPlay: (trackId) => void playTrack(trackId),
    onEnqueue: (trackId) =>
      void library.enqueue(trackId).then((added) => {
        if (!added) toast('Esa pista ya está en la cola.', 'info');
        refreshAll();
      }),
    onLoadToDeck: (trackId, deckId) => void loadTrackToDeck(trackId, deckId),
    onPlayMix: (trackIds, name) => void playMix(trackIds, name),
    onStartRadio: (seedId) => void startRadio(seedId),
    onRecommendation: (event) => {
      recommendationHistory = recordRecommendation(recommendationHistory, event);
      toast(event.action === 'accepted' ? 'Recomendación aceptada.' : 'Recomendación descartada.', event.action === 'accepted' ? 'ok' : 'info');
    },
  });

  const homeView = new HomeView({
    onPlayTrack: (trackId) => void playTrack(trackId),
    onPreview: (trackId) => void togglePreview(trackId),
    onEnqueue: (trackId) =>
      void library.enqueue(trackId).then((added) => {
        if (!added) toast('Esa pista ya está en la cola.', 'info');
        refreshAll();
      }),
    onToggleFavorite: (trackId) => void library.toggleFavorite(trackId).then(() => refreshAll()),
    onOpenPlaylist: (playlistId) => router.navigate({ name: 'playlist', id: playlistId }),
    onNavigate: (route) => router.navigate(route),
    onImport: () => {
      router.navigate({ name: 'library' });
      window.setTimeout(() => libraryView.pickFiles(), 0);
    },
  });

  const searchView = new SearchView({
    onPlayTrack: (trackId) => void playTrack(trackId),
    onPreview: (trackId) => void togglePreview(trackId),
    onLoadToDeck: (trackId, deckId) => void loadTrackToDeck(trackId, deckId),
    onEnqueue: (trackId) =>
      void library.enqueue(trackId).then((added) => {
        if (!added) toast('Esa pista ya está en la cola.', 'info');
        refreshAll();
      }),
    onToggleFavorite: (trackId) => void library.toggleFavorite(trackId).then(() => refreshAll()),
    onOpenPlaylist: (playlistId) => router.navigate({ name: 'playlist', id: playlistId }),
    onNavigate: (route) => router.navigate(route),
    onImport: () => {
      router.navigate({ name: 'library' });
      window.setTimeout(() => libraryView.pickFiles(), 0);
    },
  });

  const collectionView = new CollectionView({
    onPlayTrack: (trackId) => void playTrack(trackId),
    onPreview: (trackId) => void togglePreview(trackId),
    onLoadToDeck: (trackId, deckId) => void loadTrackToDeck(trackId, deckId),
    onEnqueue: (trackId) =>
      void library.enqueue(trackId).then((added) => {
        if (!added) toast('Esa pista ya está en la cola.', 'info');
        refreshAll();
      }),
    onToggleFavorite: (trackId) => void library.toggleFavorite(trackId).then(() => refreshAll()),
    onShare: (route) => void copyLink(route),
    onNavigate: (route) => router.navigate(route),
  });

  shell.el.queueBody.appendChild(queueView.el);
  shell.el.pages.home.appendChild(homeView.el);
  shell.el.pages.discover.appendChild(discoveryView.el);
  shell.el.pages.search.appendChild(searchView.el);
  shell.el.pages.library.appendChild(libraryView.el);
  shell.el.pages.collection.appendChild(collectionView.el);
  shell.el.pages.cabina.appendChild(layout);

  // ---------- Herramientas (páginas reales, sin dock) ----------
  const toolViews: Record<ToolId, { title: string; el: HTMLElement }> = {
    sampler: { title: 'Sampler', el: samplerView.el },
    recorder: { title: 'Grabadora', el: recorderView.el },
    history: { title: 'Historial', el: historyView.el },
    sources: { title: 'Fuentes (URL)', el: converterView.el },
    imports: { title: 'Lotes de importación', el: importQueue.el },
    settings: { title: 'Configuración', el: settingsView.el },
    help: { title: 'Ayuda', el: helpView.el },
  };
  for (const entry of Object.values(toolViews)) {
    entry.el.hidden = true;
    shell.toolSlot.appendChild(entry.el);
  }

  function showTool(id: ToolId): void {
    for (const [toolId, entry] of Object.entries(toolViews)) entry.el.hidden = toolId !== id;
    shell.el.toolTitle.textContent = toolViews[id].title;
    if (id === 'settings') {
      settingsView.updateAudioEngineInfo(engine.booted ? engine.ensure() : null);
      void settingsView.updateStorageEstimate();
    }
  }

  /** Compatibilidad: los flujos existentes llaman switchTab('lotes'), etc. */
  function switchTab(id: string): void {
    const map: Record<string, Route> = {
      library: { name: 'library' },
      queue: { name: 'queue' },
      sampler: { name: 'tool', id: 'sampler' },
      recorder: { name: 'tool', id: 'recorder' },
      history: { name: 'tool', id: 'history' },
      converter: { name: 'tool', id: 'sources' },
      lotes: { name: 'tool', id: 'imports' },
      settings: { name: 'tool', id: 'settings' },
      help: { name: 'tool', id: 'help' },
    };
    const route = map[id];
    if (route) router.navigate(route);
  }

  function renderRoute(route: Route): void {
    switch (route.name) {
      case 'home':
        shell.showPage('home');
        break;
      case 'discover':
        shell.showPage('discover');
        break;
      case 'search':
        shell.showPage('search');
        window.setTimeout(() => searchView.focus(), 0);
        break;
      case 'library':
        shell.showPage('library');
        break;
      case 'playlist':
        shell.showPage('library');
        libraryView.openPlaylist(route.id);
        break;
      case 'album':
        shell.showPage('collection');
        collectionView.render('album', route.album, library.tracks);
        break;
      case 'artist':
        shell.showPage('collection');
        collectionView.render('artist', route.artist, library.tracks);
        break;
      case 'cabina':
        shell.showPage('cabina');
        break;
      case 'queue':
        if (!Object.values(shell.el.pages).some((page) => !page.hidden)) shell.showPage('home');
        shell.openQueue();
        break;
      case 'tool':
        shell.showPage('tool');
        showTool(route.id);
        break;
      case 'notfound':
        shell.showPage('home');
        break;
    }
    shell.setActive(route);
    shell.renderPlaylists(library.playlists, route.name === 'playlist' ? route.id : null);
    if (route.name !== 'queue') shell.closeQueue();
    shell.closeMobile();
    document.body.dataset.route = route.name;
    const labels: Record<Route['name'], string> = {
      home: 'Inicio',
      discover: 'Descubrir',
      search: 'Buscar',
      library: 'Tu biblioteca',
      playlist: 'Playlist',
      album: 'Álbum',
      artist: 'Artista',
      cabina: 'Cabina DJ',
      queue: 'Cola',
      tool: 'Herramientas',
      notfound: 'No encontrado',
    };
    const detail =
      route.name === 'album' ? route.album : route.name === 'artist' ? route.artist : route.name === 'tool' ? toolViews[route.id].title : '';
    document.title = route.name === 'home' ? 'AudioLad Studio' : `AudioLad Studio · ${detail || labels[route.name]}`;
  }

  shell.setHandlers({
    onNewPlaylist: () => {
      router.navigate({ name: 'library' });
      window.setTimeout(() => libraryView.focusNewPlaylist(), 0);
    },
    onImport: () => {
      router.navigate({ name: 'library' });
      window.setTimeout(() => libraryView.pickFiles(), 0);
    },
    onFavorites: () => {
      router.navigate({ name: 'library' });
      window.setTimeout(() => libraryView.showFavoritesOnly(), 0);
    },
  });

  shell.el.searchButton.addEventListener('click', () => {
    window.setTimeout(() => searchView.focus(), 0);
  });

  const closeQueue = (): void => {
    const wasQueue = router.current().name === 'queue';
    shell.closeQueue();
    if (wasQueue) router.navigate({ name: 'home' });
  };
  shell.el.queueClose.addEventListener('click', closeQueue);
  shell.el.queueBackdrop.addEventListener('click', closeQueue);

  libraryView.setBackend(store.kind);
  shell.setBackend(store.kind);


  // Restaurar faders persistidos en la UI (el motor aplica lo mismo al primer gesto).
  const restored = loadMixerState();
  masterVolume = restored.master;
  nowPlaying.setVolume(masterVolume);
  for (const id of ['A', 'B'] as const) {
    const s = restored.decks[id];
    deckViews[id].setPitchDisplay(s.pitch);
  }
  mixerView.setFaders(restored);

  // ---------- Refresco global ----------
  function refreshAll(): void {
    libraryView.render(library.tracks, library.playlists, library.smartPlaylists);
    libraryView.setLoadedDecks({ A: state.loadedTrackId.A, B: state.loadedTrackId.B });
    libraryView.setQueue(library.queue);
    queueView.render(library.tracks, library.queue, { A: state.loadedTrackId.A, B: state.loadedTrackId.B });
    historyView.render(library.historyEvents, library.tracks, library.recordings);
    recorderView.renderRecordings(library.recordings);
    homeView.render(library.tracks, library.playlists, library.historyEvents);
    discoveryView.render({
      tracks: library.tracks,
      events: library.historyEvents,
      loaded: { A: state.loadedMeta.A ?? undefined, B: state.loadedMeta.B ?? undefined },
      history: recommendationHistory,
    });
    searchView.render(library.tracks, library.playlists);
    const route = router.current();
    if (route.name === 'album') collectionView.render('album', route.album, library.tracks);
    if (route.name === 'artist') collectionView.render('artist', route.artist, library.tracks);
    shell.renderPlaylists(library.playlists, route.name === 'playlist' ? route.id : null);
  }
  refreshAll();

  // ---------- Command palette ----------
  const palette = new CommandPalette([]);

  function openShortcuts(): void {
    shortcuts.openEditor(toast);
  }

  const shortcutActions: ShortcutAction[] = [
    { id: 'palette', label: 'Abrir paleta de comandos', group: 'General', defaultKey: 'mod+k', action: () => (palette.isOpen ? palette.close() : palette.open()) },
    { id: 'search', label: 'Buscar', group: 'Navegación', defaultKey: '/', action: () => router.navigate({ name: 'search' }) },
    { id: 'home', label: 'Ir a Inicio', group: 'Navegación', defaultKey: 'mod+shift+h', action: () => router.navigate({ name: 'home' }) },
    { id: 'library', label: 'Ir a Tu biblioteca', group: 'Navegación', defaultKey: 'mod+shift+l', action: () => router.navigate({ name: 'library' }) },
    { id: 'cabina', label: 'Ir a la cabina DJ', group: 'Navegación', defaultKey: 'mod+shift+d', action: () => router.navigate({ name: 'cabina' }) },
    { id: 'queue', label: 'Abrir la cola', group: 'Navegación', defaultKey: 'mod+shift+q', action: () => router.navigate({ name: 'queue' }) },
    { id: 'settings', label: 'Abrir configuración', group: 'Navegación', defaultKey: 'mod+,', action: () => router.navigate({ name: 'tool', id: 'settings' }) },
    { id: 'import', label: 'Importar audio', group: 'Biblioteca', defaultKey: 'mod+i', action: () => { router.navigate({ name: 'library' }); window.setTimeout(() => libraryView.pickFiles(), 0); } },
    { id: 'newPlaylist', label: 'Nueva playlist', group: 'Biblioteca', defaultKey: 'mod+shift+n', action: () => { router.navigate({ name: 'library' }); window.setTimeout(() => libraryView.focusNewPlaylist(), 0); } },
    { id: 'theme', label: 'Cambiar tema claro/oscuro', group: 'Apariencia', defaultKey: 'mod+shift+t', action: () => shell.el.themeButton.click() },
    { id: 'help', label: 'Ver y configurar atajos', group: 'Ayuda', defaultKey: 'mod+shift+/', action: () => openShortcuts() },
    { id: 'volUp', label: 'Subir volumen master', group: 'Reproducción', defaultKey: 'mod+up', action: () => adjustVolume(0.05) },
    { id: 'volDown', label: 'Bajar volumen master', group: 'Reproducción', defaultKey: 'mod+down', action: () => adjustVolume(-0.05) },
    { id: 'mute', label: 'Silenciar / restaurar volumen', group: 'Reproducción', defaultKey: 'mod+shift+m', action: () => toggleMute() },
  ];
  const shortcuts = new ShortcutManager(shortcutActions);

  const hint = (id: string): string => formatCombo(shortcuts.bindingFor(id));
  const commands: PaletteCommand[] = [
    { id: 'nav.home', label: 'Ir a Inicio', group: 'Navegación', icon: 'home', hint: hint('home'), run: () => router.navigate({ name: 'home' }) },
    { id: 'nav.search', label: 'Buscar', group: 'Navegación', icon: 'search', hint: hint('search'), run: () => router.navigate({ name: 'search' }) },
    { id: 'nav.library', label: 'Ir a Tu biblioteca', group: 'Navegación', icon: 'library', hint: hint('library'), run: () => router.navigate({ name: 'library' }) },
    { id: 'nav.cabina', label: 'Ir a la cabina DJ', group: 'Navegación', icon: 'deck', hint: hint('cabina'), run: () => router.navigate({ name: 'cabina' }) },
    { id: 'nav.queue', label: 'Abrir la cola', group: 'Navegación', icon: 'queue', hint: hint('queue'), run: () => router.navigate({ name: 'queue' }) },
    { id: 'nav.sampler', label: 'Abrir Sampler', group: 'Herramientas', icon: 'sampler', run: () => router.navigate({ name: 'tool', id: 'sampler' }) },
    { id: 'nav.recorder', label: 'Abrir Grabadora', group: 'Herramientas', icon: 'recorder', run: () => router.navigate({ name: 'tool', id: 'recorder' }) },
    { id: 'nav.history', label: 'Abrir Historial', group: 'Herramientas', icon: 'history', run: () => router.navigate({ name: 'tool', id: 'history' }) },
    { id: 'nav.sources', label: 'Abrir Fuentes (URL)', group: 'Herramientas', icon: 'link', run: () => router.navigate({ name: 'tool', id: 'sources' }) },
    { id: 'nav.imports', label: 'Abrir Lotes de importación', group: 'Herramientas', icon: 'import', run: () => router.navigate({ name: 'tool', id: 'imports' }) },
    { id: 'nav.settings', label: 'Abrir Configuración', group: 'Herramientas', icon: 'settings', hint: hint('settings'), run: () => router.navigate({ name: 'tool', id: 'settings' }) },
    { id: 'nav.help', label: 'Abrir Ayuda', group: 'Herramientas', icon: 'help', run: () => router.navigate({ name: 'tool', id: 'help' }) },
    { id: 'play.a', label: 'Reproducir / pausar Deck A', group: 'Reproducción', icon: 'play', keywords: 'play pausa a', run: () => deckCbs.A.onPlayPause() },
    { id: 'play.b', label: 'Reproducir / pausar Deck B', group: 'Reproducción', icon: 'play', keywords: 'play pausa b', run: () => deckCbs.B.onPlayPause() },
    { id: 'stop.all', label: 'Detener ambos decks', group: 'Reproducción', icon: 'stop', run: () => { deckCbs.A.onStop(); deckCbs.B.onStop(); } },
    { id: 'queue.next', label: 'Reproducir siguiente de la cola', group: 'Reproducción', icon: 'queue', run: () => void loadNextInto(idleDeckId(), true) },
    { id: 'lib.import', label: 'Importar audio…', group: 'Biblioteca', icon: 'import', hint: hint('import'), run: () => { router.navigate({ name: 'library' }); window.setTimeout(() => libraryView.pickFiles(), 0); } },
    { id: 'lib.playlist', label: 'Nueva playlist…', group: 'Biblioteca', icon: 'plus', hint: hint('newPlaylist'), run: () => { router.navigate({ name: 'library' }); window.setTimeout(() => libraryView.focusNewPlaylist(), 0); } },
    { id: 'lib.spotify', label: 'Importar metadatos de Spotify', group: 'Biblioteca', icon: 'external', run: () => { router.navigate({ name: 'library' }); window.setTimeout(() => (libraryView.el.querySelector('.spotify-url') as HTMLInputElement | null)?.focus(), 0); } },
    { id: 'view.share', label: 'Copiar enlace de esta vista', group: 'Vista', icon: 'link', run: () => void copyLink() },
    { id: 'view.theme', label: 'Cambiar tema claro/oscuro', group: 'Vista', icon: 'sun', hint: hint('theme'), run: () => shell.el.themeButton.click() },
    { id: 'view.shortcuts', label: 'Ver y configurar atajos', group: 'Vista', icon: 'command', hint: hint('help'), run: () => openShortcuts() },
  ];
  palette.setCommands(commands);

  // ---------- Media Session + restauración de sesión ----------
  function persistSession(): void {
    if (!engine.booted) return;
    const deckSession = (id: DeckId) => {
      const trackId = state.loadedTrackId[id];
      if (!trackId) return null;
      const deck = engine.deck(id);
      return {
        trackId,
        position: deck.position,
        bpm: state.baseBpm[id],
        bpmSource: state.bpmSource[id],
      };
    };
    saveSession({ decks: { A: deckSession('A'), B: deckSession('B') }, savedAt: new Date().toISOString() });
  }

  async function restoreSession(): Promise<void> {
    const snapshot = loadSession();
    if (!snapshot) return;
    let restored = false;
    for (const id of ['A', 'B'] as const) {
      const saved = snapshot.decks[id];
      if (!saved || state.loadedTrackId[id]) continue;
      const meta = library.getTrack(saved.trackId);
      if (!meta?.hasAudio) continue;
      const ok = await loadTrackToDeck(saved.trackId, id);
      if (!ok) continue;
      if (saved.bpm !== null) {
        state.baseBpm[id] = saved.bpm;
        state.bpmSource[id] = saved.bpmSource;
        deckViews[id].refreshBpm(saved.bpm, saved.bpmSource);
      }
      engine.deck(id).seek(saved.position);
      restored = true;
    }
    if (restored) toast('Sesión anterior restaurada en pausa. Pulsa play para continuar.', 'info');
  }

  bindSessionHandlers({
    play: () => {
      const deck = engine.deck(activeDeckId());
      if (deck.hasTrack && !deck.isPlaying) deck.play();
    },
    pause: () => {
      const deck = engine.deck(activeDeckId());
      if (deck.isPlaying) deck.pause();
    },
    stop: () => engine.deck(activeDeckId()).stop(),
    next: () => void nextFromQueue(),
    previous: () => void previousTrack(),
    seek: (seconds) => {
      if (Number.isFinite(seconds)) engine.deck(activeDeckId()).seek(seconds);
    },
  });

  window.addEventListener('beforeunload', () => persistSession());
  window.setTimeout(() => void restoreSession(), 600);

  router.start(renderRoute);

  // ---------- Persistencia del mezclador (con debounce) ----------
  let mixerDirty = false;
  let lastSave = 0;
  function markMixerDirty(): void {
    mixerDirty = true;
  }

  // ---------- Bucle de render ----------
  const frame = (): void => {
    if (engine.booted) {
      for (const id of ['A', 'B'] as const) {
        const deck = engine.peekDeck(id);
        if (!deck || !deck.hasTrack) continue;
        const meta = state.loadedMeta[id];
        const beatSec = beatSeconds(state.baseBpm[id] ?? NaN, deck.rate * deck.speed);
        deckViews[id].update({
          position: deck.position,
          duration: deck.duration,
          playing: deck.isPlaying,
          loop: deck.loopRegion,
          cue: deck.cue,
          hotCues: meta?.hotCues ?? new Array<number | null>(8).fill(null),
          beatSec: beatSec ?? null,
          effectiveBpm: effectiveBpm(state.baseBpm[id], deck.rate * deck.speed),
          slip: deck.slip,
        });
        deckViews[id].renderWave();
      }
      mixerView.update({ A: engine.deckLevel('A'), B: engine.deckLevel('B') }, engine.limiterReductionDb);
      mixerView.renderSpectrum((target) => engine.masterSpectrum(target));

      if (mixerDirty && performance.now() - lastSave > 300) {
        saveMixerState(engine.captureState());
        mixerDirty = false;
        lastSave = performance.now();
      }
    }

    // Barra «Ahora suena»: deck que está sonando o el último cargado.
    const playingDeck = (['A', 'B'] as const).find((id) => engine.peekDeck(id)?.isPlaying);
    const activeDeck: DeckId = playingDeck ?? (state.loadedMeta.A ? 'A' : state.loadedMeta.B ? 'B' : 'A');
    const deck = engine.peekDeck(activeDeck);
    const meta = state.loadedMeta[activeDeck];
    nowPlaying.update({
      deck: activeDeck,
      title: meta?.title ?? 'Ningún deck cargado',
      artist: meta
        ? `${meta.artist}${meta.bpm ? ` · ${meta.bpm.toFixed(1)} BPM` : ''}`
        : 'Carga una pista para empezar',
      artwork: meta?.artwork,
      position: deck?.position ?? 0,
      duration: deck?.duration ?? 0,
      playing: deck?.isPlaying ?? false,
      volume: masterVolume,
      queueCount: library.queue.length,
      shuffle: playback.shuffle,
      repeat: playback.repeat,
      speed: playback.speed,
      sleepRemainingSec,
    });

    if (engine.booted) {
      const activeTrack = state.loadedTrackId[activeDeck];
      if (activeTrack !== lastSessionPersistTrack) {
        lastSessionPersistTrack = activeTrack;
        if (activeTrack) syncMediaTrack(activeDeck);
      }
    }
    const now = performance.now();
    if (engine.booted) {
      void maybeCrossfade();
      void maybeGapless();
      void preloadNextTrack();
      if (now - lastMediaUpdate > 1000) void wakeLock.update(engine.deckA.isPlaying || engine.deckB.isPlaying);
    }
    if (engine.booted && now - lastMediaUpdate > 1000) {
      const sessionDeck = engine.peekDeck(activeDeck);
      updateSessionState(sessionDeck?.isPlaying ?? false, sessionDeck?.position ?? 0, sessionDeck?.duration ?? 0, sessionDeck ? sessionDeck.rate * sessionDeck.speed : 1);
      lastMediaUpdate = now;
    }
    if (engine.booted && now - lastSessionPersist > 5000) {
      persistSession();
      lastSessionPersist = now;
    }

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // ---------- Teclado ----------
  // 1) Atajos globales configurables · 2) atajos fijos de la cabina.
  window.addEventListener('keydown', (e) => {
    if (palette.isOpen) return;
    if (shortcuts.handle(e)) return;
    if (isEditableTarget(e.target)) return;
    if (e.key === 'Escape' && shell.queueIsOpen) {
      closeQueue();
      return;
    }
    const activeDeck: DeckId = engine.crossfader <= 0.5 ? 'A' : 'B';
    const hotIndex = parseInt(e.key, 10);
    if (hotIndex >= 1 && hotIndex <= 8 && engine.booted) {
      deckCbs[activeDeck].onHotCue(hotIndex - 1, 'hit');
      return;
    }
    if (e.code === 'KeyQ') deckViews.A.el.querySelector<HTMLButtonElement>('.btn-play')?.click();
    else if (e.code === 'KeyP') deckViews.B.el.querySelector<HTMLButtonElement>('.btn-play')?.click();
    else if (e.code === 'Space') {
      e.preventDefault();
      deckViews[activeDeck].el.querySelector<HTMLButtonElement>('.btn-play')?.click();
    } else {
      const samplerIndex = 'asdfgh'.indexOf(e.key.toLowerCase());
      if (samplerIndex >= 0) {
        const pad = SAMPLER_PADS[samplerIndex]!.id as SamplerPad;
        ensureEngine();
        const duration = engine.sampler.play(pad);
        samplerView.triggerFromKeyboard(pad, duration);
      }
    }
  });
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

void main().catch((error) => {
  console.error(error);
  document.body.textContent = `Error al iniciar: ${error instanceof Error ? error.message : String(error)}`;
});
