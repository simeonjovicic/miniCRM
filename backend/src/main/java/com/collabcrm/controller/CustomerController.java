package com.collabcrm.controller;

import com.collabcrm.model.Customer;
import com.collabcrm.service.CrdtSyncService;
import com.collabcrm.service.CustomerService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST-Controller für Kundenverwaltung.
 *
 * Stellt CRUD-Endpunkte bereit und broadcastet Änderungen per WebSocket,
 * damit alle verbundenen Clients sofort Updates bekommen (Live-Sync).
 *
 * Die Feld-Änderungen (Name, Email etc.) laufen über CRDTs, nicht über PUT.
 * PUT wird nur für initiale Erstellung und direkte REST-Updates genutzt.
 */
@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    private final CustomerService customerService;
    private final CrdtSyncService crdtSyncService;
    private final SimpMessagingTemplate messagingTemplate;

    public CustomerController(CustomerService customerService,
                              CrdtSyncService crdtSyncService,
                              SimpMessagingTemplate messagingTemplate) {
        this.customerService = customerService;
        this.crdtSyncService = crdtSyncService;
        this.messagingTemplate = messagingTemplate;
    }

    /** Alle Kunden abrufen (für Kundenliste) */
    @GetMapping
    public List<Customer> getAll() {
        return customerService.findAll();
    }

    /** Einzelnen Kunden per ID abrufen */
    @GetMapping("/{id}")
    public Customer getById(@PathVariable UUID id) {
        return customerService.findById(id);
    }

    /**
     * Neuen Kunden erstellen.
     * Nach dem Erstellen wird ein CUSTOMER_CREATED Event per WebSocket gebroadcastet,
     * damit die Kundenliste bei allen anderen Clients automatisch aktualisiert wird.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Customer create(@Valid @RequestBody Customer customer) {
        Customer created = customerService.create(customer);
        if (created.getId() != null) {
            messagingTemplate.convertAndSend("/topic/customers",
                    Map.of("type", "CUSTOMER_CREATED",
                            "entityId", created.getId().toString(),
                            "customerName", created.getName()));
        }
        return created;
    }

    /** Kunden aktualisieren (direkt, ohne CRDT — wird vom CrdtSyncService für JPA-Sync genutzt) */
    @PutMapping("/{id}")
    public Customer update(@PathVariable UUID id, @RequestBody Customer customer) {
        return customerService.update(id, customer);
    }

    /**
     * Kunden löschen.
     * Broadcastet CUSTOMER_DELETED an die allgemeine Liste UND an den kundenspezifischen Topic,
     * damit User die gerade diesen Kunden offen haben automatisch weitergeleitet werden.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        customerService.delete(id);
        var deleteMsg = Map.of("type", "CUSTOMER_DELETED", "entityId", id.toString());
        messagingTemplate.convertAndSend("/topic/customers", deleteMsg);
        messagingTemplate.convertAndSend("/topic/customers/" + id, deleteMsg);
    }

    /**
     * CRDT-State eines Kunden abrufen.
     * Wird beim Öffnen der Kunden-Detailseite aufgerufen um den initialen Zustand zu laden.
     * Gibt alle Felder als Key-Value-Map zurück: {name: "...", email: "...", todos: {...}, ...}
     */
    @GetMapping("/{id}/crdt")
    public Map<String, Object> getCrdtState(@PathVariable UUID id) {
        return crdtSyncService.getFullCrdtState("CUSTOMER", id.toString());
    }
}
