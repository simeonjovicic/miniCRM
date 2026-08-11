package com.collabcrm.service;

import com.collabcrm.model.Customer;
import com.collabcrm.model.FinanceEntry;
import com.collabcrm.model.Todo;
import com.collabcrm.repository.CustomerRepository;
import com.collabcrm.repository.FinanceEntryRepository;
import com.collabcrm.repository.TodoRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

/**
 * KI-Service für E-Mail-Generierung mit Kundenkontext.
 *
 * Nutzt die Groq API (Llama 3.3 70B) im OpenAI-kompatiblen Format.
 * Wenn ein User z.B. "Followup für Jenny Cai" schreibt, passiert:
 *   1. buildContext() findet den Kunden "Jenny Cai" in der DB
 *   2. Lädt verknüpfte Todos und Finanzeinträge
 *   3. buildSystemPrompt() erstellt einen System-Prompt mit CRM-Kontext + Ton-Anweisung
 *   4. Die Groq API generiert eine kontextbezogene E-Mail
 */
@Service
public class AiService {

    private final CustomerRepository customerRepository;
    private final TodoRepository todoRepository;
    private final FinanceEntryRepository financeEntryRepository;
    private final RestTemplate restTemplate = new RestTemplate();

    /** Groq API Key — aus application.yml geladen */
    @Value("${groq.api-key:}")
    private String apiKey;

    public AiService(CustomerRepository customerRepository,
                     TodoRepository todoRepository,
                     FinanceEntryRepository financeEntryRepository) {
        this.customerRepository = customerRepository;
        this.todoRepository = todoRepository;
        this.financeEntryRepository = financeEntryRepository;
    }

    /**
     * Generiert eine E-Mail basierend auf User-Nachricht, Ton und Konversationsverlauf.
     *
     * @param userMessage Die Anfrage des Users (z.B. "Schreib ein Followup für Jenny Cai")
     * @param tone        Ton der E-Mail: formal, freundlich, locker, kurz
     * @param history     Bisheriger Konversationsverlauf (Multi-Turn Chat)
     * @return Generierter E-Mail-Text oder Fehlermeldung
     */
    public String generateEmail(String userMessage, String tone,
                                List<Map<String, String>> history) {
        // CRM-Kontext aus der Datenbank laden (erwähnte Kunden + verknüpfte Daten)
        String context = buildContext(userMessage);
        // System-Prompt zusammenbauen mit Ton-Anweisung, Vorlagen und CRM-Kontext
        String systemPrompt = buildSystemPrompt(context, tone);

        // OpenAI-kompatibles Message-Format für Groq aufbauen
        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt));

        // Bisherigen Konversationsverlauf hinzufügen (Multi-Turn)
        for (Map<String, String> msg : history) {
            messages.add(Map.of(
                    "role", "user".equals(msg.get("role")) ? "user" : "assistant",
                    "content", msg.get("content")
            ));
        }

        // Aktuelle User-Nachricht hinzufügen
        messages.add(Map.of("role", "user", "content", userMessage));

        // Request-Body für Groq API (OpenAI-kompatibles Format)
        Map<String, Object> body = new HashMap<>();
        body.put("model", "llama-3.3-70b-versatile");
        body.put("messages", messages);
        body.put("temperature", 0.7); // Leichte Kreativität, aber nicht zu wild

        // HTTP-Request mit Bearer-Token-Authentifizierung
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            @SuppressWarnings("unchecked")
            ResponseEntity<Map> responseEntity = restTemplate.exchange(
                    "https://api.groq.com/openai/v1/chat/completions",
                    HttpMethod.POST,
                    request,
                    Map.class
            );
            return extractText(responseEntity.getBody());
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode().value() == 429) {
                return "Rate-Limit erreicht. Bitte warte einen Moment und versuche es erneut.";
            }
            return "Fehler von Groq API: " + e.getStatusCode() + " — " + e.getResponseBodyAsString();
        } catch (Exception e) {
            return "Fehler bei der Verbindung zur KI: " + e.getMessage();
        }
    }

    /**
     * Baut den CRM-Kontext für den KI-Prompt.
     * Sucht nach Kundennamen in der User-Nachricht und lädt deren vollständige Daten:
     *   - Kundendetails (Name, Firma, Email, Status)
     *   - Verknüpfte Todos (Titel, Status, Fälligkeitsdatum)
     *   - Verknüpfte Finanzeinträge (Betrag, Typ, Beschreibung)
     */
    private String buildContext(String userMessage) {
        StringBuilder sb = new StringBuilder();

        List<Customer> allCustomers = customerRepository.findAll();
        // Finde Kunden deren Name in der Nachricht vorkommt (case-insensitive)
        List<Customer> mentioned = allCustomers.stream()
                .filter(c -> userMessage.toLowerCase().contains(c.getName().toLowerCase()))
                .collect(Collectors.toList());

        // Detaillierte Infos für erwähnte Kunden
        if (!mentioned.isEmpty()) {
            sb.append("=== ERWÄHNTE KUNDEN ===\n");
            for (Customer c : mentioned) {
                sb.append("- Name: ").append(c.getName());
                if (c.getCompany() != null) sb.append(", Firma: ").append(c.getCompany());
                if (c.getEmail() != null) sb.append(", Email: ").append(c.getEmail());
                if (c.getPhone() != null) sb.append(", Telefon: ").append(c.getPhone());
                sb.append(", Status: ").append(c.getStatus());
                sb.append(", Erstellt am: ").append(c.getCreatedAt());
                sb.append("\n");

                // Verknüpfte Todos finden (Kundenname im Todo-Titel)
                List<Todo> relatedTodos = todoRepository.findAllByOrderByDoneAscCreatedAtDesc()
                        .stream()
                        .filter(t -> t.getTitle().toLowerCase().contains(c.getName().toLowerCase()))
                        .toList();
                if (!relatedTodos.isEmpty()) {
                    sb.append("  Verknüpfte Todos:\n");
                    for (Todo t : relatedTodos) {
                        sb.append("    - ").append(t.getTitle());
                        sb.append(t.isDone() ? " [ERLEDIGT]" : " [OFFEN]");
                        if (t.getDueDate() != null) sb.append(" Fällig: ").append(t.getDueDate());
                        if (t.getNotes() != null) sb.append(" Notizen: ").append(t.getNotes());
                        sb.append("\n");
                    }
                }

                // Verknüpfte Finanzeinträge finden (Kundenname in Beschreibung)
                List<FinanceEntry> entries = financeEntryRepository.findAllByOrderByDateDescCreatedAtDesc()
                        .stream()
                        .filter(f -> f.getDescription().toLowerCase().contains(c.getName().toLowerCase()))
                        .toList();
                if (!entries.isEmpty()) {
                    sb.append("  Finanzen:\n");
                    for (FinanceEntry f : entries) {
                        sb.append("    - ").append(f.getType()).append(": ")
                                .append(f.getAmount()).append("€ - ")
                                .append(f.getDescription())
                                .append(" (").append(f.getDate()).append(")\n");
                    }
                }
            }
        }

        // Übersicht aller Kunden (für allgemeinen Kontext)
        sb.append("\n=== ALLE KUNDEN (").append(allCustomers.size()).append(") ===\n");
        for (Customer c : allCustomers) {
            sb.append("- ").append(c.getName());
            if (c.getCompany() != null) sb.append(" (").append(c.getCompany()).append(")");
            sb.append(" [").append(c.getStatus()).append("]\n");
        }

        return sb.toString();
    }

    /**
     * Baut den System-Prompt mit:
     *   - Ton-Anweisung (formal/freundlich/locker/kurz)
     *   - 6 E-Mail-Vorlagen als Inspiration
     *   - CRM-Kontext (Kundendaten, Todos, Finanzen)
     */
    private String buildSystemPrompt(String context, String tone) {
        String toneInstruction = switch (tone) {
            case "formal" -> "Schreibe in einem sehr formellen, geschäftlichen Ton. Verwende Höflichkeitsformen und professionelle Sprache.";
            case "freundlich" -> "Schreibe in einem freundlichen, warmen aber professionellen Ton. Sei nahbar aber respektvoll.";
            case "locker" -> "Schreibe in einem lockeren, entspannten Ton. Duze den Empfänger. Sei persönlich und direkt.";
            case "kurz" -> "Schreibe so kurz und prägnant wie möglich. Keine langen Einleitungen, direkt zum Punkt.";
            default -> "Schreibe in einem professionellen, freundlichen Ton.";
        };

        return """
                Du bist ein E-Mail-Assistent für ein CRM-System namens MiniCRM.
                Deine Aufgabe ist es, professionelle E-Mails auf Deutsch zu verfassen.

                %s

                Hier sind die verfügbaren E-Mail-Vorlagen die du als Inspiration nutzen kannst:

                1. Erstgespräch: "Schön, Sie kennenzulernen!" — Danke für Gespräch, Zusammenfassung der Leistungen, Folgetermin vorschlagen
                2. Angebot nachfassen: "Unser Angebot — noch Fragen?" — Nachfrage ob Angebot erhalten, offene Fragen klären
                3. Willkommen als Kunde: "Willkommen bei uns!" — Begrüßung, persönlicher Ansprechpartner
                4. Feedback anfragen: "Wie zufrieden sind Sie?" — Zufriedenheit erfragen, Verbesserungsvorschläge
                5. Terminbestätigung: Termin bestätigen mit Datum und Uhrzeit
                6. Rechnung überfällig: Zahlungserinnerung mit Rechnungsnummer und Betrag

                Hier ist der aktuelle CRM-Kontext:

                %s

                Regeln:
                - Antworte IMMER auf Deutsch
                - Verwende die Kundeninformationen aus dem Kontext wenn relevant
                - Wenn nach einem bestimmten Kunden gefragt wird, nutze dessen echte Daten
                - Generiere nur den E-Mail-Text (mit Betreff wenn passend)
                - Platzhalter wie Datum, Uhrzeit etc. mit [DATUM], [UHRZEIT] etc. markieren wenn nicht bekannt
                - Formatiere die E-Mail übersichtlich
                """.formatted(toneInstruction, context);
    }

    /**
     * Extrahiert den Antworttext aus der OpenAI-kompatiblen Groq-Response.
     * Response-Format: {choices: [{message: {content: "..."}}]}
     */
    @SuppressWarnings("unchecked")
    private String extractText(Map<String, Object> response) {
        if (response == null) return "Fehler: Keine Antwort von der KI erhalten.";
        try {
            List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
            Map<String, Object> message = (Map<String, Object>) choices.getFirst().get("message");
            return (String) message.get("content");
        } catch (Exception e) {
            return "Fehler beim Verarbeiten der KI-Antwort: " + e.getMessage();
        }
    }
}
