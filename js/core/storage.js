// localStorage can be unavailable (private mode, blocked storage); never throw.
export function readPref(key, fallback = null) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference simply is not remembered.
  }
}
