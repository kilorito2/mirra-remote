import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { DEFAULT_PORT, QUALITY_PRESET_NAMES } from '@shared/constants';

const SettingsSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(DEFAULT_PORT),
  selectedIp: z.string().max(64).nullable().default(null),
  preset: z.enum(QUALITY_PRESET_NAMES).default('sharp'),
  audio: z.boolean().default(true),
  startWithWindows: z.boolean().default(false),
  firstRunDone: z.boolean().default(false),
  /** Encoder de video por hardware (si se cuelga, la app lo desactiva sola). */
  hardwareEncoding: z.boolean().default(true),
});
export type Settings = z.infer<typeof SettingsSchema>;

export class SettingsStore {
  private value: Settings;

  constructor(private readonly file: string) {
    this.value = this.load();
  }

  get(): Settings {
    return { ...this.value };
  }

  update(patch: Partial<Settings>): Settings {
    this.value = SettingsSchema.parse({ ...this.value, ...patch });
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.value, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
    return this.get();
  }

  private load(): Settings {
    if (!existsSync(this.file)) return SettingsSchema.parse({});
    try {
      const parsed = SettingsSchema.safeParse(JSON.parse(readFileSync(this.file, 'utf8')));
      return parsed.success ? parsed.data : SettingsSchema.parse({});
    } catch {
      return SettingsSchema.parse({});
    }
  }
}
