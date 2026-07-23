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
      diagnostics: "Diagnostics",
      english: "English",
      spanish: "Spanish",
    },
    processing: {
      silenceRemoved: "Silence Removed",
      complete: "Complete",
      defaultMessage: "Analyzing video for silence...",
      analyzing: "Analyzing video for silence...",
      cutting: "Cutting and joining segments...",
      exporting: "Preparing export...",
      encoding: "Encoding video...",
      timewarp: "Applying time warp...",
      stageComplete: "Processing complete!",
      unknownFile: "unknown",
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
      ffmpegMissingTitle: "Desktop dependencies missing",
      ffmpegMissingDescription:
        "Cliprithm needs FFmpeg and FFprobe to import, analyze and export videos in the desktop app.",
      ffmpegBundledRecovery:
        "The official app includes its media engine. Retry or reinstall Cliprithm if the bundled engine is damaged.",
      ffmpegMissingWindows:
        "FFmpeg is bundled with the official Windows installer. Retry or reinstall Cliprithm if it is unavailable.",
      ffmpegMissingMac:
        "FFmpeg is bundled with the official macOS app. Retry or reinstall Cliprithm if it is unavailable.",
      ffmpegMissingLinux:
        "FFmpeg is bundled with official Linux packages. Retry or reinstall Cliprithm if it is unavailable.",
      ffmpegRetry: "Retry",
      ffmpegCopyCommand: "Copy command",
      ffmpegCommandCopied: "Copied",
      ffmpegRestartApp: "Restart app",
      ffmpegOpenTerminalHint:
        "Run the command in a terminal, then restart Cliprithm so it can detect FFmpeg again.",
      ffmpegDownloadLink: "Download latest Cliprithm",
      desktopImportFailed:
        "Cliprithm could not import or analyze this video. Check the logs and try again.",
      browserImportFailed:
        "The browser preview could not load this file. Try another video or use the desktop app.",
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
      redetectCountdown: "Recalculating in {{seconds}}s",
      redetectCountdownDescription:
        "If you keep adjusting the parameters, the countdown restarts so only the latest configuration is processed.",
      redetectQueued: "Latest changes queued",
      redetectQueuedDescription:
        "A detection pass is still running. The newest parameters will be processed as soon as that pass finishes.",
      redetectProgressDescription:
        "Cliprithm is analyzing the audio again with your latest silence settings.",
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
      ffmpegMissingTitle: "FFmpeg unavailable",
      ffmpegMissingDescription:
        "Detection, preview generation and export need FFmpeg and FFprobe available in this installation.",
    },
    editor: {
      emptyProject: "Import a video to start editing.",
      undo: "Undo",
      redo: "Redo",
      addVideo: "Add video",
      mediaImportFailed: "The video could not be added to the project.",
      media: "Media",
      inspector: "Clip inspector",
      speed: "Speed",
      trim: "Trim source",
      start: "Start",
      end: "End",
      split: "Split",
      duplicate: "Duplicate",
      moveLeft: "Move left",
      moveRight: "Move right",
      delete: "Delete clip",
      videoTrack: "Main video",
      previewStatus: "Preview engine",
      previewStatusDescription: "The continuous project preview will update in the background after edits.",
      previewReady: "Continuous preview ready.",
      previewUnavailable: "Preview could not start.",
      play: "Play",
      pause: "Pause",
      backTen: "Back ten seconds",
      forwardTen: "Forward ten seconds",
      detectSilence: "Detect silence",
      silenceDetection: "Silence detection",
      analyzing: "Analyzing…",
      analysisUnavailable: "Silence analysis could not start.",
      analysisStale: "The project changed while analysis was running. Run it again.",
      candidateSummary: "Candidate: {{count}} silence ranges",
      applyCandidate: "Apply candidate",
      discardCandidate: "Discard",
      analysisScope: "Analysis scope",
      analysisLongWarning: "This timeline analysis may take a while. Continue?",
      selectedClip: "Selected clip",
      wholeTimeline: "Whole timeline",
    },
    timeline: {
      timeline: "Timeline",
      activeClips: "Active clips: {{count}}",
      silencesRemoved: "Silences removed: {{count}}",
      zoomOut: "Zoom out timeline",
      zoomIn: "Zoom in timeline",
    },
    exportModal: {
      title: "Export Video",
      presets: "Presets",
      tiktokShorts: "TikTok / Shorts",
      instagramReels: "Instagram Reels",
      custom: "Custom",
      manualSettings: "Manual Settings",
      verticalRatio: "9:16 ratio",
      fileName: "File Name",
      exportQuality: "Export quality",
      exportQualityDescription:
        "Choose how quickly the video should finish without changing your edit.",
      processingEngine: "Processing engine",
      encoderProfile: "Export profile",
      hardwareCpu: "CPU compatibility mode",
      hardwareAmd: "AMD acceleration",
      hardwareNvidia: "NVIDIA acceleration",
      hardwareIntel: "Intel acceleration",
      hardwareApple: "Apple acceleration",
      profileFast: "Fast",
      profileFastDescription: "Finishes sooner. Best for drafts and quick sharing.",
      profileBalanced: "Balanced",
      profileBalancedDescription: "Good quality with a shorter wait. Recommended for most exports.",
      profileQuality: "Maximum quality",
      profileQualityDescription: "Keeps the current high-quality settings. Takes longer.",
      resolution: "Resolution",
      frameRate: "Frame Rate",
      fullHd: "1080p (Full HD)",
      ultraHd: "4K (Ultra HD)",
      fpsSmooth: "60fps (Smooth)",
      fpsStandard: "30fps (Standard)",
      customCanvas: "Custom Canvas",
      customCanvasDescription:
        "Choose how the source video fits inside the exported frame.",
      sourceDimensions: "Source Dimensions",
      outputFrame: "Output Frame",
      sizeMode: "Target Size",
      sizeModeOriginal: "Original",
      sizeModePreset: "Creator Preset",
      sizeModeCustom: "Custom Size",
      creatorTargets: "Creator Targets",
      creatorTargetVertical: "Vertical Social",
      creatorTargetVerticalDescription: "1080 × 1920",
      creatorTargetYoutube: "YouTube Landscape",
      creatorTargetYoutubeDescription: "1920 × 1080",
      creatorTargetSquare: "Square Social",
      creatorTargetSquareDescription: "1080 × 1080",
      creatorTargetLandscape4k: "4K Landscape",
      creatorTargetLandscape4kDescription: "3840 × 2160",
      creatorTargetVertical4k: "4K Vertical",
      creatorTargetVertical4kDescription: "2160 × 3840",
      width: "Width",
      height: "Height",
      resizeMode: "Resize Mode",
      resizeModeOriginalLabel: "Original",
      resizeModeOriginalDescription:
        "Preserve the source dimensions without scaling or reframing.",
      resizeModeFitLabel: "Fit with bars",
      resizeModeFitDescription:
        "Keep the whole frame visible and add black bars when aspect ratios do not match.",
      resizeModeCropLabel: "Crop to fill",
      resizeModeCropDescription:
        "Fill the entire target frame by cropping overflow from the center.",
      resizeModeStretchLabel: "Stretch",
      resizeModeStretchDescription:
        "Force the video into the target frame even if it distorts the aspect ratio.",
      previewTitle: "Framing Preview",
      previewDescription:
        "Preview the export framing using a still frame from the edited sequence.",
      previewLoading: "Generating preview...",
      previewUnavailable:
        "The preview could not be generated right now. You can still export with the selected settings.",
      previewRegenerate: "Try another frame",
      invalidDimensions:
        "Width and height must be greater than zero before exporting.",
      outputSummary: "Output Summary",
      sourceSize: "Source file size",
      finalSizeDependsOnContent:
        "Final size depends on the codec, motion and compression decisions made by FFmpeg during export.",
      clips: "Clips",
      exporting: "Exporting...",
      cancel: "Cancel",
      exportNow: "Export Now",
      preparing: "Preparing export...",
      exportComplete: "Export complete!",
      ffmpegMissingTitle: "FFmpeg unavailable",
      ffmpegMissingDescription:
        "Export requires FFmpeg and FFprobe available in the desktop installation.",
      desktopOnly:
        "Export only works in the desktop app and requires at least one active clip.",
      exportFailed:
        "Cliprithm could not export this video. Check the logs and try again.",
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
      managedByStoreTitle: "Updates managed by {{store}}",
      managedByStoreDescription:
        "This installation is store-managed. New builds will arrive according to {{store}} rollout timings.",
      availableInStore: "Update available in {{store}}",
      availableInStoreDescription:
        "A newer Cliprithm build is visible for this channel. Availability can still depend on {{store}} propagation.",
      manualUpdateAvailable: "Update available",
      manualUpdateAvailableDescription:
        "A newer Cliprithm build is available for this Linux installation. If automatic install is not possible, update it from the same store or download source you used originally.",
      manualUpdateFallbackDescription:
        "Cliprithm could not finish the Linux update automatically. Update it from the same store or download source you used originally.",
      openStore: "Open store",
      openDownloadSource: "Open download page",
      copyCommand: "Copy command",
      runCommand: "Recommended command",
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
    diagnostics: {
      title: "Diagnostics",
      description:
        "Inspect runtime logs, copy a complete diagnostics report, and open a ready-to-fill GitHub issue when something breaks.",
      copyDiagnostics: "Copy diagnostics",
      copyLogs: "Copy logs",
      reportIssue: "Report issue",
      openLogFolder: "Open log folder",
      refresh: "Refresh",
      appVersion: "App version",
      desktopRuntime: "Desktop runtime",
      browserRuntime: "Browser preview runtime",
      mediaServer: "Media server",
      currentProject: "Current project",
      none: "None",
      noProcessedFile: "No processed file yet.",
      fatalState: "Fatal state",
      noFatalError: "No fatal error captured.",
      runtimeHealthy: "No fatal errors recorded during this session.",
      logFile: "Persistent log file",
      noLogPath: "Log path not available yet.",
      logMeta: "Size: {{size}} • Modified: {{modified}}",
      loadingLogs: "Loading logs...",
      readError: "The log file could not be read: {{error}}",
      noLogFile: "No log file has been created yet.",
      recentRuntimeLogs: "Recent runtime logs",
      noLogs: "No logs captured yet.",
      lastFatalError: "Last fatal error",
      noFatalErrorDetails: "No fatal error details were captured in this session.",
      currentViewLabel: "Current view: {{view}}",
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
    fatal: {
      title: "The app hit a fatal error",
      description:
        "Cliprithm captured a runtime failure. You can copy the full diagnostics, inspect the logs, and open a prefilled GitHub issue.",
      errorSource: "Error source",
      timestamp: "Captured",
      currentView: "Current view",
      mediaServer: "Media server port",
      copyDiagnostics: "Copy diagnostics",
      copyLogs: "Copy logs",
      reportIssue: "Report issue",
      openLogFolder: "Open log folder",
      restart: "Restart app",
      errorDetails: "Error details",
      noErrorDetails: "No additional error details are available.",
      recentLogs: "Recent logs",
    },
    ui: {
      clickToTypeSpeed: "Click to type a custom speed",
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
      diagnostics: "Diagnosticos",
      english: "Ingles",
      spanish: "Espanol",
    },
    processing: {
      silenceRemoved: "Silencio eliminado",
      complete: "Completado",
      defaultMessage: "Analizando el video para detectar silencios...",
      analyzing: "Analizando el video para detectar silencios...",
      cutting: "Cortando y uniendo segmentos...",
      exporting: "Preparando exportacion...",
      encoding: "Codificando video...",
      timewarp: "Aplicando time warp...",
      stageComplete: "Procesamiento completado",
      unknownFile: "desconocido",
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
      ffmpegMissingTitle: "Faltan dependencias de desktop",
      ffmpegMissingDescription:
        "Cliprithm necesita FFmpeg y FFprobe para importar, analizar y exportar videos dentro de la app desktop.",
      ffmpegBundledRecovery:
        "La aplicacion oficial incluye su motor multimedia. Reintenta o reinstala Cliprithm si el motor incluido esta danado.",
      ffmpegMissingWindows:
        "FFmpeg viene incluido con el instalador oficial de Windows. Reintenta o reinstala Cliprithm si no esta disponible.",
      ffmpegMissingMac:
        "FFmpeg viene incluido con la app oficial de macOS. Reintenta o reinstala Cliprithm si no esta disponible.",
      ffmpegMissingLinux:
        "FFmpeg viene incluido con los paquetes oficiales de Linux. Reintenta o reinstala Cliprithm si no esta disponible.",
      ffmpegRetry: "Reintentar",
      ffmpegCopyCommand: "Copiar comando",
      ffmpegCommandCopied: "Copiado",
      ffmpegRestartApp: "Reiniciar app",
      ffmpegOpenTerminalHint:
        "Ejecuta el comando en una terminal y luego reinicia Cliprithm para que vuelva a detectar FFmpeg.",
      ffmpegDownloadLink: "Descargar la última versión de Cliprithm",
      desktopImportFailed:
        "Cliprithm no pudo importar o analizar este video. Revisa los logs y vuelve a intentarlo.",
      browserImportFailed:
        "El preview del navegador no pudo cargar este archivo. Prueba otro video o usa la app de escritorio.",
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
      redetectCountdown: "Recalculando en {{seconds}} s",
      redetectCountdownDescription:
        "Si sigues ajustando los parametros, la cuenta se reinicia para procesar solo la configuracion mas reciente.",
      redetectQueued: "Ultimos cambios en cola",
      redetectQueuedDescription:
        "Todavia hay una deteccion en curso. Los parametros mas recientes se procesaran apenas termine ese calculo.",
      redetectProgressDescription:
        "Cliprithm esta analizando otra vez el audio con tus ajustes mas recientes de silencios.",
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
      ffmpegMissingTitle: "FFmpeg no disponible",
      ffmpegMissingDescription:
        "La deteccion, la generacion de previews y la exportacion necesitan FFmpeg y FFprobe disponibles en esta instalacion.",
    },
    editor: {
      emptyProject: "Importa un video para comenzar a editar.",
      undo: "Deshacer",
      redo: "Rehacer",
      addVideo: "Agregar video",
      mediaImportFailed: "No se pudo agregar el video al proyecto.",
      media: "Medios",
      inspector: "Inspector del clip",
      speed: "Velocidad",
      trim: "Recortar fuente",
      start: "Inicio",
      end: "Final",
      split: "Dividir",
      duplicate: "Duplicar",
      moveLeft: "Mover a la izquierda",
      moveRight: "Mover a la derecha",
      delete: "Eliminar clip",
      videoTrack: "Video principal",
      previewStatus: "Motor de preview",
      previewStatusDescription: "El preview continuo del proyecto se actualizara en segundo plano despues de editar.",
      previewReady: "Preview continuo listo.",
      previewUnavailable: "No se pudo iniciar el preview.",
      play: "Reproducir",
      pause: "Pausar",
      backTen: "Retroceder diez segundos",
      forwardTen: "Avanzar diez segundos",
      detectSilence: "Detectar silencio",
      silenceDetection: "Detección de silencio",
      analyzing: "Analizando…",
      analysisUnavailable: "No se pudo iniciar el análisis de silencio.",
      analysisStale: "El proyecto cambió durante el análisis. Ejecútalo de nuevo.",
      candidateSummary: "Candidato: {{count}} rangos de silencio",
      applyCandidate: "Aplicar candidato",
      discardCandidate: "Descartar",
      analysisScope: "Alcance del análisis",
      analysisLongWarning: "Este análisis del timeline puede tardar. ¿Deseas continuar?",
      selectedClip: "Clip seleccionado",
      wholeTimeline: "Timeline completo",
    },
    timeline: {
      timeline: "Timeline",
      activeClips: "Clips activos: {{count}}",
      silencesRemoved: "Silencios eliminados: {{count}}",
      zoomOut: "Alejar timeline",
      zoomIn: "Acercar timeline",
    },
    exportModal: {
      title: "Exportar video",
      presets: "Presets",
      tiktokShorts: "TikTok / Shorts",
      instagramReels: "Instagram Reels",
      custom: "Personalizado",
      manualSettings: "Ajustes manuales",
      verticalRatio: "Relacion 9:16",
      fileName: "Nombre del archivo",
      exportQuality: "Calidad de exportacion",
      exportQualityDescription:
        "Elige que tan rapido debe terminar el video sin cambiar tu edicion.",
      processingEngine: "Motor de procesamiento",
      encoderProfile: "Perfil de exportacion",
      hardwareCpu: "Modo compatible con CPU",
      hardwareAmd: "Aceleracion AMD",
      hardwareNvidia: "Aceleracion NVIDIA",
      hardwareIntel: "Aceleracion Intel",
      hardwareApple: "Aceleracion Apple",
      profileFast: "Rapido",
      profileFastDescription: "Termina antes. Ideal para borradores y compartir rapido.",
      profileBalanced: "Equilibrado",
      profileBalancedDescription: "Buena calidad con menos espera. Recomendado para la mayoria de exportaciones.",
      profileQuality: "Maxima calidad",
      profileQualityDescription: "Mantiene los ajustes actuales de alta calidad. Tarda mas.",
      resolution: "Resolucion",
      frameRate: "Frame rate",
      fullHd: "1080p (Full HD)",
      ultraHd: "4K (Ultra HD)",
      fpsSmooth: "60fps (Suave)",
      fpsStandard: "30fps (Estandar)",
      customCanvas: "Lienzo personalizado",
      customCanvasDescription:
        "Elige como encaja el video fuente dentro del cuadro exportado.",
      sourceDimensions: "Dimensiones fuente",
      outputFrame: "Cuadro de salida",
      sizeMode: "Tamano objetivo",
      sizeModeOriginal: "Original",
      sizeModePreset: "Preset para creadores",
      sizeModeCustom: "Tamano personalizado",
      creatorTargets: "Formatos para creadores",
      creatorTargetVertical: "Vertical social",
      creatorTargetVerticalDescription: "1080 × 1920",
      creatorTargetYoutube: "YouTube horizontal",
      creatorTargetYoutubeDescription: "1920 × 1080",
      creatorTargetSquare: "Cuadrado social",
      creatorTargetSquareDescription: "1080 × 1080",
      creatorTargetLandscape4k: "4K horizontal",
      creatorTargetLandscape4kDescription: "3840 × 2160",
      creatorTargetVertical4k: "4K vertical",
      creatorTargetVertical4kDescription: "2160 × 3840",
      width: "Ancho",
      height: "Alto",
      resizeMode: "Modo de ajuste",
      resizeModeOriginalLabel: "Original",
      resizeModeOriginalDescription:
        "Mantiene las dimensiones fuente sin escalar ni reencuadrar.",
      resizeModeFitLabel: "Ajustar con franjas",
      resizeModeFitDescription:
        "Mantiene todo el cuadro visible y agrega franjas negras cuando las proporciones no coinciden.",
      resizeModeCropLabel: "Recortar para llenar",
      resizeModeCropDescription:
        "Llena todo el cuadro objetivo recortando el sobrante desde el centro.",
      resizeModeStretchLabel: "Estirar",
      resizeModeStretchDescription:
        "Fuerza el video al cuadro objetivo aunque deforme la proporcion.",
      previewTitle: "Preview de encuadre",
      previewDescription:
        "Previsualiza el encuadre final con un fotograma fijo de la secuencia editada.",
      previewLoading: "Generando preview...",
      previewUnavailable:
        "No se pudo generar el preview ahora mismo. Aun puedes exportar con estos ajustes.",
      previewRegenerate: "Probar otro fotograma",
      invalidDimensions:
        "El ancho y el alto deben ser mayores que cero antes de exportar.",
      outputSummary: "Resumen de salida",
      sourceSize: "Tamano del archivo fuente",
      finalSizeDependsOnContent:
        "El tamano final depende del codec, del movimiento y de la compresion que FFmpeg aplique durante la exportacion.",
      clips: "Clips",
      exporting: "Exportando...",
      cancel: "Cancelar",
      exportNow: "Exportar ahora",
      preparing: "Preparando exportacion...",
      exportComplete: "Exportacion completada",
      ffmpegMissingTitle: "FFmpeg no disponible",
      ffmpegMissingDescription:
        "La exportacion necesita FFmpeg y FFprobe disponibles dentro de la instalacion desktop.",
      desktopOnly:
        "La exportacion solo funciona en la app desktop y requiere al menos un clip activo.",
      exportFailed:
        "Cliprithm no pudo exportar este video. Revisa los logs y vuelve a intentarlo.",
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
      managedByStoreTitle: "Actualizaciones gestionadas por {{store}}",
      managedByStoreDescription:
        "Esta instalacion la gestiona la tienda o gestor de paquetes. Las nuevas builds llegaran segun los tiempos de publicacion de {{store}}.",
      availableInStore: "Actualizacion disponible en {{store}}",
      availableInStoreDescription:
        "Hay una build mas nueva de Cliprithm para este canal. La disponibilidad final puede depender de la propagacion de {{store}}.",
      manualUpdateAvailable: "Actualizacion disponible",
      manualUpdateAvailableDescription:
        "Hay una build mas nueva de Cliprithm para esta instalacion de Linux. Si la instalacion automatica no es posible, actualizala desde la misma tienda o fuente de descarga que usaste originalmente.",
      manualUpdateFallbackDescription:
        "Cliprithm no pudo completar la actualizacion automatica en Linux. Actualizala desde la misma tienda o fuente de descarga que usaste originalmente.",
      openStore: "Abrir tienda",
      openDownloadSource: "Abrir pagina de descarga",
      copyCommand: "Copiar comando",
      runCommand: "Comando recomendado",
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
    diagnostics: {
      title: "Diagnosticos",
      description:
        "Revisa logs de runtime, copia un reporte completo de diagnostico y abre un issue de GitHub listo para completar cuando algo falle.",
      copyDiagnostics: "Copiar diagnostico",
      copyLogs: "Copiar logs",
      reportIssue: "Reportar issue",
      openLogFolder: "Abrir carpeta de logs",
      refresh: "Refrescar",
      appVersion: "Version de la app",
      desktopRuntime: "Runtime desktop",
      browserRuntime: "Runtime de preview en navegador",
      mediaServer: "Servidor de medios",
      currentProject: "Proyecto actual",
      none: "Ninguno",
      noProcessedFile: "Todavia no hay archivo procesado.",
      fatalState: "Estado fatal",
      noFatalError: "No se ha capturado ningun error fatal.",
      runtimeHealthy: "No se registraron errores fatales en esta sesion.",
      logFile: "Archivo de logs persistente",
      noLogPath: "La ruta del log todavia no esta disponible.",
      logMeta: "Tamano: {{size}} • Modificado: {{modified}}",
      loadingLogs: "Cargando logs...",
      readError: "No se pudo leer el archivo de logs: {{error}}",
      noLogFile: "Todavia no se ha creado ningun archivo de logs.",
      recentRuntimeLogs: "Logs recientes del runtime",
      noLogs: "Todavia no hay logs capturados.",
      lastFatalError: "Ultimo error fatal",
      noFatalErrorDetails: "No se capturaron detalles de errores fatales en esta sesion.",
      currentViewLabel: "Vista actual: {{view}}",
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
    fatal: {
      title: "La aplicacion encontro un error grave",
      description:
        "Cliprithm capturo un fallo de runtime. Puedes copiar el diagnostico completo, revisar los logs y abrir un reporte listo para GitHub.",
      errorSource: "Origen del error",
      timestamp: "Capturado",
      currentView: "Vista actual",
      mediaServer: "Puerto del servidor",
      copyDiagnostics: "Copiar diagnostico",
      copyLogs: "Copiar logs",
      reportIssue: "Reportar issue",
      openLogFolder: "Abrir carpeta de logs",
      restart: "Reiniciar app",
      errorDetails: "Detalles del error",
      noErrorDetails: "No hay detalles adicionales del error.",
      recentLogs: "Logs recientes",
    },
    ui: {
      clickToTypeSpeed: "Haz clic para escribir una velocidad personalizada",
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
