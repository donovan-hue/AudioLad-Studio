export type ToastKind = 'info' | 'error' | 'ok';

export interface ToastAction {
  label: string;
  onClick(): void;
}

/** Toast con acción opcional (p. ej. deshacer). Errores y acciones duran más. */
export function showToast(container: HTMLElement, message: string, kind: ToastKind = 'info', action?: ToastAction): void {
  const toast = document.createElement('div');
  toast.className = `toast toast-${kind}`;
  toast.appendChild(document.createTextNode(message));
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      action.onClick();
      toast.remove();
    });
    toast.appendChild(button);
  }
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  const ttl = action ? 9000 : kind === 'error' ? 6000 : 3500;
  window.setTimeout(() => {
    toast.classList.remove('visible');
    window.setTimeout(() => toast.remove(), 300);
  }, ttl);
}
