import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? 'null'}`));
    });
  });
}

async function main() {
  let DatabaseModule;
  try {
    DatabaseModule = await import('better-sqlite3');
    const Database = DatabaseModule.default;
    const db = new Database(':memory:');
    db.prepare('SELECT 1').get();
    db.close();
    process.stdout.write('[desktop-native-prepare] better-sqlite3 binding already available.\n');
    return;
  } catch {
    // Fall through and run the package install script.
  }

  const betterSqlitePackageJson = require.resolve('better-sqlite3/package.json');
  const betterSqliteDir = dirname(betterSqlitePackageJson);
  process.stdout.write(`[desktop-native-prepare] Preparing better-sqlite3 in ${betterSqliteDir}\n`);
  if (process.platform === 'win32') {
    await run('cmd.exe', ['/d', '/s', '/c', 'npm.cmd run install'], {
      cwd: betterSqliteDir,
      env: {
        ...process.env,
        npm_config_build_from_source: 'false',
      },
    });
  } else {
    await run('npm', ['run', 'install'], {
      cwd: betterSqliteDir,
      env: {
        ...process.env,
        npm_config_build_from_source: 'false',
      },
    });
  }

  DatabaseModule = await import('better-sqlite3');
  const Database = DatabaseModule.default;
  const db = new Database(':memory:');
  db.prepare('SELECT 1').get();
  db.close();
  process.stdout.write('[desktop-native-prepare] better-sqlite3 binding is ready.\n');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
