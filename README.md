# AudioLad Studio — Cabina DJ Digital

Estación DJ completa que corre 100% en el navegador (escritorio y móvil), con biblioteca local persistente, convertidor URL→MP3 real (yt-dlp + FFmpeg) y motor de audio Web Audio. Nada de mocks: cada control está conectado al motor.

## Shell de navegación (tipo Spotify)

- **Barra lateral fija**: Inicio, Buscar, Tu biblioteca, Cabina DJ y Cola; debajo, tus playlists y las herramientas (Sampler, Grabadora, Historial, Fuentes, Lotes, Configuración, Ayuda).
- **Inicio editorial**: hero con estadísticas, «Sigue escuchando», favoritas, playlists, álbumes, novedades y pistas listas para mezclar.
- **Búsqueda global**: pistas, álbumes, artistas y playlists, con filtros y búsquedas recientes persistidas.
- **Barra inferior «Ahora suena»**: portada, título, BPM, transporte del deck activo, progreso con búsqueda, volumen master y acceso a la cola.
- **Panel lateral «A continuación»**: la cola real, sin cambiar de página.
- **Rutas reales y deep links**: `#/`, `#/search`, `#/library`, `#/playlist/:id`, `#/album/:nombre`, `#/artist/:nombre`, `#/cabina`, `#/queue` y `#/herramientas/:id`.
- **Historial de navegación** con botones atrás/adelante del navegador.
- **Command palette** con `Ctrl/⌘ + K` para navegar, reproducir, importar y cambiar el tema.
- **Centro de notificaciones**: cada toast queda en un historial con contador de no leídas.
- **Atajos globales configurables** (`Ctrl/⌘ + /` para el editor): se guardan en el navegador y se documentan en la paleta.
- **Iconos SVG propios** en la shell y las vistas nuevas; sin emojis en la interfaz.

## La cabina (pantalla principal)

**Deck A / Deck B** (independientes, cada uno con):
- Artwork real (carátula ID3 reducida), título, artista, **tonalidad** (análisis de cromas real) y género.
- BPM grande (tag ID3 → estimación por autocorrelación → manual con ×2/½), duración, transcurrido y restante.
- **Waveform real** desde los picos del PCM: reproducción sincronizada, búsqueda por clic/arrastre, **zoom 1×/4×/16×** centrado en el playhead, **beat grid** (marcadores por beat cuando hay BPM), cue principal y **8 hot cues** con color.
- Play/pausa, stop, cue (saltar), set cue, **Sync** real (rechaza lo que salga del rango ±8%).
- **Loops**: por beats cuantizados (½, 1, 2, 4, 8, 16) sobre la rejilla de BPM, y manuales In/Out/Salir (nativos `loopStart`/`loopEnd`).
- **Hot cues 1–8** persistidos por pista: clic fija (vacío) o salta (lleno), Alt+clic / clic derecho borra; teclas 1–8 sobre el deck bajo el crossfader.
- **Pitch acoplado** ±8% (tempo+tono), **jog**: nudge de tempo girando mientras suena, búsqueda al arrastrar en pausa; funciona con mouse y táctil.
- **FX insert real**: Echo (sincronizado a ¾ de beat), Reverb (impulso sintetizado), Flanger y Phaser (LFOs reales) con monto. `reverse` y `beat repeat` aparecen deshabilitados con su razón exacta: requieren AudioWorklet.

**Mixer central** (entre ambos decks):
- Por canal: **Trim (gain)**, High/Mid/Low (−26/+9 dB), **Filtro DJ** (LP↔HP real en un knob), Volumen, **CUE** (envío al bus de monitorización) y medidor de nivel con peak-hold.
- Master: volumen, **limitador bypassable** con medidor de reducción de ganancia, espectro del bus, **CUE MIX** (mezcla master↔cue con ley de potencia constante) y **crossfader** de potencia constante (−3 dB al centro).

## Paneles (barra lateral)

- **📚 Biblioteca**: búsqueda (título/artista/álbum/género), filtro ★ favoritas, orden (recientes/título/artista/BPM/duración), importar, **doble clic = previsualizar** (carga en un deck libre y reproduce), `→ A`/`→ B`, **＋ Cola**, playlists con orden real persistido y metadatos (título, artista, álbum, tonalidad, BPM, género, duración, artwork, fecha, origen, tamaño).
- **⏭ Cola**: preparar la próxima mezcla — añadir desde la biblioteca, reordenar, quitar, "Reproducir siguiente" (al deck libre), auto-carga al terminar una pista (**auto-DJ**), vaciar y **guardar como playlist**.
- **🥁 Sampler**: 6 pads con sonidos **sintetizados en vivo** (kick, snare, clap, hat, tom, zap — osciladores/ruido/envolventes Web Audio), pad iluminado mientras suena, volumen propio, teclas A S D F G H.
- **⏺ Grabadora**: **grabación real del bus master** con MediaRecorder (sin micrófono: graba el stream interno post-limitador), iniciar/pausar/continuar/detener, cronómetro, nombrar y guardar la sesión, lista con reproducción integrada, descarga (webm/opus, mp4 u ogg según navegador) y borrado.
- **🕘 Historial**: pistas reproducidas (deck, fecha, segundos), conversiones realizadas y sesiones grabadas — todo persistido (tope 300 eventos), con borrado.
- **⤓ Convertidor**: URL → `POST /api/convert` y `POST /api/fetch-audio` → **yt-dlp + FFmpeg** → preservación de calidad de audio de origen o MP3 320 kbps → "Añadir a la biblioteca" con análisis completo. Incluye protección anti-SSRF y Rate Limiting por IP.
- **⇪ Lotes**: cola de importación masiva con estado por pista individual.
- **⚙️ Configuración**: diagnóstico en vivo del mecanismo de almacenamiento (OPFS/IndexedDB/RAM), cuota del navegador, estado del motor Web Audio, tabla de atajos y botón para restablecer el mezclador a valores iniciales.
- **❓ Ayuda**: guía rápida de operación de la cabina, atajos, uso del jog, rejilla de beats y filtros.

## Tema claro y oscuro

Dos sistemas visuales completos sobre variables CSS: **oscuro** (cabina nocturna: negro/grafito/metal, alto contraste) y **claro** (plata/blanco, contraste limpio). El interruptor está en la barra superior y persiste. La lógica no cambia: solo el sistema visual.

## Responsive y accesibilidad

- Escritorio: decks + mixer central en fila, panel inferior con pestañas. Tablet: decks lado a lado, mixer abajo. Móvil (<780 px): todo apilado, mixer con canales lado a lado, jog más grande, objetivo táctil ≥44 px (`pointer: coarse`).
- Teclado: `Q`/`P` play A/B, `Espacio` play del deck bajo el crossfader, `1–8` hot cues, `A S D F G H` sampler. Foco visible, `aria-label`/`aria-pressed`/`role=tablist`, estados disabled reales.

## Convertidor URL → MP3 (flujo real, sin mocks)

`POST /api/convert` con `{ "url": "…" }`: sondeo con yt-dlp, descarga del mejor audio, codificación FFmpeg `libmp3lame 192k`, respuesta `audio/mpeg` con `Content-Disposition`/`X-Track-Title`/`X-Track-Duration`. Errores en JSON `{ok:false, code, error, detail}` con el stderr real: `400` URL, `405` método, `500` FFmpeg, `502` descarga, `503` sin herramientas/ocupado (máx. 2), `504` timeout.

### Herramientas y variables del servidor
- `yt-dlp`: `pip install yt-dlp`. `ffmpeg`: del sistema o el binario estático de `@ffmpeg-installer/ffmpeg` (fallback automático).
- `YT_DLP_PATH`, `FFMPEG_PATH`, `PORT` (opcionales). El frontend **no hardcodea URLs** (ruta relativa same-origin; middleware de Vite en dev/preview, `npm run start` en producción).

## Desarrollo

```bash
npm install
npm run dev        # cabina en http://localhost:5173
npm run typecheck  # tsc --noEmit (estricto)
npm run lint       # eslint
npm run test       # vitest — 123 pruebas
npm run build      # typecheck + bundle en dist/
npm run start      # producción: dist/ + /api/convert (PORT, default 8080)
```

## Arquitectura

```
src/
  audio/
    engine.ts     AudioContext único: master, limitador, bus de cue + CUE MIX, tap de grabación, sampler
    deck.ts       Cadena completa por deck (EQ→trim→filtro→FX→vol→crossfader, cue send) + transporte
    fx.ts         Módulos FX reales: echo/reverb/flanger/phaser (+ razón de los que requieren worklet)
    sampler.ts    Síntesis en vivo de los 6 pads
    recorder.ts   MediaRecorder del bus master (estados reales, MIME soportado)
    key.ts        Tonalidad por cromas (DFT) + perfiles Krumhansl; beat grid y loops cuantizados (puro)
    keylock.ts    Keylock por AudioWorklet (mantiene el tono al cambiar velocidad)
    analysis.ts   Picos de PCM, mono, estimación de BPM (puro)
    crossfade.ts  Ley de potencia constante (puro)   rate.ts  BPM efectivo/sync (puro)
    settings.ts   Estado persistente del mezclador
  library/
    storage.ts    OPFS → IndexedDB → memoria   library.ts  Pistas, playlists, cola, favoritos,
                  hot cues, historial, papelera y grabaciones (persistido)
    zip.ts        ZIP propio (store, sin dependencias)   bundle.ts  Exportar/importar biblioteca + audio
    smart.ts      Playlists inteligentes evaluadas al vuelo
    discovery.ts  Similitud, Camelot, energía/ánimo, mezclas diarias, radio, stats y Wrapped
    recommendations.ts  Historial local de recomendaciones aceptadas/descartadas
  audio/fingerprint.ts  Huella de 256 bits para duplicados difusos
  ui/lyrics.ts   Letras LRC con seguimiento sincronizado
  ui/discoveryView.ts  Descubrir: mezclas, radio, sugerencias por deck, ánimo, stats y Wrapped
  ui/pwa.ts      Service worker, instalación y wake lock
  ui/             Cabina: decks, mixer, waveform (zoom/grid/hot cues), biblioteca, cola, sampler,
                  grabadora, historial, convertidor, tema claro/oscuro
    shell.ts      Barra lateral, topbar, stack de páginas y panel de cola
    router.ts     Rutas por hash, deep links e historial
    homeView.ts   Inicio editorial (sigue escuchando, favoritas, álbumes…)
    searchView.ts Búsqueda global con filtros y recientes
    collectionView.ts  Páginas de álbum y artista
    nowPlayingBar.ts   Barra persistente «Ahora suena»
    notificationCenter.ts  Centro de actividad unificado con toasts
    commandPalette.ts  Command palette (Ctrl/⌘+K)
    shortcuts.ts  Atajos configurables + editor visual
    components.ts Sistema de componentes (botones, tarjetas, modales)
    icons.ts      Set de iconos SVG propio
  server/ (server/) POST /api/convert real + servidor de producción
tests/            123 pruebas vitest en 17 archivos (puros, ZIP/bundle, letras, huella, descubrimiento y DOM)
```

CI: `.github/workflows/ci.yml` — `npm ci → typecheck → lint → test → build` en cada push/PR (Node 22). La suite incluye pruebas puras y una prueba de integración DOM (`jsdom`) que arranca la shell, navega entre páginas, abre la paleta, la cola, las notificaciones y el editor de atajos.

## Fase 5 — Biblioteca real, playlists y calidad de audio

### Modelo de datos
- **Pista física** (bytes en OPFS/IndexedDB + metadatos completos) separada de **referencia en playlist** (`trackIds`): una playlist nunca es un archivo; una pista puede vivir en muchas playlists sin copiarse.
- Metadatos por pista: título, artista, álbum, género, año, nº de pista, duración, portada (APIC real o URL de Spotify), BPM (tag/estimado/manual), tonalidad (cromas+Krumhansl), waveform, **calidad real** (formato, códec ffprobe, bitrate efectivo, sample rate, canales), fuente (`Archivo`/`URL`/`Spotify`/`Fuente elegida`), URL de origen, **hash SHA-256** (dedup), `spotifyId`, estado de análisis (`✓ / ◐ / PENDIENTE / ✗`) y fecha de importación.
- **Deduplicación**: importar dos veces el mismo archivo (o traer un audio idéntico) no crea copias; en playlists solo se añaden referencias.

### Calidad de audio (regla absoluta: no degradar)
- `POST /api/fetch-audio` (`{"url": "...", "mode": "original"|"mp3"}`):
  - `original` (**por defecto**): sirve el archivo descargado por yt-dlp **sin re-codificar** (`X-Audio-Preserved: 1`) y reporta calidad real vía ffprobe (`X-Audio-Codec/Bitrate/Samplerate/Channels`).
  - `mp3`: conversión **explícita** a MP3 320 kbps, solo cuando el usuario la elige.
- `POST /api/convert` (legado, MP3 192) sigue disponible por compatibilidad.

### Spotify (legítimo)
- `POST /api/spotify/playlist` usa la **API oficial** con Client Credentials: nombre, propietario, portada, orden y metadatos de cada pista (título, artista, álbum, duración, nº, fecha, `spotifyId`, URL exacta).
- **Nunca extrae audio protegido**: las pistas se crean como referencias "pendientes de fuente de audio autorizada". Sin `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` el endpoint responde **501** con el requisito exacto (nada simulado).
- `POST /api/match` busca candidatos reales (yt-dlp `ytsearch5`); **el usuario elige** la fuente exacta — el sistema jamás sustituye remixes/live/edits silenciosamente.

### Playlists inteligentes
- Especificaciones persistidas (campo/operador/valor sobre artista, género, BPM, tonalidad, duración, fecha, fuente, formato, favorita…) que se **evalúan siempre al vuelo** (`src/library/smart.ts`, con pruebas). Nunca materializan copias.

### UI de biblioteca
Buscador; filtro por fuente y favoritas; orden (recientes/título/artista/BPM/duración); **multiselección** con acciones por lote (→A, →B, ＋playlist, ↻ re-analizar, ✕ quitar); **reproducción previa** (▶ con HTMLAudio real); edición inline de metadatos; columnas de **calidad**, **fuente** y **estado de análisis** (real: "PENDIENTE DE ANÁLISIS", nunca valores inventados); playlists numeradas `01 — Artista — Canción` con ▶/→A/→B por elemento; pestaña **⇪ Lotes** con progreso individual (Pista 1 — completada / 2 — procesando / 3 — pendiente / 4 — error) donde un fallo no cancela el resto; **exportar/importar metadatos** (JSON portátil).

### Dónde vive cada cosa
| Qué | Dónde |
| --- | --- |
| Bytes de audio y grabaciones | OPFS (respaldo IndexedDB, último recurso memoria) |
| Metadatos, playlists, smart, cola, historial | Documento JSON en el mismo store (`library.v1`) |
| Ajustes del mezclador | `localStorage` |
| Conversión/fuentes/Spotify/match | Servidor sin estado (endpoints, sin base de datos) |
| Cache | Solo la del navegador |

### Requisito externo identificado (Spotify)
Para activar la importación de metadatos: crea credenciales en developer.spotify.com/dashboard (Web API) y define `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` como variables de entorno del servidor. Sin ellas, la función queda explícitamente marcada como "autorización requerida" (HTTP 501).
