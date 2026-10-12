import { createRequire } from 'node:module';
import type { Point } from '@shared/coords';
import type { KeyName, MouseButton } from '@shared/protocol';
import type { InputInjector } from '../ports/InputInjector';

import type * as RobotModule from '@jitsi/robotjs';

type Robot = typeof RobotModule;

const ROBOT_KEYS: Partial<Record<KeyName, string>> = {
  ctrl: 'control',
  meta: 'command',
};

/**
 * ADR-0002: @jitsi/robotjs (N-API, sin rebuild). En Windows usa SendInput sobre el escritorio virtual en
 * píxeles físicos (Electron es per-monitor DPI aware). Las llamadas son síncronas y cortas.
 */
export class RobotJsInjector implements InputInjector {
  private readonly robot: Robot;

  constructor() {
    // Carga perezosa: el módulo nativo solo se abre si se usa el injector real.
    this.robot = createRequire(import.meta.url)('@jitsi/robotjs') as Robot;
    this.robot.setMouseDelay(0);
    this.robot.setKeyboardDelay(0);
  }

  moveTo(p: Point): Promise<void> {
    this.robot.moveMouse(Math.round(p.x), Math.round(p.y));
    return Promise.resolve();
  }

  button(button: MouseButton, action: 'down' | 'up'): Promise<void> {
    this.robot.mouseToggle(action, button);
    return Promise.resolve();
  }

  scroll(dx: number, dy: number): Promise<void> {
    // robotjs: y > 0 sube la rueda y en horizontal invierte el signo; el protocolo usa dy > 0 = abajo.
    this.robot.scrollMouse(-dx, -dy);
    return Promise.resolve();
  }

  key(key: KeyName, action: 'down' | 'up'): Promise<void> {
    this.robot.keyToggle(ROBOT_KEYS[key] ?? key, action);
    return Promise.resolve();
  }

  /**
   * Unicode unidad por unidad (UTF-16): `typeString` de robotjs trunca los caracteres fuera del BMP;
   * con unicodeTap por unidad, los pares sustitutos (emoji) llegan bien. \n y \t van como teclas.
   */
  typeText(text: string): Promise<void> {
    for (let i = 0; i < text.length; i++) {
      const unit = text.charCodeAt(i);
      if (unit === 0x0a) this.robot.keyTap('enter');
      else if (unit === 0x09) this.robot.keyTap('tab');
      else this.robot.unicodeTap(unit);
    }
    return Promise.resolve();
  }

  cursorPosition(): Promise<Point> {
    return Promise.resolve(this.robot.getMousePos());
  }

  displaysChanged(): void {
    this.robot.updateScreenMetrics();
  }
}
