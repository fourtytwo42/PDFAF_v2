import { openDB, type IDBPDatabase } from 'idb';
import type { EditStoredSourceFile } from '../../types/editEditor';

const DATABASE_NAME = 'pdf-af-edit-editor';
const DATABASE_VERSION = 1;
const STORE_NAME = 'active-source';
const ACTIVE_SOURCE_KEY = 'active';

interface EditEditorDatabase {
  [STORE_NAME]: EditStoredSourceFile;
}

let databasePromise: Promise<IDBPDatabase<EditEditorDatabase>> | null = null;

function getDatabase(): Promise<IDBPDatabase<EditEditorDatabase>> {
  if (!databasePromise) {
    databasePromise = openDB<EditEditorDatabase>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      },
    });
  }

  return databasePromise;
}

export async function saveActiveEditSource(source: EditStoredSourceFile): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, source, ACTIVE_SOURCE_KEY);
}

export async function loadActiveEditSource(): Promise<EditStoredSourceFile | null> {
  const database = await getDatabase();
  return (await database.get(STORE_NAME, ACTIVE_SOURCE_KEY)) ?? null;
}

export async function clearActiveEditSource(): Promise<void> {
  const database = await getDatabase();
  await database.delete(STORE_NAME, ACTIVE_SOURCE_KEY);
}
