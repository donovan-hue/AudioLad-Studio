/**
 * Barra inferior persistente «Ahora suena»: transporte del deck activo,
 * progreso con búsqueda, volumen master, cola y acceso a la cabina.
 */

import type { DeckId } from '../audio/deck.js';
import type { RepeatMode } from '../audio/playbackSettings.js';
import { icon } from './icons.js';
import { artwork, h, iconButton, setText, setWidth } from './components.js';

export interface NowPlayingState {
  deck: DeckId;
  title: string;
  artist: string;
  artwork?: string;
  position: number;
  duration: number;
  playing: boolean;
  volume: number;
  queueCount: number;
  shuffle: boolean;
  repeat: RepeatMode;
  speed: number;
  sleepRemainingSec: number | null;
}

export interface NowPlayingCallbacks {
  onPlayPause(deck: DeckId): void;
  onStop(deck: DeckId): void;
  onSeek(deck: DeckId, seconds: number): void;
  onVolume(position: number): void;
  onOpenQueue(): void;
  onOpenCabina(): void;
  onOpenCurrent(): void;
  onToggleShuffle(): void;
  onCycleRepeat(): void;
  onNext(): void;
  onPrevious(): void;
  onSpeed(speed: number): void;
  onOpenEq(): void;
  onSleepTimer(): void;
}

export class NowPlayingBar {
  readonly el: HTMLElement;
  private readonly artworkSlot: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly artistEl: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly stopBtn: HTMLButtonElement;
  private readonly barFill: HTMLElement;
  private readonly barTrack: HTMLElement;
  private readonly elapsedEl: HTMLElement;
  private readonly durationEl: HTMLElement;
  private readonly volumeInput: HTMLInputElement;
  private readonly queueBtn: HTMLButtonElement;
  private readonly queueCount: HTMLElement;
  private readonly deckBadge: HTMLElement;
  private readonly shuffleBtn: HTMLButtonElement;
  private readonly repeatBtn: HTMLButtonElement;
  private readonly repeatBadge: HTMLElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly speedSelect: HTMLSelectElement;
  private readonly timerBtn: HTMLButtonElement;
  private readonly timerLabel: HTMLElement;
  private readonly trackWrap: HTMLElement;
  private state: NowPlayingState | null = null;
  private artworkKey = '';

  constructor(private readonly cb: NowPlayingCallbacks) {
    this.el = h('div', { className: 'np-inner' });

    const track = h('div', { className: 'np-track' });
    this.artworkSlot = h('div', { className: 'np-art' });
    const meta = h('div', {
      className: 'np-meta',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    this.titleEl = h('b', { className: 'np-title', text: 'Ningún deck cargado' });
    this.artistEl = h('small', { className: 'np-artist', text: 'Carga una pista para empezar' });
    meta.append(this.titleEl, this.artistEl);
    this.trackWrap = h('button', { className: 'np-track-btn', attrs: { type: 'button', 'aria-label': 'Abrir cabina DJ' } });
    this.deckBadge = h('span', { className: 'np-deck-badge', text: 'A' });
    this.trackWrap.append(this.artworkSlot, meta, this.deckBadge);
    this.trackWrap.addEventListener('click', () => this.cb.onOpenCurrent());
    track.appendChild(this.trackWrap);

    const center = h('div', { className: 'np-center' });
    const controls = h('div', { className: 'np-controls' });
    this.shuffleBtn = iconButton('shuffle', 'Activar aleatorio', 'btn btn-mini icon-btn np-mode', 17);
    this.repeatBtn = iconButton('repeat', 'Repetir', 'btn btn-mini icon-btn np-mode', 17);
    this.repeatBadge = h('span', { className: 'np-mode-badge', text: '' });
    this.repeatBtn.appendChild(this.repeatBadge);
    this.prevBtn = iconButton('skipBack', 'Anterior', 'btn btn-mini icon-btn', 18);
    this.playBtn = iconButton('play', 'Reproducir / pausar', 'btn btn-mini icon-btn np-play', 20);
    this.stopBtn = iconButton('stop', 'Detener', 'btn btn-mini icon-btn', 18);
    this.nextBtn = iconButton('skipForward', 'Siguiente', 'btn btn-mini icon-btn', 18);
    const cabinaBtn = iconButton('deck', 'Abrir cabina DJ', 'btn btn-mini icon-btn', 18);
    cabinaBtn.addEventListener('click', () => this.cb.onOpenCabina());
    this.shuffleBtn.addEventListener('click', () => this.cb.onToggleShuffle());
    this.repeatBtn.addEventListener('click', () => this.cb.onCycleRepeat());
    this.prevBtn.addEventListener('click', () => this.cb.onPrevious());
    this.nextBtn.addEventListener('click', () => this.cb.onNext());
    this.playBtn.addEventListener('click', () => {
      if (this.state) this.cb.onPlayPause(this.state.deck);
    });
    this.stopBtn.addEventListener('click', () => {
      if (this.state) this.cb.onStop(this.state.deck);
    });
    controls.append(this.shuffleBtn, this.prevBtn, this.playBtn, this.nextBtn, this.repeatBtn, cabinaBtn, this.stopBtn);

    const progress = h('div', { className: 'np-progress' });
    this.elapsedEl = h('span', { className: 'np-time', text: '0:00' });
    this.barTrack = h('div', { className: 'np-bar', attrs: { role: 'slider', tabindex: 0, 'aria-label': 'Posición de reproducción', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 } });
    this.barFill = h('span', { className: 'np-bar-fill' });
    this.barTrack.appendChild(this.barFill);
    this.durationEl = h('span', { className: 'np-time', text: '0:00' });
    progress.append(this.elapsedEl, this.barTrack, this.durationEl);
    const seek = (clientX: number): void => {
      if (!this.state || this.state.duration <= 0) return;
      const rect = this.barTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.cb.onSeek(this.state.deck, ratio * this.state.duration);
    };
    this.barTrack.addEventListener('click', (event) => seek(event.clientX));
    this.barTrack.addEventListener('keydown', (event) => {
      if (!this.state) return;
      if (event.key === 'ArrowRight') this.cb.onSeek(this.state.deck, Math.min(this.state.duration, this.state.position + 5));
      if (event.key === 'ArrowLeft') this.cb.onSeek(this.state.deck, Math.max(0, this.state.position - 5));
    });
    center.append(controls, progress);

    const right = h('div', { className: 'np-right' });
    this.queueBtn = this.cbQueueButton();
    const volume = h('div', { className: 'np-volume' });
    volume.innerHTML = icon('volume', 18);
    this.volumeInput = h('input', {
      className: 'np-volume-input',
      attrs: { type: 'range', min: 0, max: 100, value: 80, 'aria-label': 'Volumen master' },
    });
    this.volumeInput.addEventListener('input', () => {
      this.cb.onVolume(Number(this.volumeInput.value) / 100);
    });
    volume.appendChild(this.volumeInput);
    this.queueCount = h('span', { className: 'np-queue-count', text: '0' });
    this.queueBtn.appendChild(this.queueCount);

    const eqBtn = iconButton('eq', 'Ecualizador master', 'btn btn-mini icon-btn np-extra', 18);
    eqBtn.addEventListener('click', () => this.cb.onOpenEq());
    this.timerBtn = iconButton('timer', 'Temporizador de apagado', 'btn btn-mini icon-btn np-extra np-timer', 18);
    this.timerLabel = h('span', { className: 'np-timer-label', text: '' });
    this.timerBtn.appendChild(this.timerLabel);
    this.timerBtn.addEventListener('click', () => this.cb.onSleepTimer());

    this.speedSelect = h('select', {
      className: 'np-speed',
      attrs: { 'aria-label': 'Velocidad de reproducción' },
    });
    for (const rate of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
      const option = h('option', { text: `${rate}×`, attrs: { value: String(rate) } });
      this.speedSelect.appendChild(option);
    }
    this.speedSelect.value = '1';
    this.speedSelect.addEventListener('change', () => this.cb.onSpeed(Number(this.speedSelect.value)));

    right.append(eqBtn, this.timerBtn, this.queueBtn, this.speedSelect, volume);

    this.el.append(track, center, right);
  }

  private cbQueueButton(): HTMLButtonElement {
    const button = h('button', { className: 'btn btn-mini icon-btn np-queue-btn', attrs: { type: 'button', 'aria-label': 'Abrir cola' } });
    button.innerHTML = icon('queue', 19);
    button.addEventListener('click', () => this.cb.onOpenQueue());
    return button;
  }

  setVolume(position: number): void {
    this.volumeInput.value = String(Math.round(Math.max(0, Math.min(1, position)) * 100));
  }

  update(state: NowPlayingState): void {
    const previous = this.state;
    this.state = state;
    setText(this.titleEl, state.title);
    setText(this.artistEl, state.artist);
    setText(this.deckBadge, state.deck);
    setText(this.elapsedEl, format(state.position));
    setText(this.durationEl, format(state.duration));
    setText(this.queueCount, String(state.queueCount));
    setWidth(this.barFill, state.duration > 0 ? (state.position / state.duration) * 100 : 0);
    this.shuffleBtn.classList.toggle('active', state.shuffle);
    this.shuffleBtn.setAttribute('aria-pressed', String(state.shuffle));
    this.shuffleBtn.title = state.shuffle ? 'Aleatorio activado' : 'Activar aleatorio';
    const repeatActive = state.repeat !== 'off';
    this.repeatBtn.classList.toggle('active', repeatActive);
    this.repeatBtn.setAttribute('aria-pressed', String(repeatActive));
    this.repeatBtn.title = state.repeat === 'one' ? 'Repetir una pista' : state.repeat === 'all' ? 'Repetir todo' : 'Sin repetición';
    setText(this.repeatBadge, state.repeat === 'one' ? '1' : '');
    if (this.speedSelect.value !== String(state.speed)) this.speedSelect.value = String(state.speed);
    if (state.sleepRemainingSec === null || state.sleepRemainingSec <= 0) {
      setText(this.timerLabel, '');
      this.timerBtn.classList.remove('active');
      this.timerBtn.title = 'Temporizador de apagado';
    } else {
      const minutes = Math.ceil(state.sleepRemainingSec / 60);
      setText(this.timerLabel, `${minutes}m`);
      this.timerBtn.classList.add('active');
      this.timerBtn.title = `Se apaga en ${minutes} min`;
    }
    this.barTrack.setAttribute('aria-valuenow', String(Math.round(state.duration > 0 ? (state.position / state.duration) * 100 : 0)));
    this.queueBtn.title = `${state.queueCount} pistas en cola`;
    if (!previous || previous.playing !== state.playing) {
      this.playBtn.innerHTML = icon(state.playing ? 'pause' : 'play', 20);
      this.playBtn.setAttribute('aria-label', state.playing ? 'Pausar' : 'Reproducir');
    }
    if (!previous || previous.deck !== state.deck) {
      this.el.dataset.deck = state.deck;
    }
    const artworkKey = `${state.deck}:${state.artwork ?? ''}:${state.title}`;
    if (artworkKey !== this.artworkKey) {
      this.artworkKey = artworkKey;
      this.artworkSlot.textContent = '';
      this.artworkSlot.appendChild(artwork(state.artwork, state.title, 'np-artwork'));
    }
  }
}

function format(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
