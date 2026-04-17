function fail(message) {
  console.error(`[desktop-native-check] ${message}`);
  process.exitCode = 1;
}

try {
  const DatabaseModule = await import('better-sqlite3');
  const Database = DatabaseModule.default;
  const db = new Database(':memory:');
  db.prepare('SELECT 1 AS ok').get();
  db.close();
  process.stdout.write('[desktop-native-check] better-sqlite3 binding is available.\n');
} catch (error) {
  fail(
    [
      'better-sqlite3 native bindings are missing for this workspace.',
      'Desktop packaging requires a working better-sqlite3 build before electron-builder runs.',
      'Install or rebuild the native binding on this machine, then rerun `pnpm desktop:package:dir`.',
      `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
    ].join(' '),
  );
}
