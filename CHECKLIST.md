# AudioLad Studio — Checklist para alcanzar (y superar) a Spotify

**Leyenda:** `P0` imprescindible · `P1` alto impacto · `P2` pulido / diferenciación

---

## 1. Shell y navegación · P0

- [x] Barra lateral fija (Inicio · Buscar · Tu biblioteca)
- [x] Página de Inicio con secciones editoriales
- [x] Barra inferior «Ahora suena» persistente
- [x] Panel lateral «A continuación»
- [x] Historial de navegación atrás/adelante
- [x] Rutas reales por vista (`/album/:id`, `/artist/:id`, `/playlist/:id`)
- [x] Deep links compartibles
- [x] Command palette (`Ctrl/⌘ + K`)
- [x] Set de iconos SVG propio (eliminar emojis de la UI)
- [x] Sistema de componentes reutilizables
- [x] Notificaciones unificadas (toast + centro de actividad)
- [x] Shortcuts globales documentados y configurables

## 2. Reproducción · P0

- [ ] Shuffle con historial de orden
- [ ] Repetir todo / repetir una / sin repetición
- [ ] Transporte global independiente de los decks
- [ ] «Reproducir a continuación» distinto de «Añadir a la cola»
- [ ] Crossfade automático configurable
- [ ] Reproducción gapless
- [ ] Pre-carga de la siguiente pista
- [ ] Restaurar sesión y posición tras recargar
- [ ] Media Session API (pantalla de bloqueo, teclas multimedia)
- [ ] Control de volumen por teclado
- [ ] Temporizador de apagado
- [ ] Velocidad de reproducción 0.5×–2×
- [ ] Normalización de volumen (LUFS / ReplayGain)
- [ ] Ecualizador de 5–10 bandas
- [ ] Keylock real (time-stretch con AudioWorklet)
- [ ] Beat jump · loop roll · slip mode
- [ ] FX que hoy faltan: reverse y beat repeat
- [ ] Exportar grabaciones en WAV/MP3
- [ ] Ecualización y análisis de loudness por pista

## 3. Biblioteca · P0

- [x] Vistas Álbumes · Artistas · Géneros · Carpetas
- [x] Página de artista
- [x] Página de álbum
- [x] Drag & drop para reordenar playlists
- [x] Drag & drop de archivos y carpetas a la ventana
- [x] Arrastrar pista directamente a Deck A/B
- [x] Portada de playlist (subir / generar / editar)
- [x] Edición masiva de metadatos
- [x] Tags libres con autocompletado
- [x] Filtros combinables por varios campos
- [x] Orden por clic en encabezados de columna
- [x] Búsqueda instantánea con resaltado
- [x] Búsquedas recientes
- [x] Búsqueda global unificada
- [x] Búsqueda tolerante a errores tipográficos
- [x] Lista virtualizada para +10 000 pistas
- [x] Exportar/importar biblioteca completa con audio
- [x] Detección de duplicados difusos (fingerprint)
- [x] Enriquecimiento con MusicBrainz / AcoustID
- [x] Carátula en alta resolución
- [x] Letras LRC y vista sincronizada
- [x] Contador de reproducciones visible
- [x] Papelera con deshacer
- [x] Orden por última reproducción
- [x] Importar desde carpetas locales con File System Access API

## 4. Descubrimiento · P1

- [x] Recomendaciones por similitud (BPM · tonalidad · género)
- [x] Mezclas diarias automáticas
- [x] Radio infinita desde una pista
- [x] Sugerencia de mezcla armónica (Camelot)
- [x] Recomendación de la siguiente pista para cada deck
- [x] «Descubrir» con novedades de la biblioteca
- [x] Estadísticas de escucha
- [x] Resumen anual tipo «Wrapped»
- [x] Filtros por energía / estado de ánimo
- [x] Recomendaciones 100 % locales (sin nube)
- [x] Editor de playlists inteligentes (múltiples reglas y edición)
- [x] Historial de recomendaciones aceptadas/descartadas

## 5. Social y cuentas · P1

- [ ] Perfiles de usuario locales
- [ ] Biblioteca por perfil
- [ ] Playlists colaborativas
- [ ] Compartir pista/playlist por enlace
- [ ] Seguir artistas
- [ ] Scrobbling a Last.fm
- [ ] Spotify OAuth (biblioteca del usuario)
- [ ] Sincronización multi-dispositivo cifrada
- [ ] Modo invitado sin cuenta
- [ ] Jam / sesión compartida en tiempo real
- [ ] Comentarios o reacciones en playlists

## 6. Offline, PWA y plataforma · P0

- [ ] `manifest.webmanifest` con iconos y splash
- [ ] Service Worker con precache
- [ ] Funcionamiento offline completo
- [ ] Indicador online/offline
- [ ] Descargas por playlist
- [ ] Descarga automática de «Me gusta»
- [ ] Sincronización en segundo plano
- [ ] Notificación al terminar conversiones
- [ ] Wake Lock durante la reproducción
- [ ] Instalación como app de escritorio (Tauri/Electron)
- [ ] Share Target en móvil
- [ ] Integración con notificaciones del sistema
- [ ] Actualización controlada de la app (nueva versión disponible)

## 7. Diseño y UX · P0

- [ ] Home con hero y carruseles
- [ ] Tarjetas con hover y botón de play flotante
- [ ] Gradiente dinámico desde la carátula
- [ ] Escala tipográfica y tokens de espaciado
- [ ] Densidad compacta / cómoda
- [ ] Tema automático según el sistema
- [ ] Color de acento configurable
- [ ] Animaciones y transiciones consistentes
- [ ] Respeto a `prefers-reduced-motion`
- [ ] Skeleton loaders
- [ ] Estados vacíos con acción sugerida
- [ ] Menú contextual (clic derecho) en pistas
- [ ] Feedback háptico en móvil
- [ ] Navegación inferior móvil tipo Spotify
- [ ] Gestos: swipe para anterior/siguiente/cola
- [ ] Layouts verificados de 320 px a 4K
- [ ] Modo cabina a pantalla completa
- [ ] Modo presentación / performance
- [ ] Microinteracciones en faders, jog y pads

## 8. Accesibilidad · P0

- [ ] Navegación completa por teclado
- [ ] Foco atrapado en diálogos y menús
- [ ] `aria-live` para cambios de pista
- [ ] Semántica correcta en tablas y listas
- [ ] Etiquetas accesibles en todos los controles
- [ ] Contraste AA/AAA verificado
- [ ] Soporte de texto al 200 %
- [ ] Experiencia de cabina para lector de pantalla
- [ ] Alternativa accesible a la waveform
- [ ] Atajos sin conflicto con tecnologías de asistencia
- [ ] Tests automatizados con axe-core
- [ ] Skip link y landmarks

## 9. Rendimiento · P0

- [ ] Análisis en Web Worker (picos · BPM · tonalidad)
- [ ] Decodificación por streaming para archivos grandes
- [ ] Cache persistente de análisis
- [ ] Virtualización de listas y tablas
- [ ] Waveform en OffscreenCanvas
- [ ] Code-splitting por panel
- [ ] Lazy-load de vistas no visibles
- [ ] Índice de búsqueda en memoria
- [ ] Escritura de metadatos por lotes y con debounce
- [ ] Índice de almacenamiento (dejar de reescribir el JSON completo)
- [ ] LRU de `AudioBuffer` decodificados
- [ ] Presupuesto de bundle con verificación en CI
- [ ] Medición de Web Vitals
- [ ] Pruebas de carga con 10 000 pistas
- [ ] Perfilado de CPU del bucle de render

## 10. Arquitectura y calidad · P0

- [ ] Dividir `main.ts` en controladores y módulos
- [ ] Store central tipado
- [ ] Router con estado en URL
- [ ] Capa de casos de uso separada de la UI
- [ ] Tipos compartidos cliente/servidor
- [ ] Validación de esquemas (zod) en API y storage
- [ ] Migraciones de datos versionadas
- [ ] Manejo global de errores y error boundary
- [ ] `AbortController` en todas las operaciones asíncronas
- [ ] Reintentos con backoff
- [ ] Logs estructurados
- [ ] i18n es/en con catálogo de textos
- [ ] Formatos de fecha y número por locale
- [ ] Convención de commits y versionado semántico
- [ ] ADRs de decisiones técnicas
- [ ] Cobertura de tests ≥ 80 % con umbral en CI
- [ ] Tests de UI con Testing Library
- [ ] E2E con Playwright de los flujos clave
- [ ] Tests de audio con `OfflineAudioContext`
- [ ] Tests de contrato de API
- [ ] Tests de rendimiento y regresión
- [ ] `typescript-eslint` con reglas type-aware
- [ ] Formato automático (Prettier) verificado en CI
- [ ] Dependabot / Renovate
- [ ] Mutation testing
- [ ] Documentación de arquitectura actualizada

## 11. Backend, seguridad y datos · P0

- [ ] Content-Security-Policy estricta
- [ ] HSTS y redirección a HTTPS
- [ ] CORS explícito por origen
- [ ] Rate limit distribuido y persistente
- [ ] Cola de trabajos persistente para conversión
- [ ] Progreso de conversión vía SSE
- [ ] Cache de resultados por URL
- [ ] Límites de tamaño y duración
- [ ] Cancelación real de descargas
- [ ] Endpoint de healthcheck
- [ ] Métricas y observabilidad
- [ ] Dockerfile y docker-compose
- [ ] Pipeline de despliegue
- [ ] Validación de secretos al arrancar
- [ ] Rotación de credenciales
- [ ] Logs sin PII
- [ ] Política de retención de datos
- [ ] Pruebas de abuso y carga
- [ ] Contrato OpenAPI
- [ ] Versionado de API (`/v1`)
- [ ] Proveedor de audio con licencia como alternativa
- [ ] Avisos de derechos de autor y DMCA

## 12. Conversión y metadatos · P1

- [ ] Progreso por etapas (sondeo · descarga · transcodificación)
- [ ] Perfiles de salida: Opus · AAC · FLAC · WAV
- [ ] Preservar carátula y tags al convertir
- [ ] Plantilla de nombre de archivo
- [ ] Recorte de silencio inicial/final
- [ ] Medición LUFS y True Peak
- [ ] Detección de downbeat y frases musicales
- [ ] Mayor precisión de BPM y tonalidad
- [ ] Detección de voz / instrumental
- [ ] Separación de stems (opcional)
- [ ] Importar playlists de otras plataformas
- [ ] Exportar a M3U · CSV · JSON
- [ ] Letras y carátula automáticas

## 13. Producto y negocio · P2

- [ ] Onboarding de 3 pasos
- [ ] Tour interactivo de la cabina
- [ ] Página de novedades
- [ ] Analítica de producto privacy-first
- [ ] Consentimiento de cookies
- [ ] Términos de servicio y privacidad
- [ ] Planes y feature flags
- [ ] Telemetría de errores (Sentry)
- [ ] Feedback dentro de la app
- [ ] Documentación de usuario
- [ ] Vídeos tutoriales
- [ ] Landing pública
- [ ] Modo demo con contenido libre
- [ ] Branding e identidad visual definitiva
