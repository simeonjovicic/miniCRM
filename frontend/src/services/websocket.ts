import { Client, type StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";

/**
 * Typdefinition für eine CRDT-Operation die über WebSocket gesendet/empfangen wird.
 * Entspricht CrdtOperationDto.java im Backend.
 */
export interface CrdtOperation {
  type: string;          // z.B. "LWW_UPDATE", "OR_SET_ADD", "CUSTOMER_DELETED"
  entityType: string;    // z.B. "CUSTOMER"
  entityId: string;      // UUID der Entity
  nodeId: string;        // Welcher Client hat die Operation erstellt
  timestamp: number;     // Lamport-Timestamp
  field?: string;        // Für LWW und PN-Counter: welches Feld
  value?: unknown;       // Für LWW und OR-Set: der neue Wert
  elementId?: string;    // Für OR-Set: Element-ID
}

type MessageHandler = (op: unknown) => void;
type ConnectionHandler = (connected: boolean) => void;

let client: Client | null = null;
let connectHeaders: Record<string, string> = {};
let initialized = false;

// Alle aktiven Subscriptions: Topic-Destination → {Handler-Set, STOMP-Subscription}
const subscriptions = new Map<
  string,
  { handlers: Set<MessageHandler>; stompSub: StompSubscription | null }
>();

/**
 * Offline-Queue: Operationen die gesendet werden während die Verbindung unterbrochen ist.
 * Werden automatisch nachgesendet sobald die Verbindung wiederhergestellt ist.
 * Der SyncStatusBadge zeigt die Queue-Größe an (gelbes "syncing" Badge).
 */
const offlineQueue: CrdtOperation[] = [];

// Handler die bei Verbindungsänderungen benachrichtigt werden (für SyncStatusBadge)
const connectionHandlers = new Set<ConnectionHandler>();

function notifyConnectionHandlers(connected: boolean) {
  for (const handler of connectionHandlers) handler(connected);
}

/** Registriert einen Handler der bei Connect/Disconnect aufgerufen wird. Gibt Cleanup-Funktion zurück. */
export function onConnectionChange(handler: ConnectionHandler): () => void {
  connectionHandlers.add(handler);
  handler(client?.connected ?? false); // Sofort aktuellen Status mitteilen
  return () => {
    connectionHandlers.delete(handler);
  };
}

/** Erstellt eine STOMP-Subscription für eine Destination und verteilt Nachrichten an alle Handler. */
function stompSubscribe(c: Client, dest: string) {
  const entry = subscriptions.get(dest);
  if (!entry) return;
  entry.stompSub?.unsubscribe(); // Alte Subscription aufräumen (bei Reconnect)
  entry.stompSub = c.subscribe(dest, (msg) => {
    const data = JSON.parse(msg.body);
    const current = subscriptions.get(dest);
    if (current) {
      for (const h of current.handlers) h(data);
    }
  });
}

/** Nach Reconnect: Alle bestehenden Subscriptions wieder anmelden. */
function resubscribeAll(c: Client) {
  for (const [dest] of subscriptions) {
    stompSubscribe(c, dest);
  }
}

/** Alle Operationen aus der Offline-Queue an den Server senden. */
function flushOfflineQueue(c: Client) {
  while (offlineQueue.length > 0) {
    const op = offlineQueue.shift()!;
    c.publish({
      destination: "/app/crdt/operation",
      body: JSON.stringify(op),
    });
  }
}

/**
 * Erstellt den STOMP-Client mit SockJS als Transport.
 * SockJS bietet Fallback auf HTTP-Polling wenn WebSocket nicht verfügbar ist.
 * Bei Verbindungsverlust reconnected der Client automatisch nach 3 Sekunden.
 */
function createClient(): Client {
  if (client) {
    client.deactivate();
  }

  client = new Client({
    webSocketFactory: () => new SockJS("/ws"), // SockJS-Endpunkt (konfiguriert in WebSocketConfig.java)
    connectHeaders,  // userId und username werden als STOMP-Connect-Headers mitgeschickt
    reconnectDelay: 3000,  // 3 Sekunden Wartezeit vor Reconnect
    onConnect: () => {
      notifyConnectionHandlers(true);
      resubscribeAll(client!);    // Subscriptions wiederherstellen
      flushOfflineQueue(client!); // Offline-Queue abarbeiten
    },
    onDisconnect: () => {
      notifyConnectionHandlers(false);
    },
    onWebSocketClose: () => {
      notifyConnectionHandlers(false);
    },
  });

  client.activate();
  return client;
}

/** Initialisiert die WebSocket-Verbindung. Wird einmalig nach dem Login aufgerufen. */
export function connect(headers: Record<string, string>) {
  connectHeaders = headers;
  initialized = true;
  createClient();
}

function ensureClient(): Client {
  if (!client || !initialized) {
    throw new Error("WebSocket not initialized — call connect() first");
  }
  return client;
}

/**
 * Subscribet auf eine STOMP-Destination (z.B. /topic/customers/abc-123).
 * Mehrere Handler können sich auf dieselbe Destination registrieren.
 * Gibt eine Cleanup-Funktion zurück (für React useEffect Cleanup).
 */
export function subscribe(
  destination: string,
  handler: MessageHandler,
): () => void {
  const c = ensureClient();

  let entry = subscriptions.get(destination);
  if (!entry) {
    entry = { handlers: new Set(), stompSub: null };
    subscriptions.set(destination, entry);
    if (c.connected) {
      stompSubscribe(c, destination);
    }
  }

  entry.handlers.add(handler);

  // Cleanup: Handler entfernen und bei 0 Handlers die Subscription beim Broker aufräumen
  return () => {
    const current = subscriptions.get(destination);
    if (current) {
      current.handlers.delete(handler);
      if (current.handlers.size === 0) {
        current.stompSub?.unsubscribe();
        subscriptions.delete(destination);
      }
    }
  };
}

/**
 * Sendet eine CRDT-Operation an den Server.
 * Wenn offline: Operation wird in die Queue gelegt und bei Reconnect automatisch gesendet.
 */
export function sendOperation(op: CrdtOperation): void {
  if (!initialized) return;
  const c = ensureClient();
  if (c.connected) {
    c.publish({
      destination: "/app/crdt/operation",
      body: JSON.stringify(op),
    });
  } else {
    offlineQueue.push(op); // Offline-Queue für späteres Senden
  }
}

/** Sendet eine Presence-Nachricht (User schaut Kunde an / verlässt Seite). */
export function sendPresence(
  action: "viewing" | "leaving",
  customerId: string,
): void {
  if (client?.connected) {
    client.publish({
      destination: `/app/presence/${action}/${customerId}`,
      body: "",
    });
  }
}

export function isConnected(): boolean {
  return client?.connected ?? false;
}

/** Anzahl der Operationen in der Offline-Queue (für SyncStatusBadge). */
export function getOfflineQueueSize(): number {
  return offlineQueue.length;
}
