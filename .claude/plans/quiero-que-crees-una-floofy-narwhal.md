# Session persistence: remember name + userId (sessionStorage + localStorage fallback)

## Context

Hoy el `userId` se genera con `crypto.randomUUID()` al unirse y se persiste solo en la URL (`?userId=`). Si el usuario vuelve sin ese query param, la app le vuelve a pedir el nombre aunque ya se haya dado de alta. El nombre nunca se persiste como identidad.

Objetivo: si el usuario ya entró al chat con un nombre en este browser, no volver a pedirle el nombre — recuperar `{ userId, name }` y re-unirlo automáticamente. Decisión del usuario: **híbrido session + fallback local** — sessionStorage manda; si la pestaña/ventana es nueva (sin sesión), se restaura desde localStorage. Así una segunda ventana del mismo perfil de Chrome hereda la identidad. Es una solución momentánea: más adelante esto se moverá al backend GraphQL.

Hay una sola conversación (`demo-1`) por ahora.

## Changes

### 1. `frontend/src/hooks/useCurrentUser.ts` (único archivo a modificar)

**Helpers de storage** (junto a `readUserIdFromUrl`/`writeUserIdToUrl`):

- Key con scope por conversación, misma en ambos stores: `simple-react-chat:session:${conversationId}` (mismo estilo de prefijo que `STORAGE_PREFIX` en `stubs/messages.ts:5`).
- `readStoredSession(conversationId): { userId: string; name: string } | null` — lee **sessionStorage primero, fallback localStorage**; `JSON.parse` con try/catch y validación de shape (mismo patrón defensivo que `loadConversation` en `stubs/messages.ts:71-78`, incluido guard `typeof window === 'undefined'`). Si el hit vino de localStorage, copiar a sessionStorage para fijar la identidad de la pestaña.
- `writeStoredSession(conversationId, { userId, name })` — escribe en **ambos** stores.

**Estado inicial** — prioridad URL primero (link compartido gana), luego sesión guardada:

```ts
const [userId, setUserId] = useState<string | null>(
  () => readUserIdFromUrl() ?? readStoredSession(conversationId)?.userId ?? null,
)
```

**En `join` (tras `addParticipant` exitoso, junto a `writeUserIdToUrl` en línea ~69):** `writeStoredSession` con `{ userId: nextUserId, name }`.

**Auto-restore (nuevo `useEffect`):** si hay sesión guardada pero el participante no está en la conversación (p. ej. se limpió el localStorage de la conversación) y no está llena, re-unir automáticamente con el nombre guardado:

- Condiciones: sesión existe, `participants` ya cargó (flag `hasLoadedParticipants`), no hay participante con ese `userId`, `participants.length < 2`, y no se intentó ya (ref guard para no loopear si `join` falla).
- Acción: `void join(storedSession.name)` — reutiliza validación y manejo de errores existentes. `userId` ya viene del estado inicial, así que `join` reutiliza el mismo id (`userId ?? crypto.randomUUID()` en línea 65) y re-escribe la URL.
- Además, si hay sesión restaurada y el `userId` no está en la URL, `writeUserIdToUrl` para que la URL vuelva a reflejar el id.

### 2. Sin cambios en `ChatPage.tsx` ni `AddUserForm.tsx`

`isJoined` ya se deriva de `participants` + `userId` (`useCurrentUser.ts:86-94`). Con el auto-restore, `isJoined` pasa a `true` sin mostrar el form. El form solo aparece brevemente durante la carga inicial — aceptable para este sandbox.

## Consecuencia conocida (aceptada)

Con el fallback en localStorage, dos ventanas/pestañas del mismo perfil comparten identidad: ya no se puede simular el segundo participante abriendo otra pestaña del mismo browser (usar otro perfil/incógnito/browser para eso). El usuario lo aceptó; la solución definitiva vendrá con el backend.

## Reuse

- Patrón de parse defensivo: `loadConversation` / `parseConversation` en `frontend/src/stubs/messages.ts`.
- `join` existente (`useCurrentUser.ts:50-84`) para el re-alta automática — no duplicar lógica de `addParticipant`.
- `writeUserIdToUrl` / `readUserIdFromUrl` existentes.

## Verification

No hay test runner configurado. Verificar a mano (`pnpm dev`):

1. URL limpia → poner nombre → unirse. DevTools: `simple-react-chat:session:demo-1` presente en sessionStorage **y** localStorage con `{userId, name}`; URL con `?userId=`.
2. Misma pestaña, navegar a URL sin query param → recargar. Entra directo al chat con mismo nombre e id, sin form; URL recupera `?userId=`.
3. **Nueva ventana del mismo perfil de Chrome** (sessionStorage vacío) → hereda identidad desde localStorage, entra directo sin pedir nombre, y la copia queda en sessionStorage de esa pestaña.
4. Borrar solo la conversación en localStorage y recargar → se re-une solo con el nombre guardado.
5. Incógnito u otro browser → pide nombre (nada compartido, esperado).
6. `pnpm --filter @chat-example/frontend build` (tsc + vite) y `lint` en verde.
