/**
 * PWA: registro del Service Worker, instalación, estado online/offline
 * y Wake Lock para que la pantalla no se apague durante la mezcla.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export class PwaController {
  private installEvent: InstallPromptEvent | null = null;
  private badge: HTMLElement | null = null;
  private updateReady = false;

  constructor(
    private readonly toast: (message: string, kind?: 'info' | 'error' | 'ok') => void,
    private readonly onInstallAvailability?: (available: boolean) => void,
  ) {}

  init(): void {
    this.mountConnectivityBadge();
    window.addEventListener('online', () => this.setOnline(true));
    window.addEventListener('offline', () => this.setOnline(false));
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installEvent = event as InstallPromptEvent;
      this.onInstallAvailability?.(true);
    });
    window.addEventListener('appinstalled', () => {
      this.installEvent = null;
      this.onInstallAvailability?.(false);
      this.toast('AudioLad Studio instalado como aplicación.', 'ok');
    });
    this.registerServiceWorker();
  }

  get installable(): boolean {
    return this.installEvent !== null;
  }

  async promptInstall(): Promise<boolean> {
    if (!this.installEvent) {
      this.toast('La instalación no está disponible todavía. Usa el menú del navegador → “Instalar aplicación”.', 'info');
      return false;
    }
    const event = this.installEvent;
    this.installEvent = null;
    this.onInstallAvailability?.(false);
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') {
      this.toast('Instalando AudioLad Studio…', 'ok');
      return true;
    }
    this.toast('Instalación cancelada.', 'info');
    return false;
  }

  private registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) return;
    const url = new URL('sw.js', document.baseURI).toString();
    const scope = new URL('./', document.baseURI).toString();
    window.addEventListener('load', () => {
      void navigator.serviceWorker
        .register(url, { scope })
        .then((registration) => {
          if (registration.waiting) this.announceUpdate(registration);
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) this.announceUpdate(registration);
            });
          });
        })
        .catch(() => {
          /* sin SW: la app sigue funcionando online */
        });
    });
  }

  private announceUpdate(registration: ServiceWorkerRegistration): void {
    if (this.updateReady) return;
    this.updateReady = true;
    this.toast('Nueva versión disponible. Recarga para actualizar.', 'info');
    const worker = registration.waiting;
    if (worker) worker.postMessage('SKIP_WAITING');
  }

  private mountConnectivityBadge(): void {
    const actions = document.querySelector('.topbar-actions');
    if (!actions) return;
    const badge = document.createElement('span');
    badge.className = 'pwa-offline-badge';
    badge.textContent = 'Sin conexión';
    badge.hidden = navigator.onLine;
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    actions.prepend(badge);
    this.badge = badge;
  }

  private setOnline(online: boolean): void {
    if (this.badge) this.badge.hidden = online;
    this.toast(online ? 'Conexión restaurada.' : 'Sin conexión: la biblioteca local sigue disponible.', online ? 'ok' : 'info');
  }
}

export class WakeLockKeeper {
  private sentinel: WakeLockSentinel | null = null;
  private requesting = false;

  async update(active: boolean): Promise<void> {
    if (active && !this.sentinel && !this.requesting && 'wakeLock' in navigator) {
      this.requesting = true;
      try {
        this.sentinel = await navigator.wakeLock.request('screen');
        this.sentinel.addEventListener('release', () => {
          this.sentinel = null;
        });
      } catch {
        /* el navegador puede rechazar el wake lock */
      } finally {
        this.requesting = false;
      }
    } else if (!active && this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        /* ya liberado */
      }
      this.sentinel = null;
    }
  }
}
