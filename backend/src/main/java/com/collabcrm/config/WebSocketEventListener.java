package com.collabcrm.config;

import com.collabcrm.service.PresenceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * Listener für WebSocket-Verbindungsevents.
 *
 * Spring feuert automatisch Events wenn ein STOMP-Client sich verbindet oder trennt.
 * Dieser Listener leitet sie an den PresenceService weiter für das Online-User-Tracking.
 *
 * Der Client sendet userId und username als STOMP-Connect-Headers mit,
 * damit der Server weiß welcher User sich verbunden hat.
 */
@Component
public class WebSocketEventListener {

    private static final Logger log = LoggerFactory.getLogger(WebSocketEventListener.class);

    private final PresenceService presenceService;

    public WebSocketEventListener(PresenceService presenceService) {
        this.presenceService = presenceService;
    }

    /**
     * Neue WebSocket-Verbindung: User-Info aus den STOMP-Headers extrahieren
     * und im PresenceService registrieren.
     */
    @EventListener
    public void handleConnect(SessionConnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        // userId und username werden vom Frontend als Custom-STOMP-Headers mitgeschickt
        var nativeHeaders = accessor.toNativeHeaderMap();
        String userId = getFirst(nativeHeaders, "userId");
        String username = getFirst(nativeHeaders, "username");

        if (userId != null && username != null) {
            log.debug("WebSocket connected: session={}, user={}", sessionId, username);
            presenceService.userConnected(sessionId, userId, username);
        }
    }

    /** WebSocket-Verbindung getrennt: Session aus dem PresenceService entfernen. */
    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        log.debug("WebSocket disconnected: session={}", sessionId);
        presenceService.userDisconnected(sessionId);
    }

    /** Hilfsmethode: Ersten Wert aus einer Multi-Value Header-Map extrahieren. */
    private String getFirst(java.util.Map<String, java.util.List<String>> headers, String key) {
        var values = headers.get(key);
        return (values != null && !values.isEmpty()) ? values.getFirst() : null;
    }
}
