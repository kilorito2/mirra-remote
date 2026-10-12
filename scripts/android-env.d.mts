export const AVD_NAME: string;
export const SYSTEM_IMAGE: string;
export function androidEnv(): {
  sdk: string;
  jdkDir: string;
  avdHome: string;
  processEnv: NodeJS.ProcessEnv;
  adb: string;
  emulator: string;
};
