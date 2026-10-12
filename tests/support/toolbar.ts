import type { Page } from '@playwright/test';

/**
 * Toca un botón de la barra flotante. La barra se esconde sola a los 4 s, así que puede esconderse
 * entre que se la muestra y el clic: se reintenta mostrándola de nuevo.
 */
export async function clickToolbar(page: Page, name: string | RegExp): Promise<void> {
  const reveal = page.getByRole('button', { name: 'Mostrar controles' });
  const button = page.getByRole('navigation', { name: 'Controles' }).getByRole('button', { name });
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await reveal.isVisible()) await reveal.click({ timeout: 2_000 }).catch(() => undefined);
    try {
      await button.click({ timeout: 2_000 });
      return;
    } catch {
      // La barra se escondió en el medio: se vuelve a mostrar.
    }
  }
  throw new Error(`No se pudo tocar "${String(name)}" en la barra`);
}
