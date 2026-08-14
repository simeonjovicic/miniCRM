/**
 * Umsortieren einer Liste von IDs.
 *
 * Getrennt von der Oberfläche, weil hier der einzige Teil steckt, bei dem man
 * sich vertun kann: gearbeitet wird immer auf der **vollständigen** Liste, auch
 * wenn gerade gefiltert angezeigt wird. Würde man nur die sichtbaren IDs
 * umnummerieren, behielten die ausgeblendeten ihre alten Plätze und die
 * Reihenfolge wäre nach dem Aufheben des Filters durcheinander.
 */

/** Schiebt `movedId` direkt vor `beforeId`. Ohne Ziel ans Ende. */
export function moveBefore(all: string[], movedId: string, beforeId: string | null): string[] {
  const rest = all.filter((id) => id !== movedId);
  if (beforeId === null) return [...rest, movedId];

  const target = rest.indexOf(beforeId);
  if (target < 0) return all;

  return [...rest.slice(0, target), movedId, ...rest.slice(target)];
}

/** Schiebt `movedId` direkt hinter `afterId`. Ohne Ziel an den Anfang. */
export function moveAfter(all: string[], movedId: string, afterId: string | null): string[] {
  const rest = all.filter((id) => id !== movedId);
  if (afterId === null) return [movedId, ...rest];

  const target = rest.indexOf(afterId);
  if (target < 0) return all;

  return [...rest.slice(0, target + 1), movedId, ...rest.slice(target + 1)];
}

/**
 * Einen Platz nach oben — gemessen an dem, was man gerade sieht.
 *
 * `visible` ist die gefilterte Liste: nach oben heisst "über den sichtbaren
 * Vorgänger", nicht "über den nächsten in der Gesamtliste". Alles andere wäre
 * beim Ziehen unter einem Filter nicht nachvollziehbar.
 */
export function moveUp(all: string[], visible: string[], movedId: string): string[] {
  const index = visible.indexOf(movedId);
  if (index <= 0) return all;
  return moveBefore(all, movedId, visible[index - 1]!);
}

/** Einen Platz nach unten, ebenfalls gemessen an der sichtbaren Liste. */
export function moveDown(all: string[], visible: string[], movedId: string): string[] {
  const index = visible.indexOf(movedId);
  if (index < 0 || index >= visible.length - 1) return all;
  return moveAfter(all, movedId, visible[index + 1]!);
}
