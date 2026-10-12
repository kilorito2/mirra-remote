import type { Point } from '@shared/coords';
import type { KeyName, MouseButton } from '@shared/protocol';
import type { InjectedAction } from '@shared/testHooks';
import type { InputInjector } from '../ports/InputInjector';

/** Graba lo que se inyectaría, sin tocar el mouse ni el teclado de la PC (tests y REMOTE_TEST_MODE). */
export class FakeInjector implements InputInjector {
  readonly actions: InjectedAction[] = [];
  private position: Point = { x: 0, y: 0 };

  moveTo(p: Point): Promise<void> {
    this.position = p;
    this.actions.push({ type: 'move', x: p.x, y: p.y });
    return Promise.resolve();
  }

  button(button: MouseButton, action: 'down' | 'up'): Promise<void> {
    this.actions.push({ type: 'button', button, action });
    return Promise.resolve();
  }

  scroll(dx: number, dy: number): Promise<void> {
    this.actions.push({ type: 'scroll', dx, dy });
    return Promise.resolve();
  }

  key(key: KeyName, action: 'down' | 'up'): Promise<void> {
    this.actions.push({ type: 'key', key, action });
    return Promise.resolve();
  }

  typeText(text: string): Promise<void> {
    this.actions.push({ type: 'text', text });
    return Promise.resolve();
  }

  cursorPosition(): Promise<Point> {
    return Promise.resolve(this.position);
  }

  displaysChanged(): void {
    // Sin estado de pantallas.
  }

  /** Teclas y botones que quedarían apretados según lo grabado (para verificar que no queda nada trabado). */
  stillPressed(): string[] {
    const down = new Set<string>();
    for (const a of this.actions) {
      if (a.type === 'key') {
        if (a.action === 'down') down.add(`key:${a.key}`);
        else down.delete(`key:${a.key}`);
      } else if (a.type === 'button') {
        if (a.action === 'down') down.add(`button:${a.button}`);
        else down.delete(`button:${a.button}`);
      }
    }
    return [...down];
  }

  clear(): void {
    this.actions.length = 0;
  }
}
