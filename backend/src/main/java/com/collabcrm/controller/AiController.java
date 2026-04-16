package com.collabcrm.controller;

import com.collabcrm.service.AiService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST-Controller für den KI-E-Mail-Assistenten.
 * Nimmt Anfragen vom Vorlagen-Chatbot im Frontend entgegen und leitet sie an den AiService weiter.
 */
@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiService aiService;

    public AiController(AiService aiService) {
        this.aiService = aiService;
    }

    /**
     * Generiert eine E-Mail mit KI basierend auf User-Nachricht, Ton und Konversationsverlauf.
     * Das Frontend schickt auch den bisherigen Chat-Verlauf mit, damit Multi-Turn-Konversationen
     * funktionieren (z.B. "Mach es kürzer" als Folgefrage).
     */
    @PostMapping("/generate-email")
    public Map<String, String> generateEmail(@RequestBody EmailRequest request) {
        String result = aiService.generateEmail(
                request.message(),
                request.tone(),
                request.history() != null ? request.history() : List.of()
        );
        return Map.of("content", result);
    }

    /** Request-Body als Java Record — kompakt und unveränderlich */
    public record EmailRequest(
            String message,                        // User-Nachricht (z.B. "Followup für Jenny Cai")
            String tone,                           // Ton: formal, freundlich, locker, kurz
            List<Map<String, String>> history       // Bisheriger Chat-Verlauf [{role, content}, ...]
    ) {}
}
