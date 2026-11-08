import { icon } from './icons.js';

export interface SettingsCallbacks {
  onResetMixer(): void;
  onExportLibrary(): void;
  onConfigureShortcuts(): void;
  onCrossfade(seconds: number): void;
  onNormalize(enabled: boolean): void;
  onKeylock(enabled: boolean): void;
  onInstall(): void;
}

export class SettingsView {
  readonly el: HTMLElement;
  private readonly storageKindEl: HTMLElement;
  private readonly storageUsageEl: HTMLElement;
  private readonly audioStateEl: HTMLElement;
  private readonly audioRateEl: HTMLElement;
  private readonly crossfadeInput: HTMLInputElement;
  private readonly crossfadeVal: HTMLElement;
  private readonly normalizeInput: HTMLInputElement;
  private readonly keylockInput: HTMLInputElement;
  private readonly installButton: HTMLButtonElement;

  constructor(cb: SettingsCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'settings-view panel-view';
    this.el.innerHTML = `
      <div class="panel-head">
        <span class="panel-hint">Diagnóstico del sistema, almacenamiento, motor de audio y preferencias.</span>
      </div>
      <div class="settings-grid">
        <section class="settings-card">
          <h3>Almacenamiento local</h3>
          <p class="settings-desc">AudioLad Studio almacena los audios y metadatos en tu dispositivo para garantizar privacidad y trabajo sin conexión.</p>
          <div class="settings-metric">
            <span class="metric-label">Mecanismo activo:</span>
            <span class="metric-val storage-kind">—</span>
          </div>
          <div class="settings-metric">
            <span class="metric-label">Espacio estimado:</span>
            <span class="metric-val storage-usage">Calculando…</span>
          </div>
          <div class="settings-actions">
            <button class="btn btn-mini btn-export-lib" aria-label="Exportar biblioteca">${icon('download', 15)}<span>Exportar metadatos (JSON)</span></button>
          </div>
        </section>

        <section class="settings-card">
          <h3>Motor de audio Web Audio</h3>
          <p class="settings-desc">Cadena de procesamiento interna con AudioContext de 32 bits en coma flotante.</p>
          <div class="settings-metric">
            <span class="metric-label">Estado del contexto:</span>
            <span class="metric-val audio-state">En espera de interacción</span>
          </div>
          <div class="settings-metric">
            <span class="metric-label">Frecuencia de muestreo:</span>
            <span class="metric-val audio-rate">—</span>
          </div>
          <div class="settings-actions">
            <button class="btn btn-mini btn-reset-mixer" aria-label="Restablecer mezclador">${icon('refresh', 15)}<span>Restablecer faders y EQ</span></button>
            <button class="btn btn-mini btn-install-app" aria-label="Instalar AudioLad Studio como aplicación" disabled>${icon('download', 15)}<span>Instalar app</span></button>
          </div>
        </section>

        <section class="settings-card playback-card">
          <h3>Reproducción</h3>
          <p class="settings-desc">Transiciones automáticas, sonoridad y continuidad entre pistas.</p>
          <label class="settings-range">
            <span>Crossfade automático <strong class="crossfade-val">0 s</strong></span>
            <input class="settings-crossfade" type="range" min="0" max="12" step="0.5" value="0" aria-label="Duración del crossfade en segundos">
          </label>
          <p class="settings-desc">0 s = corte directo. El crossfade usa los dos decks y precarga la siguiente pista de la cola.</p>
          <label class="settings-check">
            <input class="settings-normalize" type="checkbox" checked>
            <span>Normalizar volumen a −14 LUFS (máx. ±12 dB)</span>
          </label>
          <label class="settings-check">
            <input class="settings-keylock" type="checkbox">
            <span>Keylock (pitch constante al cambiar tempo, AudioWorklet)</span>
          </label>
        </section>

        <section class="settings-card shortcuts-card">
          <h3>Atajos de teclado</h3>
          <div class="shortcuts-table-wrap">
            <table class="shortcuts-table" aria-label="Atajos de teclado de AudioLad Studio">
              <thead>
                <tr><th>Tecla</th><th>Acción en cabina</th></tr>
              </thead>
              <tbody>
                <tr><td><kbd>Ctrl/⌘</kbd> + <kbd>K</kbd></td><td>Abrir la paleta de comandos</td></tr>
                <tr><td><kbd>/</kbd></td><td>Ir a Buscar</td></tr>
                <tr><td><kbd>Ctrl/⌘</kbd> + <kbd>⇧</kbd> + <kbd>Q</kbd></td><td>Abrir la cola</td></tr>
                <tr><td><kbd>Q</kbd></td><td>Play / Pausa Deck A</td></tr>
                <tr><td><kbd>P</kbd></td><td>Play / Pausa Deck B</td></tr>
                <tr><td><kbd>Espacio</kbd></td><td>Play / Pausa Deck activo (según Crossfader)</td></tr>
                <tr><td><kbd>1</kbd> – <kbd>8</kbd></td><td>Disparar / Fijar Hot Cue 1–8 en Deck activo</td></tr>
                <tr><td><kbd>Alt</kbd> + Clic</td><td>Borrar Hot Cue seleccionado</td></tr>
                <tr><td><kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>G</kbd> <kbd>H</kbd></td><td>Disparar pads del Sampler en vivo</td></tr>
              </tbody>
            </table>
          </div>
          <div class="settings-actions">
            <button class="btn btn-mini btn-configure-shortcuts" aria-label="Configurar atajos globales">${icon('command', 15)}<span>Configurar atajos globales</span></button>
          </div>
        </section>
      </div>
    `;

    this.storageKindEl = this.el.querySelector('.storage-kind') as HTMLElement;
    this.storageUsageEl = this.el.querySelector('.storage-usage') as HTMLElement;
    this.audioStateEl = this.el.querySelector('.audio-state') as HTMLElement;
    this.audioRateEl = this.el.querySelector('.audio-rate') as HTMLElement;
    this.crossfadeInput = this.el.querySelector('.settings-crossfade') as HTMLInputElement;
    this.crossfadeVal = this.el.querySelector('.crossfade-val') as HTMLElement;
    this.normalizeInput = this.el.querySelector('.settings-normalize') as HTMLInputElement;
    this.keylockInput = this.el.querySelector('.settings-keylock') as HTMLInputElement;
    this.installButton = this.el.querySelector('.btn-install-app') as HTMLButtonElement;

    this.el.querySelector('.btn-reset-mixer')?.addEventListener('click', () => {
      cb.onResetMixer();
    });
    this.el.querySelector('.btn-export-lib')?.addEventListener('click', () => {
      cb.onExportLibrary();
    });
    this.el.querySelector('.btn-configure-shortcuts')?.addEventListener('click', () => {
      cb.onConfigureShortcuts();
    });
    this.crossfadeInput.addEventListener('input', () => {
      const seconds = Number(this.crossfadeInput.value);
      this.crossfadeVal.textContent = `${seconds} s`;
      cb.onCrossfade(seconds);
    });
    this.normalizeInput.addEventListener('change', () => {
      cb.onNormalize(this.normalizeInput.checked);
    });
    this.keylockInput.addEventListener('change', () => {
      cb.onKeylock(this.keylockInput.checked);
    });
    this.installButton.addEventListener('click', () => cb.onInstall());

    this.updateStorageEstimate();
  }

  setInstallAvailable(available: boolean): void {
    this.installButton.disabled = !available;
    this.installButton.title = available
      ? 'Instalar AudioLad Studio como aplicación de escritorio'
      : 'La instalación la ofrece el navegador cuando la app cumple los requisitos';
  }

  setPlaybackSettings(settings: { crossfadeSec: number; normalize: boolean; keylock: boolean }): void {
    this.crossfadeInput.value = String(settings.crossfadeSec);
    this.crossfadeVal.textContent = `${settings.crossfadeSec} s`;
    this.normalizeInput.checked = settings.normalize;
    this.keylockInput.checked = settings.keylock;
  }

  setStorageKind(kind: 'opfs' | 'indexeddb' | 'memory'): void {
    const labels: Record<'opfs' | 'indexeddb' | 'memory', string> = {
      opfs: 'OPFS (Origin Private File System — Máximo rendimiento)',
      indexeddb: 'IndexedDB (Persistencia nativa del navegador)',
      memory: 'Memoria RAM (Volátil: OPFS/IDB no disponibles)',
    };
    this.storageKindEl.textContent = labels[kind] ?? kind;
  }

  updateAudioEngineInfo(ctx: AudioContext | null): void {
    if (!ctx) {
      this.audioStateEl.textContent = 'En espera de primer gesto';
      this.audioRateEl.textContent = '—';
      return;
    }
    const stateMap: Record<string, string> = {
      running: 'Activo (Running)',
      suspended: 'Suspendido (ahorro de energía)',
      closed: 'Cerrado',
      interrupted: 'Interrumpido (sistema)',
    };
    this.audioStateEl.textContent = stateMap[ctx.state] ?? String(ctx.state);
    this.audioRateEl.textContent = `${ctx.sampleRate.toLocaleString()} Hz`;
  }

  async updateStorageEstimate(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usedMb = est.usage ? (est.usage / (1024 * 1024)).toFixed(1) : '0';
        const quotaMb = est.quota ? (est.quota / (1024 * 1024)).toFixed(0) : '—';
        this.storageUsageEl.textContent = `${usedMb} MB en uso (cuota disponible: ~${quotaMb} MB)`;
      } catch {
        this.storageUsageEl.textContent = 'Información no provista por el navegador';
      }
    } else {
      this.storageUsageEl.textContent = 'No soportado en este navegador';
    }
  }
}
