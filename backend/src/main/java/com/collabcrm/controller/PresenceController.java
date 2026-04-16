package com.collabcrm.controller;

import com.collabcrm.service.PresenceService;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

/**
 * WebSocket-Controller für Presence-Tracking.
 *
 * Clients senden Nachrichten wenn sie eine Kunden-Detailseite öffnen oder verlassen.
 * Die Session-ID wird automatisch von Spring aus dem STOMP-Header extrahiert.
 */
@Controller
public class PresenceController {

    private final PresenceService presenceService;

    public PresenceController(PresenceService presenceService) {
        this.presenceService = presenceService;
    }

    /**
     * Client meldet: "Ich schaue gerade Kunde {customerId} an"
     * Wird aufgerufen wenn ein User die Kunden-Detailseite öffnet.
     */
    @MessageMapping("/presence/viewing/{customerId}")
    public void viewingCustomer(
            @DestinationVariable String customerId,
            @Header("simpSessionId") String sessionId) {
        presenceService.userViewingCustomer(sessionId, customerId);
    }

    /**
     * Client meldet: "Ich verlasse die Seite von Kunde {customerId}"
     * Wird aufgerufen wenn ein User die Kunden-Detailseite schließt/navigiert.
     */
    @MessageMapping("/presence/leaving/{customerId}")
    public void leavingCustomer(
            @DestinationVariable String customerId,
            @Header("simpSessionId") String sessionId) {
        presenceService.userLeftCustomer(sessionId, customerId);
    }
}
