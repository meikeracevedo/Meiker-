# Meiker Battle Royale

Battle royale 3D de stickmen, siempre de noche, para el celular (y el computador): 20 jugadores aparecen en puntos al azar de una isla pequeña y aleatoria, recogen armas y el último jugador o dúo en pie gana. Se juega online con amigos en salas con lobby o solo contra bots, y se instala como app (PWA).

## Cómo se juega

1. **Lobby**: alguien crea la sala y comparte el código de 4 letras (o el link `/?sala=CODIGO`). El anfitrión elige **Solo** o **Dúo** y la dificultad de los bots, y toca **Iniciar partida**. Los cupos que falten hasta 20 se llenan con bots. En dúo, los jugadores van en parejas según el orden de la lista.
2. **Aparición**: cada jugador (o dúo, juntos) aparece en un punto al azar de la isla, lejos de los demás, con pistola y 3 segundos de protección.
3. **Botín**: 7 pueblos y 5 campamentos con cajas militares llenos de armas (pistola, subfusil, escopeta, rifle de asalto, francotirador), botiquines (+50 vida), escudos (+50 de protección) y munición. Cada arma tiene cargador y hay que recargar.
4. **Mira**: el botón Mira (clic derecho en PC) pasa a primera persona, acerca la vista y hace los disparos más precisos. El francotirador usa mira telescópica.
5. **Zona**: se cierra por etapas. Afuera pierdes vida cada segundo y cada etapa duele más. El círculo amarillo del mapa es la próxima zona.
6. Gana el último en pie. Al morir dejas tu botín en el piso y puedes ver a tu compañero.

Controles en el celular: pulgar izquierdo para moverte (hasta arriba corres), arrastrar a la derecha para mirar, botón de disparo (también sirve para apuntar mientras lo arrastras), Mira, recargar, salto, cambio de arma, botiquín y escudo. Hay ayuda al apuntar.

En el computador: WASD, Shift corre, mouse para mirar (clic para capturarlo), clic dispara, clic derecho mira, R recarga, Espacio salta, E recoge, 1/2 cambian de arma, Q botiquín, X escudo, M mapa, Esc pausa.

## Cómo funciona

| Archivo | Qué hace |
|---|---|
| `public/br.js` | Motor compartido: isla aleatoria (terreno, pueblos, campamentos, árboles, rocas, faroles), aparición al azar, armas con cargador, mira y tiros a la cabeza, zona, botín, equipos y bots. Lo usan el servidor y el modo contra bots. |
| `server.js` | Express + WebSocket (`/ws`): salas con lobby, anfitrión, inicio de partida, simulación a 30 Hz y envío a 20 Hz. |
| `public/game3d.js` | Cliente 3D con Three.js: noche con luna, estrellas, linterna y faroles; stickmen brillantes; cámara en tercera persona y primera con mira, controles, predicción del jugador local e interpolación de los demás, HUD, minimapa y sonido sintetizado. |
| `public/vendor/three.module.min.js` | Three.js r160 servido desde el propio juego (funciona instalado y sin depender de un CDN). |
| `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` | Instalación como app y modo sin conexión. |

El movimiento de cada persona se calcula en su propio celular (se siente instantáneo); el servidor decide disparos, daño, botín, zona y quién gana.

## Jugar en local

```bash
npm install
npm start          # http://localhost:10000
```

Para probar con varios celulares en la misma red wifi, abre `http://IP-de-tu-PC:10000` en todos.

## Publicar en Render

Usa `render.yaml` (Blueprint) o crea un **Web Service** de Node con `npm install` / `npm start` y health check en `/healthz`. No sirve como Static Site porque el online necesita WebSockets. En el plan gratis el servidor se duerme tras un rato sin uso: la primera conexión puede tardar unos 50 segundos.

## Instalar en el celular

Tiene que abrirse por **HTTPS** (Render ya lo da).

- **Android (Chrome)**: botón **Instalar app** en el menú, o "Instalar aplicación" en el menú de Chrome.
- **iPhone (Safari)**: Compartir → "Agregar a inicio".
