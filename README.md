# Meiker Stick Battle

Shooter 2D de stickmen para jugar desde el celular: online con amigos (salas con código), contra bots o solo sin internet. Se instala como app (PWA) en Android y iPhone.

## Qué trae

- **Stickmen animados** que corren, saltan doble, hacen impulso (dash) y caen como muñeco de trapo al morir.
- **6 armas**: pistola (infinita), subfusil, escopeta, rifle, francotirador (con láser) y bazuca (daño en área, sirve para volar).
- **Objetos**: botiquín (+50 vida) y escudo (absorbe daño). Reaparecen con tipo aleatorio.
- **Mapa aleatorio en cada partida**: plataformas en varios pisos, coberturas, trampolines y 5 ambientes (ciudad, desierto, neón, selva, nieve).
- **Bots** con 3 dificultades: buscan armas y botiquines, persiguen, esquivan, saltan y apuntan con anticipación.
- **Modos**: todos contra todos (gana quien llegue a 20 bajas) y equipo de humanos contra bots (40 bajas). Partidas de 5 minutos y cambio de mapa automático.
- **Online**: el que crea la sala recibe un código de 4 letras (y un link `/?sala=CODIGO` para compartir). Hasta 8 personas por sala más los bots.
- **Controles móviles**: joystick izquierdo flotante (mover, arriba salta, abajo baja de plataforma), joystick derecho para apuntar y disparar, toque rápido = disparo al rival más cercano, botones de salto e impulso, ayuda al apuntar, vibración.
- **PC**: A/D o flechas, W/Espacio salta, S baja, Shift impulso, mouse apunta y dispara, Tab tabla, Esc pausa.
- Efectos: fogonazos, casquillos, chispas, explosiones, sacudida de cámara, números de daño, kill feed, rachas, minimapa y sonidos sintetizados (sin archivos de audio).

## Cómo funciona

| Archivo | Qué hace |
|---|---|
| `public/sim.js` | Motor compartido: física, armas, bots, mapa aleatorio y lógica de sala. Lo usan el servidor y el navegador (modo solo). |
| `server.js` | Express + WebSocket (`/ws`). Crea salas, corre la simulación a 30 Hz y envía el estado a cada jugador. |
| `public/game.js` | Cliente: render en canvas, controles, predicción del jugador local e interpolación de los demás. |
| `public/index.html`, `public/style.css` | Menú, HUD y pantallas. |
| `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` | Lo que permite instalarlo como app y abrirlo sin conexión. |

El movimiento de cada persona se calcula en su propio celular (se siente instantáneo) y el servidor decide balas, daño, objetos y puntajes.

## Jugar en local

```bash
npm install
npm start          # http://localhost:10000
```

Para probar con dos celulares en la misma red wifi, abre `http://IP-de-tu-PC:10000` en ambos.

## Publicar en Render

Usa `render.yaml` (Blueprint) o crea un **Web Service** de Node con `npm install` / `npm start` y health check en `/healthz`. No sirve como Static Site porque el online necesita WebSockets.

En el plan gratis el servidor se duerme tras un rato sin uso: la primera conexión puede tardar unos 50 segundos.

## Instalar en el celular

Tiene que abrirse por **HTTPS** (Render ya lo da).

- **Android (Chrome)**: en el menú del juego toca **Instalar app**, o en el menú de Chrome elige "Instalar aplicación".
- **iPhone (Safari)**: Compartir → "Agregar a inicio".

Se abre en pantalla completa y horizontal. El modo Solo funciona sin internet.
