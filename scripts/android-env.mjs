// Rutas y variables de entorno compartidas por los scripts de Android.
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';

export const AVD_NAME = 'remote-test';
export const SYSTEM_IMAGE = 'system-images;android-34;google_apis;x86_64';

export function androidEnv() {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.LOCALAPPDATA ?? homedir(), 'Android', 'Sdk');
  const jdkDir = join(sdk, '..', 'kr-jdk-21');
  const avdHome = process.env.ANDROID_AVD_HOME ?? join(homedir(), '.android', 'avd');
  const processEnv = {
    ...process.env,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    JAVA_HOME: process.env.JAVA_HOME ?? jdkDir,
    PATH: [join(jdkDir, 'bin'), join(sdk, 'platform-tools'), join(sdk, 'emulator'), process.env.PATH ?? ''].join(delimiter),
  };
  return {
    sdk,
    jdkDir,
    avdHome,
    processEnv,
    adb: join(sdk, 'platform-tools', 'adb.exe'),
    emulator: join(sdk, 'emulator', 'emulator.exe'),
  };
}
