package com.collabcrm.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class LeadFinderAiService {

    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${groq.api-key:}")
    private String apiKey;

    public LeadFinderAiService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public List<String> expandKeyword(String keyword) {
        if (apiKey == null || apiKey.isBlank()) {
            return List.of(keyword);
        }

        List<Map<String, String>> messages = List.of(
                Map.of(
                        "role", "system",
                        "content", """
                                Du erweiterst kurze Business-Suchbegriffe fuer eine lokale B2B-Lead-Suche.
                                Antworte ausschliesslich mit einem JSON-Array aus Strings.
                                Keine Erklaerung, kein Markdown, keine Objektstruktur.
                                Begriffe muessen konkrete Google-Places-Suchbegriffe sein.
                                Keine Staedte, keine Marken, keine Domains, keine langen Saetze.
                                Nur kommerzielle Business- oder Dienstleistungs-Kategorien.
                                Keine oeffentlichen Orte, Parks, Sehenswuerdigkeiten, Hotels, Apartments oder zu breite Freizeitbegriffe.
                                Nutze Deutsch und gaengige englische Begriffe, wenn sie in Oesterreich ueblich sind.
                                """
                ),
                Map.of(
                        "role", "user",
                        "content", """
                                Keyword: "%s"

                                Gib 8 bis 14 verwandte Business-Kategorie-Begriffe zurueck.
                                Das Original-Keyword muss enthalten sein.
                                Beispiel fuer "spa": ["spa","massage","wellness center","day spa","sauna","hammam"].
                                """.formatted(keyword)
                )
        );

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", "llama-3.3-70b-versatile");
        body.put("messages", messages);
        body.put("temperature", 0.2);
        body.put("max_tokens", 300);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        try {
            @SuppressWarnings("unchecked")
            ResponseEntity<Map> response = restTemplate.exchange(
                    "https://api.groq.com/openai/v1/chat/completions",
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    Map.class
            );
            return parseTerms(extractContent(response.getBody()), keyword);
        } catch (Exception ignored) {
            return List.of(keyword);
        }
    }

    @SuppressWarnings("unchecked")
    private String extractContent(Map<String, Object> response) {
        List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
        Map<String, Object> message = (Map<String, Object>) choices.getFirst().get("message");
        return String.valueOf(message.get("content"));
    }

    private List<String> parseTerms(String content, String keyword) throws Exception {
        int start = content.indexOf('[');
        int end = content.lastIndexOf(']');
        if (start < 0 || end <= start) {
            return List.of(keyword);
        }

        String json = content.substring(start, end + 1);
        List<String> parsed = objectMapper.readValue(json, new TypeReference<List<String>>() {});
        return sanitize(keyword, parsed);
    }

    private List<String> sanitize(String keyword, List<String> terms) {
        Map<String, String> unique = new LinkedHashMap<>();
        putTerm(unique, keyword);
        for (String term : terms) {
            putTerm(unique, term);
            if (unique.size() >= 14) break;
        }
        return new ArrayList<>(unique.values());
    }

    private void putTerm(Map<String, String> unique, String raw) {
        if (raw == null) return;
        String term = raw.trim().replaceAll("^\"|\"$", "");
        if (term.isBlank()) return;
        String key = term.toLowerCase(Locale.ROOT);
        unique.putIfAbsent(key, term);
    }
}
