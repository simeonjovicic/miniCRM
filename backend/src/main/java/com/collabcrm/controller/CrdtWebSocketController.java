package com.collabcrm.controller;

import com.collabcrm.dto.CrdtOperationDto;
import com.collabcrm.service.CrdtSyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

/**
 * WebSocket-Controller für CRDT-Operationen.
 *
 * Empfängt alle CRDT-Operationen die Clients per STOMP an /app/crdt/operation senden
 * und delegiert sie an den CrdtSyncService für Merge, Persistierung und Broadcast.
 *
 * Bewusst minimal gehalten: Keine Business-Logik hier — alles im Service.
 */
@Controller
public class CrdtWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(CrdtWebSocketController.class);

    private final CrdtSyncService crdtSyncService;

    public CrdtWebSocketController(CrdtSyncService crdtSyncService) {
        this.crdtSyncService = crdtSyncService;
    }

    /**
     * Empfängt CRDT-Operationen von Clients.
     * Clients senden an: /app/crdt/operation (Spring fügt den /app Prefix automatisch hinzu)
     * Jackson deserialisiert automatisch den richtigen Subtyp basierend auf dem "type"-Feld.
     */
    @MessageMapping("/crdt/operation")
    public void handleOperation(CrdtOperationDto operation) {
        log.debug("Received CRDT operation: type={}, entity={}/{}",
                operation.getClass().getSimpleName(),
                operation.getEntityType(),
                operation.getEntityId());
        crdtSyncService.applyOperation(operation);
    }
}
