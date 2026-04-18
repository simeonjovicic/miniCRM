package com.collabcrm.controller;

import com.collabcrm.service.CustomerService;
import com.collabcrm.service.PresenceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-Controller für das Dashboard.
 * Liefert aggregierte Statistiken und den aktuellen Status auf einen Blick.
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final CustomerService customerService;
    private final PresenceService presenceService;

    public DashboardController(CustomerService customerService, PresenceService presenceService) {
        this.customerService = customerService;
        this.presenceService = presenceService;
    }

    /**
     * Dashboard-Statistiken: Kundenzahlen nach Status, letzte 5 Kunden und Online-User.
     * Alles live berechnet — kein Caching, damit die Zahlen immer aktuell sind.
     */
    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        var customers = customerService.findAll();

        // Kunden nach Status zählen (Sales-Pipeline)
        long totalCustomers = customers.size();
        long leads = customers.stream().filter(c -> "LEAD".equals(c.getStatus())).count();
        long prospects = customers.stream().filter(c -> "PROSPECT".equals(c.getStatus())).count();
        long activeCustomers = customers.stream().filter(c -> "CUSTOMER".equals(c.getStatus())).count();
        long churned = customers.stream().filter(c -> "CHURNED".equals(c.getStatus())).count();

        // Zuletzt erstellte Kunden (Top 5, sortiert nach Erstellungsdatum absteigend)
        var recent = customers.stream()
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .limit(5)
                .map(c -> Map.of(
                        "id", (Object) c.getId().toString(),
                        "name", c.getName(),
                        "status", c.getStatus(),
                        "createdAt", c.getCreatedAt().toString()
                ))
                .toList();

        return Map.of(
                "totalCustomers", totalCustomers,
                "leads", leads,
                "prospects", prospects,
                "activeCustomers", activeCustomers,
                "churned", churned,
                "recentCustomers", recent,
                "onlineUsers", presenceService.getAllUsersPresence()
        );
    }
}
