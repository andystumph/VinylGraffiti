import 'dotenv/config';

function readEnv(name: string, fallback = ''): string {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return value;
}

export const appEnv = {
  databasePath: readEnv('DATABASE_PATH', './data/vinyl-graffiti.db'),
  appName: readEnv('APP_NAME', 'VinylGraffiti'),
  appVersion: readEnv('APP_VERSION', '0.1.0'),
  appContact: readEnv('APP_CONTACT', 'https://example.com/vinyl-graffiti'),
  port: Number.parseInt(readEnv('PORT', '4321'), 10)
};

export function musicBrainzUserAgent(): string {
  return `${appEnv.appName}/${appEnv.appVersion} (${appEnv.appContact})`;
}
