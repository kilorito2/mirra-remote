import { APPROVAL_TIMEOUT_MS } from '@shared/constants';

export type ApprovalResult = 'approved' | 'rejected' | 'busy';

/** Pregunta al usuario; debe resolver `false` si se aborta por `signal`. */
export type AskUser = (request: { deviceName: string; ip: string; method: 'qr' | 'pin' }, signal: AbortSignal) => Promise<boolean>;

/** Un solo diálogo de aprobación a la vez; se rechaza solo a los 60 s. */
export class ApprovalGate {
  private inFlight: AbortController | null = null;

  constructor(
    private readonly ask: AskUser,
    private readonly timeoutMs = APPROVAL_TIMEOUT_MS,
  ) {}

  get pending(): boolean {
    return this.inFlight !== null;
  }

  async request(deviceName: string, ip: string, method: 'qr' | 'pin', cancel?: AbortSignal): Promise<ApprovalResult> {
    if (this.inFlight) return 'busy';
    const controller = new AbortController();
    this.inFlight = controller;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onCancel = () => controller.abort();
    cancel?.addEventListener('abort', onCancel, { once: true });
    try {
      const approved = await Promise.race([
        this.ask({ deviceName, ip, method }, controller.signal),
        new Promise<boolean>((resolve) => controller.signal.addEventListener('abort', () => resolve(false), { once: true })),
      ]);
      return approved && !controller.signal.aborted ? 'approved' : 'rejected';
    } catch {
      return 'rejected';
    } finally {
      clearTimeout(timer);
      cancel?.removeEventListener('abort', onCancel);
      this.inFlight = null;
    }
  }

  /** Cierra el diálogo abierto (ej. al cortar con el atajo). */
  abort(): void {
    this.inFlight?.abort();
  }
}
