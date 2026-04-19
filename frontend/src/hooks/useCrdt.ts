import { useEffect, useRef, useState, useCallback } from "react";
import { LamportClock } from "../crdt/LamportClock";
import { LWWRegister } from "../crdt/LWWRegister";
import { ORSet } from "../crdt/ORSet";
import { PNCounter } from "../crdt/PNCounter";
import {
  subscribe,
  sendOperation,
  type CrdtOperation,
} from "../services/websocket";
import { customersApi } from "../services/api";

/**
 * Lokaler CRDT-State pro Entity (z.B. pro Kunde).
 * Enthält alle drei CRDT-Typen: LWW-Register für Felder, OR-Set für Todos, PN-Counter für Zähler.
 */
interface CrdtState {
  fields: Map<string, LWWRegister<string>>;  // Feld-Name → LWW-Register
  todos: ORSet<unknown>;                      // Todo-Liste als OR-Set
  counters: Map<string, PNCounter>;           // Counter-Name → PN-Counter
}

export interface UseCrdtResult {
  // LWW fields
  getField: (field: string) => string;
  setField: (field: string, value: string) => void;

  // OR-Set (todos)
  todos: Map<string, unknown>;
  addTodo: (value: unknown) => void;
  removeTodo: (elementId: string) => void;

  // PN-Counter
  getCounter: (field: string) => number;
  incrementCounter: (field: string) => void;
  decrementCounter: (field: string) => void;

  // Meta
  revision: number;  // Wird bei jeder Änderung erhöht → triggert React Re-Render
  deleted: boolean;   // True wenn der Kunde von einem anderen User gelöscht wurde
}

/**
 * React Hook für CRDT-basiertes Live-Editing.
 *
 * Dieser Hook ist die Brücke zwischen den CRDT-Datenstrukturen und der React-UI:
 *   1. Lädt den initialen CRDT-State per REST vom Server
 *   2. Subscribet auf WebSocket-Updates für diese Entity
 *   3. Bietet Methoden zum Lesen/Schreiben die automatisch:
 *      - Lokal den CRDT-State updaten (Optimistic UI — sofortige Anzeige)
 *      - Die Operation per WebSocket an den Server schicken
 *      - Eingehende Operationen von anderen Clients mergen
 *
 * @param entityType z.B. "CUSTOMER"
 * @param entityId   z.B. UUID des Kunden
 * @param nodeId     Eindeutige ID dieses Browser-Tabs (für CRDT Node-Identifikation)
 */
export function useCrdt(
  entityType: string,
  entityId: string,
  nodeId: string,
): UseCrdtResult {
  // Lamport Clock für diesen Browser-Tab — generiert Timestamps für Operationen
  const clockRef = useRef(new LamportClock());
  // Lokaler CRDT-State — wird NICHT in React-State gehalten (kein unnötiges Re-Rendering)
  const stateRef = useRef<CrdtState>({
    fields: new Map(),
    todos: new ORSet(),
    counters: new Map(),
  });
  // Revision-Counter: wird bei jeder Änderung erhöht → triggert Re-Render der UI
  const [revision, setRevision] = useState(0);
  const [deleted, setDeleted] = useState(false);
  const bump = () => setRevision((r) => r + 1);

  // =====================================================
  // 1. Initialen CRDT-State vom Server laden (einmalig)
  // =====================================================
  useEffect(() => {
    customersApi.getCrdtState(entityId).then((data) => {
      const state = stateRef.current;
      for (const [key, val] of Object.entries(data)) {
        if (key === "todos" && typeof val === "object" && val !== null) {
          // OR-Set: Server gibt {elementId: value, ...} zurück
          for (const [elemId, elemVal] of Object.entries(val as Record<string, unknown>)) {
            state.todos.add(elemId, elemVal, "server", 0);
          }
        } else if (typeof val === "number" && key !== "todos") {
          // PN-Counter: Zählerwert aus dem Server-State wiederherstellen
          const counter = new PNCounter();
          for (let i = 0; i < val; i++) counter.increment("server");
          state.counters.set(key, counter);
        } else if (typeof val === "string") {
          // LWW-Register: Feld-Wert mit Server-Timestamp initialisieren
          state.fields.set(key, new LWWRegister(val, 0, "server"));
        }
      }
      bump(); // UI aktualisieren
    }).catch(() => {});
  }, [entityId]);

  // =====================================================
  // 2. WebSocket-Updates von anderen Clients empfangen
  // =====================================================
  useEffect(() => {
    const unsub = subscribe(
      `/topic/customers/${entityId}`,
      (data: unknown) => {
        const op = data as CrdtOperation;
        // Kunde wurde von einem anderen User gelöscht → UI zeigt Warnung
        if (op.type === "CUSTOMER_DELETED") {
          setDeleted(true);
          return;
        }

        // Eigene Operationen überspringen — die wurden schon lokal angewandt (Optimistic UI)
        if (op.nodeId === nodeId) return;

        const clock = clockRef.current;
        // Lamport Clock synchronisieren: unser Counter = max(eigener, empfangener) + 1
        clock.receive(op.timestamp);
        const state = stateRef.current;

        // Je nach Operationstyp den richtigen CRDT updaten
        switch (op.type) {
          case "LWW_UPDATE": {
            const field = op.field!;
            let reg = state.fields.get(field);
            if (!reg) {
              reg = new LWWRegister("", 0, "server");
              state.fields.set(field, reg);
            }
            // CRDT-Merge: Höherer Timestamp gewinnt automatisch
            reg.set(String(op.value), op.timestamp, op.nodeId);
            break;
          }
          case "OR_SET_ADD": {
            // Neuer Dot für dieses Element
            state.todos.add(
              op.elementId!,
              op.value,
              op.nodeId,
              op.timestamp,
            );
            break;
          }
          case "OR_SET_REMOVE": {
            // Alle bekannten Add-Dots zu Remove-Dots verschieben
            state.todos.remove(op.elementId!);
            break;
          }
          case "PN_COUNTER_INCREMENT": {
            const field = op.field!;
            if (!state.counters.has(field))
              state.counters.set(field, new PNCounter());
            state.counters.get(field)!.increment(op.nodeId);
            break;
          }
          case "PN_COUNTER_DECREMENT": {
            const field = op.field!;
            if (!state.counters.has(field))
              state.counters.set(field, new PNCounter());
            state.counters.get(field)!.decrement(op.nodeId);
            break;
          }
        }
        bump(); // UI aktualisieren
      },
    );
    return unsub; // Cleanup: Unsubscribe wenn Component unmountet
  }, [entityId, nodeId]);

  // =====================================================
  // 3. LWW-Register: Felder lesen und schreiben
  // =====================================================

  /** Liest den aktuellen Wert eines Feldes aus dem lokalen CRDT-State */
  const getField = useCallback(
    (field: string): string => {
      void revision; // Dependency auf revision → Re-Read bei Änderungen
      return stateRef.current.fields.get(field)?.value ?? "";
    },
    [revision],
  );

  /**
   * Setzt ein Feld auf einen neuen Wert:
   *   1. Lamport Clock tick → neuer Timestamp
   *   2. LWW-Register lokal updaten (Optimistic UI — sofort sichtbar)
   *   3. Operation per WebSocket an Server schicken
   */
  const setField = useCallback(
    (field: string, value: string) => {
      const clock = clockRef.current;
      const ts = clock.tick();
      const state = stateRef.current;

      // Lokaler CRDT-Merge (sofort sichtbar für den User)
      let reg = state.fields.get(field);
      if (!reg) {
        reg = new LWWRegister("", 0, "server");
        state.fields.set(field, reg);
      }
      reg.set(value, ts, nodeId);
      bump();

      // An Server senden → Server merged, persistiert und broadcastet an andere Clients
      sendOperation({
        type: "LWW_UPDATE",
        entityType,
        entityId,
        field,
        value,
        nodeId,
        timestamp: ts,
      });
    },
    [entityType, entityId, nodeId],
  );

  // =====================================================
  // 4. OR-Set: Todos verwalten
  // =====================================================

  const todos = stateRef.current.todos.value;

  /** Todo hinzufügen: Neues Element mit zufälliger ID und neuem Dot */
  const addTodo = useCallback(
    (value: unknown) => {
      const clock = clockRef.current;
      const ts = clock.tick();
      const elemId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Lokal hinzufügen (Optimistic UI)
      stateRef.current.todos.add(elemId, value, nodeId, ts);
      bump();

      // An Server senden
      sendOperation({
        type: "OR_SET_ADD",
        entityType,
        entityId,
        elementId: elemId,
        value,
        nodeId,
        timestamp: ts,
      });
    },
    [entityType, entityId, nodeId],
  );

  /** Todo entfernen: Alle bekannten Add-Dots zu Remove-Dots verschieben */
  const removeTodo = useCallback(
    (elementId: string) => {
      const clock = clockRef.current;
      const ts = clock.tick();

      stateRef.current.todos.remove(elementId);
      bump();

      sendOperation({
        type: "OR_SET_REMOVE",
        entityType,
        entityId,
        elementId,
        nodeId,
        timestamp: ts,
      });
    },
    [entityType, entityId, nodeId],
  );

  // =====================================================
  // 5. PN-Counter: Zähler verwalten
  // =====================================================

  /** Aktuellen Zählerwert lesen */
  const getCounter = useCallback(
    (field: string): number => {
      void revision; // Re-Read bei Änderungen
      return stateRef.current.counters.get(field)?.value ?? 0;
    },
    [revision],
  );

  /** Zähler um 1 erhöhen (für diesen Node) */
  const incrementCounter = useCallback(
    (field: string) => {
      const clock = clockRef.current;
      const ts = clock.tick();
      const state = stateRef.current;

      if (!state.counters.has(field))
        state.counters.set(field, new PNCounter());
      state.counters.get(field)!.increment(nodeId);
      bump();

      sendOperation({
        type: "PN_COUNTER_INCREMENT",
        entityType,
        entityId,
        field,
        nodeId,
        timestamp: ts,
      });
    },
    [entityType, entityId, nodeId],
  );

  /** Zähler um 1 verringern (für diesen Node) */
  const decrementCounter = useCallback(
    (field: string) => {
      const clock = clockRef.current;
      const ts = clock.tick();
      const state = stateRef.current;

      if (!state.counters.has(field))
        state.counters.set(field, new PNCounter());
      state.counters.get(field)!.decrement(nodeId);
      bump();

      sendOperation({
        type: "PN_COUNTER_DECREMENT",
        entityType,
        entityId,
        field,
        nodeId,
        timestamp: ts,
      });
    },
    [entityType, entityId, nodeId],
  );

  return {
    getField,
    setField,
    todos,
    addTodo,
    removeTodo,
    getCounter,
    incrementCounter,
    decrementCounter,
    revision,
    deleted,
  };
}
