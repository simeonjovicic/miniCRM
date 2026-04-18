package com.collabcrm.service;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Presence-Service — trackt welche User online sind und welchen Kunden sie gerade ansehen.
 *
 * Verwendet für:
 *   - Dashboard: Pulsierender grüner Dot neben Online-Usern
 *   - Kunden-Detailseite: Zeigt wer denselben Kunden gerade offen hat
 *
 * Zwei separate Maps:
 *   - sessions: WebSocket sessionId → User-Info (wer ist verbunden)
 *   - customerViewers: customerId → Set von sessionIds (wer schaut welchen Kunden an)
 *
 * ConcurrentHashMap für Thread-Safety bei gleichzeitigen WebSocket-Verbindungen.
 */
@Service
public class PresenceService {

    private final SimpMessagingTemplate messagingTemplate;

    // sessionId → UserPresence (welcher User hinter dieser WebSocket-Session steckt)
    private final Map<String, UserPresence> sessions = new ConcurrentHashMap<>();
    // customerId → Set von sessionIds die diesen Kunden gerade ansehen
    private final Map<String, Set<String>> customerViewers = new ConcurrentHashMap<>();
    // userId → letzter Zeitpunkt der Trennung (null = noch nie offline gewesen)
    private final Map<String, Instant> lastSeenAt = new ConcurrentHashMap<>();
    // userId → UserPresence (für persistente Mitgliederliste auch für offline User)
    private final Map<String, UserPresence> knownUsers = new ConcurrentHashMap<>();

    public PresenceService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public record UserPresence(String userId, String username) {}

    /** Wird vom WebSocketEventListener aufgerufen wenn ein User sich per WebSocket verbindet. */
    public void userConnected(String sessionId, String userId, String username) {
        var presence = new UserPresence(userId, username);
        sessions.put(sessionId, presence);
        knownUsers.put(userId, presence); // Dauerhaft für Mitgliederliste merken
        broadcastOnlineUsers(); // Alle Clients über neuen Online-User informieren
    }

    /**
     * Wird aufgerufen wenn eine WebSocket-Verbindung getrennt wird.
     * Räumt alle Presence-Daten dieser Session auf:
     *   - Entfernt aus der Online-Liste
     *   - Entfernt aus allen Kunden-Viewer-Listen
     */
    public void userDisconnected(String sessionId) {
        var presence = sessions.remove(sessionId);
        // lastSeenAt setzen sobald der User offline geht
        if (presence != null) {
            lastSeenAt.put(presence.userId(), Instant.now());
        }
        // Aus allen Kunden-Viewer-Listen entfernen
        for (var entry : customerViewers.entrySet()) {
            if (entry.getValue().remove(sessionId)) {
                broadcastCustomerPresence(entry.getKey());
            }
        }
        broadcastOnlineUsers();
    }

    /**
     * User hat eine Kunden-Detailseite geöffnet.
     * Entfernt ihn zuerst vom vorherigen Kunden (falls vorhanden),
     * dann fügt ihn zum neuen Kunden hinzu.
     */
    public void userViewingCustomer(String sessionId, String customerId) {
        // Vom vorherigen Kunden entfernen falls User gewechselt hat
        for (var entry : customerViewers.entrySet()) {
            if (entry.getValue().remove(sessionId) && !entry.getKey().equals(customerId)) {
                broadcastCustomerPresence(entry.getKey());
            }
        }
        // Zum neuen Kunden hinzufügen
        customerViewers.computeIfAbsent(customerId, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
        broadcastCustomerPresence(customerId);
    }

    /** User hat die Kunden-Detailseite verlassen. */
    public void userLeftCustomer(String sessionId, String customerId) {
        var viewers = customerViewers.get(customerId);
        if (viewers != null) {
            viewers.remove(sessionId);
            if (viewers.isEmpty()) customerViewers.remove(customerId); // Aufräumen
            broadcastCustomerPresence(customerId);
        }
    }

    /** Liste aller aktuell online User (für Dashboard). */
    public List<Map<String, String>> getOnlineUsers() {
        return sessions.values().stream()
                .distinct()
                .map(p -> Map.of("userId", p.userId(), "username", p.username()))
                .toList();
    }

    /**
     * Alle bekannten User mit Online-Status und letztem Zeitpunkt der Trennung.
     * Wird für die "Mitglieder"-Karte auf dem Dashboard verwendet.
     * Online-User haben lastSeenAt=null; Offline-User haben einen ISO-8601-Timestamp.
     */
    public List<Map<String, Object>> getAllUsersPresence() {
        // Aktuell verbundene userIds für schnellen Lookup
        var onlineUserIds = sessions.values().stream()
                .map(UserPresence::userId)
                .collect(java.util.stream.Collectors.toSet());

        return knownUsers.values().stream()
                .distinct()
                .map(p -> {
                    boolean online = onlineUserIds.contains(p.userId());
                    Instant seen = lastSeenAt.get(p.userId());
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("userId", p.userId());
                    m.put("username", p.username());
                    m.put("online", online);
                    m.put("lastSeenAt", seen != null ? seen.toString() : null);
                    return m;
                })
                .toList();
    }

    /** Liste der User die einen bestimmten Kunden gerade ansehen. */
    public List<Map<String, String>> getCustomerViewers(String customerId) {
        var viewerSessions = customerViewers.getOrDefault(customerId, Set.of());
        return viewerSessions.stream()
                .map(sessions::get)
                .filter(Objects::nonNull)
                .distinct()
                .map(p -> Map.of("userId", p.userId(), "username", p.username()))
                .toList();
    }

    /** Broadcastet die vollständige Mitgliederliste (mit Online-Status und lastSeenAt) an alle Clients. */
    private void broadcastOnlineUsers() {
        messagingTemplate.convertAndSend("/topic/presence/online", getAllUsersPresence());
    }

    /** Broadcastet die aktuelle Viewer-Liste für einen bestimmten Kunden. */
    private void broadcastCustomerPresence(String customerId) {
        messagingTemplate.convertAndSend(
                "/topic/presence/customers/" + customerId,
                getCustomerViewers(customerId));
    }
}
