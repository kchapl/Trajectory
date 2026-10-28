// Persistence. One serialisable document in browser storage, and the same document
// as a file the user owns. See ADR 0001: the export IS the state.

import { migrate, SCHEMA_VERSION } from './domain.js';

const KEY = 'trajectory.state';
const MODE_KEY = 'trajectory.mode';

// Returns { state, error }. An unreadable document is copied aside before the app
// carries on with an empty one, because the browser store is the only copy there is.
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (error) { return { state: null, error: null }; }
  if (!raw) return { state: null, error: null };
  try {
    return { state: migrate(JSON.parse(raw)), error: null };
  } catch (error) {
    console.error('Could not open the saved state:', error);
    try { localStorage.setItem(KEY + '.unreadable', raw); } catch (copyError) { /* storage full */ }
    return { state: null, error: error };
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Could not save:', error);
    return false;
  }
}

export function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'implementation' ? 'implementation' : 'planning';
  } catch (error) {
    return 'planning';
  }
}

export function saveMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch (error) { /* private mode */ }
}

export function serialise(state) {
  return JSON.stringify(state, null, 2);
}

export function download(state, filename) {
  const blob = new Blob([serialise(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'trajectory-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// An export from a newer version than the app understands is refused rather than
// truncated, so migrate() throws and this reports it instead of half-importing.
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(migrate(JSON.parse(String(reader.result))));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

export { SCHEMA_VERSION };
