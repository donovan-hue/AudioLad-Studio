/**
 * Temporizador de apagado: cuenta atrás visible y callback al expirar.
 * No conoce el motor de audio; main decide cómo desvanecer y pausar.
 */

export class SleepTimer {
  private timer: number | null = null;
  private endAt = 0;

  constructor(
    private readonly onTick: (remainingSec: number | null) => void,
    private readonly onExpire: () => void,
  ) {}

  arm(minutes: number): void {
    this.cancel();
    this.endAt = Date.now() + minutes * 60_000;
    this.timer = window.setInterval(() => this.tick(), 1000);
    this.tick();
  }

  cancel(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.endAt = 0;
    this.onTick(null);
  }

  get remainingSec(): number | null {
    if (!this.endAt) return null;
    return Math.max(0, Math.round((this.endAt - Date.now()) / 1000));
  }

  private tick(): void {
    const remaining = this.remainingSec;
    if (remaining === null) return;
    if (remaining <= 0) {
      this.cancel();
      this.onExpire();
      return;
    }
    this.onTick(remaining);
  }
}
