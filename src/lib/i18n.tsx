import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "en" | "es";

const STORAGE_KEY = "cliprithm.language";

const translations = {
  en: {
    app: {
      brand: "Smart Video Silence Remover",
      editor: "Editor",
      library: "Library",
      detectionReview: "Detection Review",
      processingMode: "Processing Mode",
      import: "Import",
      export: "Export",
      settings: "Settings",
      mediaLibrary: "Media\nLibrary",
      projectFiles: "Project\nFiles",
      language: "Language",
      english: "English",
      spanish: "Spanish",
    },
    processing: {
      silenceRemoved: "Silence Removed",
      complete: "Complete",
      defaultMessage: "Analyzing video for silence...",
      stage: "Stage",
      cutsDetected: "Cuts detected",
      sourceFile: "Source File",
      decibelFloor: "Decibel Floor",
      sensitivity: "Sensitivity",
      speedMultiplier: "Speed Multiplier",
      minDuration: "Min Duration",
      skipSpeed: "Skip Speed",
    },
    importView: {
      browserNotice:
        "Browser mode: you can test the UI and local preview, but FFmpeg, SQLite and export remain desktop-only.",
      mediaLibrary: "Media Library",
      dragDropTitle: "Drag & Drop your video here to start removing silence.",
      dragDropDescription:
        "Our engine surgically detects and removes audio gaps to make your content punchy and professional.",
      browseFiles: "Browse Files",
      specs: ["MP4, MOV, MKV", "Up to 4K 60FPS", "Max 2GB"],
      smartCut: "Smart Cut",
      smartCutDescription:
        "Automatically identifies pauses based on decibel thresholds and breath analysis.",
      timeWarp: "Time Warp",
      timeWarpDescription:
        "Speeds up silent segments instead of cutting them for smoother conversational pacing.",
      captions: "Captions Beta",
      captionsDescription:
        "Generate subtitles using cloud or local models and optionally burn them into the final export.",
    },
    mediaLibrary: {
      desktopOnly:
        "Media Library, SQLite and auto-updates only run inside the desktop app.",
      empty: "No media imported yet. Start a new project to see files here.",
      recentProjects: "Recent Projects",
      files: "files",
      processed: "Processed",
      inProgress: "In Progress",
      loadingProject: "Loading project...",
      loadedCachedSegments: "Loaded {{count}} cached segments",
      detectingSilence: "Detecting silence...",
      restoringProject: "Restoring your editing session...",
      projectRestored: "Project restored successfully",
    },
    detection: {
      timeline: "Timeline",
      audioActive: "Audio active",
      silence: "Silence ({{count}})",
      nextEditor: "Next: Clip Editor",
      loadingPreviewTitle: "Loading video preview...",
      loadingPreviewDescription:
        "Please wait. The system is still preparing the video and timeline so you can interact without errors.",
      threshold: "Threshold (dB)",
      thresholdTooltip:
        "Controls how quiet audio must be before it counts as silence. Values closer to 0 detect more pauses; lower values are more conservative.",
      minDuration: "Min Duration (s)",
      minDurationTooltip:
        "Ignores very short pauses. Raising it avoids cutting micro-pauses; lowering it detects smaller silent gaps.",
      previewModeLabel: "Preview Mode",
      editedPreview: "Edited Preview",
      editedPreviewTooltip:
        "Plays the assembled sequence using only active clips, so the monitor matches the final cut more closely.",
      sourcePreview: "Source Preview",
      sourcePreviewTooltip:
        "Shows the original file with all silence intact so you can compare against the edited sequence.",
      fade: "Fade Out/In",
      fadeTooltip:
        "Softens the transition between cuts so adjacent clips feel less abrupt.",
      detectBreath: "Detect Breath",
      detectBreathTooltip:
        "Keeps breathed pauses under closer review. In this MVP it only affects the detection pass where supported.",
      mode: "Mode",
      modeTooltip:
        "Cut Silence removes detected gaps. Time Warp keeps them but speeds them up instead of deleting them.",
      cutSilence: "Cut Silence",
      timeWarp: "Time Warp",
      speedMultiplier: "Silence Speed",
      speedMultiplierTooltip:
        "How fast silent segments play in Time Warp mode. Higher values make pauses fly by faster.",
      playbackSpeed: "Playback Speed",
      playbackSpeedTooltip:
        "Global playback speed for preview and export. Changing this speeds up or slows down the entire video. Persists when you reopen the project.",
      resetSpeed: "Reset to 1×",
      reDetect: "Re-detect Silence",
      reDetecting: "Re-detecting...",
      originalTimeline: "Original timeline",
      originalTimelineDescription:
        "Review the detected silence spans before converting them into editable clips.",
      detectedGaps: "Detected: {{count}} gaps",
      detectedGapsDescription:
        "Tune threshold and minimum duration, re-run detection if needed, then continue to the clip editor.",
      continueEditor: "Continue to Clip Editor",
      selectedClip: "Selected Clip",
      start: "Start",
      end: "End",
      duration: "Duration",
      clips: "Clips: {{count}}",
      clipsDescription:
        "Timeline duration goes from {{source}} to {{edited}}.",
      gapsDescription:
        "Delete clips or split at the playhead before exporting your final edit.",
      refreshTimeline: "Refresh Clip Timeline",
      applySuggestedCuts: "Apply Suggested Cuts",
      undo: "Undo",
      splitAtPlayhead: "Split at Playhead",
      removeClip: "Remove Clip",
      importToBegin: "Import a video to get started.",
      proxyLoading: "Loading preview proxy...",
      updatingEditedPreviewTitle: "Updating edited preview...",
      updatingEditedPreviewDescription:
        "The sequence preview is being rebuilt from your current clips so playback matches the latest timeline.",
      fullVideo: "Full Video",
      proxyMemoryLoad:
        "A preview proxy was generated, but it could not be loaded into memory: {{error}}",
      proxyFailed:
        "The preview proxy failed ({{errorLabel}}). Regenerating a safer preview...",
      cannotPlay:
        "The video could not be played ({{errorLabel}}). Check the codec or container.",
      cannotPlayOriginal:
        "The WebView could not play the original file ({{errorLabel}}). Generating a compatible preview proxy...",
      cannotPlayWithProxy:
        "The video could not be played ({{errorLabel}}) and the preview proxy also failed: {{error}}",
    },
    timeline: {
      timeline: "Timeline",
      activeClips: "Active clips: {{count}}",
      silencesRemoved: "Silences removed: {{count}}",
    },
    exportModal: {
      title: "Export Video",
      presets: "Presets",
      custom: "Custom",
      manualSettings: "Manual Settings",
      fileName: "File Name",
      resolution: "Resolution",
      frameRate: "Frame Rate",
      estimatedFileSize: "Estimated File Size",
      clips: "Clips",
      exporting: "Exporting...",
      cancel: "Cancel",
      exportNow: "Export Now",
      preparing: "Preparing export...",
      exportComplete: "Export complete!",
      desktopOnly:
        "Export only works in the desktop app and requires at least one active clip.",
    },
    updates: {
      checking: "Checking for updates...",
      latestVersion: "You're running the latest version!",
      available: "Update Available",
      version: "Version {{version}}",
      later: "Later",
      downloadInstall: "Download & Install",
      downloading: "Downloading update...",
      percentComplete: "{{percent}}% complete",
      ready: "Update ready!",
      restartToApply: "Restart the app to apply the update.",
      restartNow: "Restart Now",
      failed: "Update failed",
    },
    settingsPanel: {
      settings: "Settings",
      captionsBeta: "Captions Beta",
      captionsDescription:
        "Generate transcription and captions from your video audio.",
      provider: "Provider",
      apiKey: "API Key",
      enterApiKey: "Enter your {{provider}} API key...",
      keyStoredLocally:
        "Your key is stored locally and never sent to our servers.",
      ollamaUrl: "Ollama URL",
      lmStudioUrl: "LM Studio URL",
      model: "Model",
      recommended: "Recommended for low-resource machines:",
      localModelRecommendation:
        "Use `whisper:base` or `whisper:small`. These models require ~1-2GB RAM and work on most machines.",
      output: "Output",
      burnIn: "Burn-in captions on export",
      outputDescription:
        "Generated captions will be exported as both SRT and WebVTT files. Enable burn-in to embed them directly in the video.",
    },
    about: {
      title: "About",
      version: "Version {{version}}",
      madeBy: "Made with love by",
      description:
        "Cliprithm is an open-source desktop app that automatically detects and removes silence from your videos — helping you create clean, professional content faster.",
      openSource: "Open Source",
      openSourceDesc:
        "Cliprithm is free and open source under the MIT license. Contributions, bug reports, and feature requests are always welcome.",
      links: "Links",
      website: "Website",
      github: "GitHub",
      reportBug: "Report a Bug",
      requestFeature: "Request a Feature",
      contribute: "Contribute",
      sponsor: "Support Development",
      sponsorDesc:
        "If Cliprithm saves you time, consider supporting its development. Every contribution helps keep the project alive and growing.",
      githubSponsors: "GitHub Sponsors",
      buyMeACoffee: "Buy Me a Coffee",
      builtWith: "Built with",
      thanksMessage: "Thank you for using Cliprithm!",
    },
  },
  es: {
    app: {
      brand: "Eliminador inteligente de silencios",
      editor: "Editor",
      library: "Biblioteca",
      detectionReview: "Revision de silencios",
      processingMode: "Modo de procesamiento",
      import: "Importar",
      export: "Exportar",
      settings: "Ajustes",
      mediaLibrary: "Biblioteca\nde medios",
      projectFiles: "Archivos\ndel proyecto",
      language: "Idioma",
      english: "Ingles",
      spanish: "Espanol",
    },
    processing: {
      silenceRemoved: "Silencio eliminado",
      complete: "Completado",
      defaultMessage: "Analizando el video para detectar silencios...",
      stage: "Etapa",
      cutsDetected: "Cortes detectados",
      sourceFile: "Archivo fuente",
      decibelFloor: "Piso de decibelios",
      sensitivity: "Sensibilidad",
      speedMultiplier: "Multiplicador de velocidad",
      minDuration: "Duracion minima",
      skipSpeed: "Velocidad de salto",
    },
    importView: {
      browserNotice:
        "Modo navegador: puedes probar la UI y el preview local, pero FFmpeg, SQLite y export siguen siendo exclusivos de la app desktop.",
      mediaLibrary: "Biblioteca de medios",
      dragDropTitle: "Arrastra y suelta tu video aqui para empezar a quitar silencios.",
      dragDropDescription:
        "Nuestro motor detecta y elimina huecos de audio para que tu contenido se sienta mas directo y profesional.",
      browseFiles: "Explorar archivos",
      specs: ["MP4, MOV, MKV", "Hasta 4K 60FPS", "Max 2GB"],
      smartCut: "Corte inteligente",
      smartCutDescription:
        "Identifica pausas automaticamente segun umbrales de decibelios y analisis de respiracion.",
      timeWarp: "Time Warp",
      timeWarpDescription:
        "Acelera segmentos silenciosos en lugar de cortarlos para conservar un ritmo de conversacion mas fluido.",
      captions: "Subtitulos beta",
      captionsDescription:
        "Genera subtitulos con modelos en la nube o locales y opcionalmente incrustalos en la exportacion final.",
    },
    mediaLibrary: {
      desktopOnly:
        "La biblioteca de medios, SQLite y las actualizaciones automaticas solo funcionan dentro de la app de escritorio.",
      empty: "Todavia no has importado medios. Inicia un proyecto para ver archivos aqui.",
      recentProjects: "Proyectos recientes",
      files: "archivos",
      processed: "Procesado",
      inProgress: "En progreso",
      loadingProject: "Cargando proyecto...",
      loadedCachedSegments: "{{count}} segmentos en cache cargados",
      detectingSilence: "Detectando silencios...",
      restoringProject: "Restaurando tu sesion de edicion...",
      projectRestored: "Proyecto restaurado exitosamente",
    },
    detection: {
      timeline: "Timeline",
      audioActive: "Audio activo",
      silence: "Silencio ({{count}})",
      nextEditor: "Siguiente: editor de clips",
      loadingPreviewTitle: "Cargando preview del video...",
      loadingPreviewDescription:
        "Espera un momento. El sistema todavia esta preparando el video y la timeline para que puedas interactuar sin errores.",
      threshold: "Umbral (dB)",
      thresholdTooltip:
        "Controla que tan bajo debe caer el audio para considerarlo silencio. Valores mas cercanos a 0 detectan mas pausas; valores mas bajos son mas conservadores.",
      minDuration: "Duracion minima (s)",
      minDurationTooltip:
        "Ignora pausas muy cortas. Subir este valor evita cortar micro-pausas; bajarlo detecta huecos mas pequenos.",
      previewModeLabel: "Modo de preview",
      editedPreview: "Preview editado",
      editedPreviewTooltip:
        "Reproduce la secuencia ensamblada usando solo los clips activos para que el monitor se parezca al corte final.",
      sourcePreview: "Preview original",
      sourcePreviewTooltip:
        "Muestra el archivo original con todos los silencios para compararlo contra la secuencia editada.",
      fade: "Fade out/in",
      fadeTooltip:
        "Suaviza la entrada y salida entre cortes para que el cambio entre clips se sienta menos brusco.",
      detectBreath: "Detectar respiracion",
      detectBreathTooltip:
        "Mantiene bajo observacion las pausas respiradas. En este MVP solo afecta el pase de deteccion donde este soportado.",
      mode: "Modo",
      modeTooltip:
        "Cut Silence elimina los huecos detectados. Time Warp los mantiene, pero los acelera en lugar de borrarlos.",
      cutSilence: "Cortar silencio",
      timeWarp: "Time Warp",
      speedMultiplier: "Velocidad de silencios",
      speedMultiplierTooltip:
        "Que tan rapido se reproducen los silencios en modo Time Warp. Valores mas altos hacen que las pausas pasen mas rapido.",
      playbackSpeed: "Velocidad de reproduccion",
      playbackSpeedTooltip:
        "Velocidad global de reproduccion para preview y exportacion. Cambiar esto acelera o ralentiza todo el video. Se guarda al cerrar el proyecto.",
      resetSpeed: "Restaurar a 1×",
      reDetect: "Volver a detectar silencios",
      reDetecting: "Redetectando...",
      originalTimeline: "Timeline original",
      originalTimelineDescription:
        "Revisa los silencios detectados antes de convertirlos en clips editables.",
      detectedGaps: "Detectado: {{count}} huecos",
      detectedGapsDescription:
        "Ajusta el umbral y la duracion minima, relanza la deteccion si hace falta y luego pasa al editor de clips.",
      continueEditor: "Continuar al editor de clips",
      selectedClip: "Clip seleccionado",
      start: "Inicio",
      end: "Fin",
      duration: "Duracion",
      clips: "Clips: {{count}}",
      clipsDescription:
        "La duracion de la timeline va de {{source}} a {{edited}}.",
      gapsDescription:
        "Elimina clips o dividelos en el playhead antes de exportar la edicion final.",
      refreshTimeline: "Refrescar timeline de clips",
      applySuggestedCuts: "Aplicar cortes sugeridos",
      undo: "Deshacer",
      splitAtPlayhead: "Dividir en el playhead",
      removeClip: "Eliminar clip",
      importToBegin: "Importa un video para comenzar.",
      proxyLoading: "Cargando proxy de preview...",
      updatingEditedPreviewTitle: "Actualizando preview editado...",
      updatingEditedPreviewDescription:
        "La secuencia se esta reconstruyendo a partir de tus clips actuales para que la reproduccion refleje la timeline mas reciente.",
      fullVideo: "Video completo",
      proxyMemoryLoad:
        "Se genero un proxy de preview, pero no se pudo cargar en memoria: {{error}}",
      proxyFailed:
        "El proxy de preview fallo ({{errorLabel}}). Regenerando una version mas segura...",
      cannotPlay:
        "No se pudo reproducir el video ({{errorLabel}}). Revisa el codec o el contenedor.",
      cannotPlayOriginal:
        "El WebView no pudo reproducir el archivo original ({{errorLabel}}). Generando un proxy compatible para el preview...",
      cannotPlayWithProxy:
        "No se pudo reproducir el video ({{errorLabel}}) y tambien fallo el proxy de preview: {{error}}",
    },
    timeline: {
      timeline: "Timeline",
      activeClips: "Clips activos: {{count}}",
      silencesRemoved: "Silencios eliminados: {{count}}",
    },
    exportModal: {
      title: "Exportar video",
      presets: "Presets",
      custom: "Personalizado",
      manualSettings: "Ajustes manuales",
      fileName: "Nombre del archivo",
      resolution: "Resolucion",
      frameRate: "Frame rate",
      estimatedFileSize: "Tamano estimado",
      clips: "Clips",
      exporting: "Exportando...",
      cancel: "Cancelar",
      exportNow: "Exportar ahora",
      preparing: "Preparando exportacion...",
      exportComplete: "Exportacion completada",
      desktopOnly:
        "La exportacion solo funciona en la app desktop y requiere al menos un clip activo.",
    },
    updates: {
      checking: "Buscando actualizaciones...",
      latestVersion: "Ya tienes la ultima version.",
      available: "Actualizacion disponible",
      version: "Version {{version}}",
      later: "Luego",
      downloadInstall: "Descargar e instalar",
      downloading: "Descargando actualizacion...",
      percentComplete: "{{percent}}% completado",
      ready: "Actualizacion lista",
      restartToApply: "Reinicia la app para aplicar la actualizacion.",
      restartNow: "Reiniciar ahora",
      failed: "La actualizacion fallo",
    },
    settingsPanel: {
      settings: "Ajustes",
      captionsBeta: "Subtitulos beta",
      captionsDescription:
        "Genera transcripcion y subtitulos a partir del audio del video.",
      provider: "Proveedor",
      apiKey: "API key",
      enterApiKey: "Introduce tu API key de {{provider}}...",
      keyStoredLocally:
        "Tu clave se guarda localmente y nunca se envia a nuestros servidores.",
      ollamaUrl: "URL de Ollama",
      lmStudioUrl: "URL de LM Studio",
      model: "Modelo",
      recommended: "Recomendado para maquinas con pocos recursos:",
      localModelRecommendation:
        "Usa `whisper:base` o `whisper:small`. Estos modelos requieren ~1-2GB de RAM y funcionan en la mayoria de equipos.",
      output: "Salida",
      burnIn: "Incrustar subtitulos al exportar",
      outputDescription:
        "Los subtitulos generados se exportaran como archivos SRT y WebVTT. Activa el burn-in para incrustarlos directamente en el video.",
    },
    about: {
      title: "Acerca de",
      version: "Version {{version}}",
      madeBy: "Hecho con amor por",
      description:
        "Cliprithm es una app de escritorio de codigo abierto que detecta y elimina automaticamente los silencios de tus videos, ayudandote a crear contenido limpio y profesional mas rapido.",
      openSource: "Codigo Abierto",
      openSourceDesc:
        "Cliprithm es gratuito y de codigo abierto bajo la licencia MIT. Las contribuciones, reportes de errores y solicitudes de funciones son siempre bienvenidas.",
      links: "Enlaces",
      website: "Sitio web",
      github: "GitHub",
      reportBug: "Reportar un error",
      requestFeature: "Solicitar una funcion",
      contribute: "Contribuir",
      sponsor: "Apoyar el desarrollo",
      sponsorDesc:
        "Si Cliprithm te ahorra tiempo, considera apoyar su desarrollo. Cada contribucion ayuda a mantener el proyecto vivo y en crecimiento.",
      githubSponsors: "GitHub Sponsors",
      buyMeACoffee: "Buy Me a Coffee",
      builtWith: "Construido con",
      thanksMessage: "Gracias por usar Cliprithm!",
    },
  },
} as const;

type TranslationTree = Record<string, unknown>;

function getNestedValue(tree: TranslationTree, key: string): string | string[] | undefined {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, tree) as string | string[] | undefined;
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.split(`{{${key}}}`).join(String(value)),
    text
  );
}

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  tList: (key: string) => string[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Language | null;
    if (saved === "en" || saved === "es") {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string, vars?: Record<string, string | number>) => {
      const translated =
        getNestedValue(translations[language], key) ??
        getNestedValue(translations.en, key) ??
        key;
      return Array.isArray(translated)
        ? translated.join(", ")
        : interpolate(translated, vars);
    };

    const tList = (key: string) => {
      const translated =
        getNestedValue(translations[language], key) ??
        getNestedValue(translations.en, key) ??
        [];
      return Array.isArray(translated) ? translated : [translated];
    };

    return { language, setLanguage, t, tList };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }
  return context;
}
