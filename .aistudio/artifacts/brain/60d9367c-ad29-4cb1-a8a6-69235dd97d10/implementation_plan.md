# Optimización Táctil y Pantallas Pequeñas para SoulDolls

Plan de adaptación ergonómica y responsiva de SoulDolls para smartphones y pantallas táctiles (375px a 768px), optimizando las zonas de alcance del pulgar, hitboxes táctiles de al menos 48px–52px, control de sprint continuo, y dock de batalla compacto con pestañas colapsables.

## Decisiones Confirmadas del Usuario

> [!IMPORTANT]
> - **Control de Exploración Táctil**: D-pad flotante mejorado con hitboxes ampliadas (52px), soporte para pulsación continua, diagonales fluidas y botón de bloqueo de carrera (*Sprint Lock*), evitando tener que mantener pulsado el botón B permanentemente en pantallas táctiles.
> - **Interfaz de Combate en Pantallas Pequeñas**: Interfaz compacta organizada por pestañas colapsables (*Compact Tabbed Interface*), que minimiza la altura vertical para que los modelos 3D y los sprites de batalla permanezcan visibles en todo momento.

---

## 1. Visión General & Concepto

Adaptar SoulDolls para ofrecer una experiencia fluida, ergonómica y táctil nativa en smartphones y pantallas pequeñas sin alterar la experiencia de escritorio. La meta es eliminar la fatiga dactilar, evitar toques accidentales, garantizar blancos táctiles (*touch targets*) de al menos 48px y asegurar que el mundo 3D del motor Luminati sea el protagonista visual.

---

## 2. Experiencia de Usuario & Diseño Visual

### A. Ergonomía del Pulgar (Thumb-Zone Architecture)
- **Zona de Alcance Natural (Inferior 35% del viewport)**:
  - **D-Pad Flotante Izquierdo**: Botones direccionales agrandados a 52x52px con espaciado ergonómico, feedback visual táctil instantáneo y soporte de deslizamiento continuo.
  - **Botón de Bloqueo de Sprint (Sprint Lock Toggle)**: Interruptor táctil que permite fijar el modo correr sin forzar al usuario a sostener el dedo mientras navega el D-pad.
  - **Botón de Acción A (Hablar / Interactuar)**: Botón principal de 60x60px en la esquina inferior derecha con respuesta háptica (`navigator.vibrate(15)` en navegadores compatibles).
  - **Dock de Batalla Compacto**: Pestañas horizontales fijadas en la parte inferior con altura reducida ($\le 15\%$ del viewport en modo colapsado) para preservar la visibilidad del estadio de combate.

### B. Sistema de Combate Compacto en Móviles
- **Barra de Pestañas Rápidas**: `[LUCHAR]`, `[VIALES]`, `[ALMAS]`, `[HUIR]` distribuidos en una hilera compacta de fácil acceso con el pulgar.
- **Gaveta Desplegable de Habilidades**: Despliegue hacia arriba con tarjetas de habilidades a 2 columnas con tipografía nítida, PP y tipos legibles.
- **Tarjetas de Estado Flotantes Ultraligeras**: Indicadores de HP de jugador y rival condensados en las esquinas superiores con fuentes pixel legibles y barras de salud de alto contraste.

### C. Modales Adaptativos (SoulDex, Equipo, Mochila)
- Adaptación para viewports de 375px–430px:
  - Reemplazo del diseño fijo de dos columnas por pestañas superiores o vistas apiladas en móvil con altura máxima de 90vh y barras de desplazamiento táctiles suaves (`touch-pan-y`).
  - Lista de SoulDolls con tarjetas táctiles de 56px de alto, iconos grandes y botón de cierre flotante accesible en la esquina superior.

---

## 3. Decisiones Técnicas y Compromisos

1. **D-Pad con Puntero Unificado (`PointerEvents`)**:
   - *Decisión*: Reemplazar los eventos disjuntos `mousedown/touchstart` por eventos `PointerEvent` (`onPointerDown`, `onPointerUp`, `onPointerLeave`, `onPointerCancel`) con captura de puntero (`setPointerCapture`).
   - *Por qué*: Previene la duplicación de eventos sintéticos táctiles y ratón, y permite arrastrar el pulgar de un botón direccional a otro sin soltar la pantalla.
2. **Respuesta Háptica Sutil**:
   - *Decisión*: Integrar vibración de pulso corto (10–25ms) al interactuar con botones de combate o pulsar la acción A en dispositivos Android / compatibles.
   - *Por qué*: Aporta una sensación de consola portátil física (GameBoy / Switch).
3. **Optimización de Viewport y Prevención de Zoom**:
   - *Decisión*: `touch-action: none` en áreas de control y `overscroll-behavior: none` en el contenedor raíz para evitar rebotes o scrolls accidentales del navegador durante el juego.

---

## 4. Arquitectura de Componentes & Flujo Táctil

```
┌────────────────────────────────────────────────────────┐
│                   SOULDOLLS VIEWPORT                   │
│                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  │
│  │ Mini HP Status Rival  │  │ HUD Resumido (Top)    │  │
│  └───────────────────────┘  └───────────────────────┘  │
│                                                        │
│               [ 3D LUMINATI ARENA / MUNDO ]            │
│                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  │
│  │ Floating D-Pad (52px) │  │ Botón Sprint Lock [⚡] │  │
│  │ + Deslizamiento suave │  │ Botón Acción [A] 60px │  │
│  └───────────────────────┘  └───────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Dock de Batalla Táctil Compacto (Colapsable)    │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Mapeo de Componentes a Actualizar
- `src/components/VirtualControls.tsx`: Agrandar hitboxes a 52px+, agregar toggle de Sprint Lock con estado visual activo, añadir vibración háptica opcional, y soporte de eventos de puntero unificados.
- `src/components/BattleUI.tsx`: Rediseñar el panel de comandos inferior para pantallas pequeñas mediante pestañas compactas y gaveta colapsable.
- `src/components/TopHUD.tsx`: Reducir padding en móviles, compactar los botones a iconos con hitboxes de 44px para evitar desbordamientos.
- `src/components/PartyModal.tsx`, `SoulDexModal.tsx`, `BagModal.tsx`: Ajustar la distribución responsive móvil (`flex-col md:flex-row`, scroll táctil fluido).
- `src/App.tsx`: Sincronización del estado de Sprint Lock con el motor de movimiento.
