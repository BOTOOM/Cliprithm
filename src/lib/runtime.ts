import { isTauri } from "@tauri-apps/api/core";

export function isDesktopRuntime(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

export function assertDesktop(feature: string): void {
  if (!isDesktopRuntime()) {
    throw new Error(
      `${feature} solo está disponible dentro de la app de escritorio de Tauri.`
    );
  }
}
