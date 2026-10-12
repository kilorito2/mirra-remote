// Instala (sin admin) lo necesario para la suite Android: JDK portable, cmdline-tools,
// platform-tools, emulator, imagen Android 14 google_apis x86_64 y el AVD "remote-test".
// Idempotente: lo que ya está instalado se saltea.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { androidEnv, AVD_NAME, SYSTEM_IMAGE } from './android-env.mjs';

const env = androidEnv();
const { sdk, jdkDir } = env;
const downloads = join(sdk, '..', '.kr-downloads');

// Los .bat de Android requieren shell; los argumentos de esos llamados son constantes de este script.
function run(cmd, args, { input, allowFail = false, shell = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: env.processEnv, shell, stdio: [input ? 'pipe' : 'inherit', 'inherit', 'inherit'] });
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on('exit', (code) => (code === 0 || allowFail ? resolve(code) : reject(new Error(`${cmd} ${args.join(' ')} → ${code}`))));
  });
}

async function download(url, file) {
  // Se escribe recién al terminar la descarga, así que si existe está completo.
  if (existsSync(file)) return;
  console.log(`↓ ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`descarga falló ${res.status}: ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function extractZip(zip, dest) {
  // Directorio nuevo y vacío por archivo descargado (los descargados son datos no confiables).
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  // bsdtar de Windows (entiende zip); el tar de Git Bash interpreta "C:" como host remoto.
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  await run(tar, ['-xf', zip, '-C', dest], { shell: false });
}

async function ensureJdk() {
  if (existsSync(join(jdkDir, 'bin', 'java.exe'))) return console.log('✓ JDK');
  const zip = join(downloads, 'jdk.zip');
  await download('https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse', zip);
  const tmp = join(downloads, 'jdk-extract');
  await extractZip(zip, tmp);
  const [inner] = readdirSync(tmp);
  if (!inner) throw new Error('zip del JDK vacío');
  renameSync(join(tmp, inner), jdkDir);
  console.log('✓ JDK instalado en', jdkDir);
}

async function ensureCmdlineTools() {
  const latest = join(sdk, 'cmdline-tools', 'latest');
  if (existsSync(join(latest, 'bin', 'sdkmanager.bat'))) return console.log('✓ cmdline-tools');
  const xml = await (await fetch('https://dl.google.com/android/repository/repository2-3.xml')).text();
  const names = [...xml.matchAll(/commandlinetools-win-(\d+)_latest\.zip/g)].sort((a, b) => Number(b[1]) - Number(a[1]));
  const name = names[0]?.[0];
  if (!name) throw new Error('no encontré cmdline-tools en el repositorio de Google');
  const zip = join(downloads, name);
  await download(`https://dl.google.com/android/repository/${name}`, zip);
  const tmp = join(downloads, 'cmdline-extract');
  await extractZip(zip, tmp);
  mkdirSync(join(sdk, 'cmdline-tools'), { recursive: true });
  renameSync(join(tmp, 'cmdline-tools'), latest);
  console.log('✓ cmdline-tools instalado');
}

async function ensurePackages() {
  const sdkmanager = `"${join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat')}"`;
  await run(sdkmanager, ['--licenses'], { input: 'y\n'.repeat(30), allowFail: true });
  await run(sdkmanager, ['--install', 'platform-tools', 'emulator', `"${SYSTEM_IMAGE}"`], { input: 'y\n'.repeat(10) });
}

async function ensureAvd() {
  const avdDir = join(env.avdHome, `${AVD_NAME}.avd`);
  if (!existsSync(avdDir)) {
    const avdmanager = `"${join(sdk, 'cmdline-tools', 'latest', 'bin', 'avdmanager.bat')}"`;
    await run(avdmanager, ['create', 'avd', '-n', AVD_NAME, '-k', `"${SYSTEM_IMAGE}"`, '-d', 'pixel_6', '--force'], { input: 'no\n' });
  }
  // Teclado en pantalla (Gboard) para probar el flujo real de teclado móvil; más RAM para Chrome + WebRTC.
  const configPath = join(avdDir, 'config.ini');
  const wanted = { 'hw.keyboard': 'no', 'hw.ramSize': '4096', 'hw.gpu.enabled': 'yes', 'hw.gpu.mode': 'auto' };
  const lines = readFileSync(configPath, 'utf8').split(/\r?\n/).filter((l) => l && !(l.split('=')[0]?.trim() in wanted));
  for (const [k, v] of Object.entries(wanted)) lines.push(`${k}=${v}`);
  writeFileSync(configPath, lines.join('\n') + '\n');
  console.log(`✓ AVD ${AVD_NAME}`);
}

mkdirSync(downloads, { recursive: true });
await ensureJdk();
await ensureCmdlineTools();
await ensurePackages();
await ensureAvd();
console.log('Listo. Acelerador:');
await run(`"${join(sdk, 'emulator', 'emulator.exe')}"`, ['-accel-check'], { allowFail: true });
