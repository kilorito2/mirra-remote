// ADR-0008: el build de producción no puede contener el modo test (ni el nombre de la variable).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['REMOTE_TEST_MODE', 'KR_INJECTOR', 'KR_AUTO_APPROVE', '__krTest'];
const root = join(import.meta.dirname, '..', 'out');
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|cjs|mjs|html)$/.test(name)) {
      const text = readFileSync(full, 'utf8');
      for (const word of FORBIDDEN) if (text.includes(word)) hits.push(`${full}: ${word}`);
    }
  }
}

walk(root);
if (hits.length) {
  console.error('El build de producción contiene código de test:\n' + hits.join('\n'));
  process.exit(1);
}
console.info('OK: el build de producción no contiene el modo test.');
