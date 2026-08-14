package com.collabcrm.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Verschickt Push-Nachrichten über ntfy.
 *
 * ntfy braucht kein Konto: der Server nimmt einen POST auf {@code /<thema>}
 * entgegen, die App abonniert dasselbe Thema. Der Themenname ist damit
 * gleichzeitig das Passwort — er sollte lang und zufällig sein.
 *
 * Ohne konfiguriertes Thema ist der Versand stillgelegt, damit die Anwendung
 * auch ohne Push-Einrichtung normal läuft.
 */
@Service
public class NtfyService {

    private static final Logger log = LoggerFactory.getLogger(NtfyService.class);

    /**
     * text/plain OHNE Charset schickt Spring als ISO-8859-1 — Umlaute kämen
     * dann zerschossen in der App an. Der Charset muss also explizit dranstehen.
     */
    private static final MediaType TEXT_UTF8 = new MediaType("text", "plain", StandardCharsets.UTF_8);

    private final RestClient client;
    private final String topic;
    private boolean warnedAboutMissingTopic;

    public NtfyService(
            RestClient.Builder builder,
            @Value("${ntfy.base-url}") String baseUrl,
            @Value("${ntfy.topic}") String topic) {
        this.client = builder.baseUrl(baseUrl).build();
        this.topic = topic == null ? "" : topic.trim();
    }

    /**
     * Beim Start einmal festhalten, ob Push aktiv ist — sonst merkt man auf dem
     * Pi erst dann etwas, wenn die erste Erinnerung ausbleibt.
     * Das Thema wird dabei gekürzt, es ist schließlich das Passwort.
     */
    @PostConstruct
    void logConfiguration() {
        if (isEnabled()) {
            log.info("Push-Erinnerungen aktiv (ntfy-Thema {})", maskedTopic());
        } else {
            log.info("Push-Erinnerungen inaktiv — ntfy.topic ist nicht gesetzt");
        }
    }

    public boolean isEnabled() {
        return !topic.isEmpty();
    }

    private String maskedTopic() {
        return mask(topic);
    }

    /** Für Protokollausgaben — ein Thema ist ein Passwort und gehört nicht ins Log. */
    static String mask(String value) {
        if (value == null) return "***";
        return value.length() <= 8 ? "***" : value.substring(0, 8) + "***";
    }

    /**
     * Schickt eine Nachricht. Fehler werden protokolliert, aber nicht
     * weitergereicht — eine nicht zustellbare Erinnerung darf den Zeitplan
     * nicht abbrechen.
     *
     * @return true, wenn die Nachricht abgesetzt werden konnte
     */
    public boolean send(String title, String message) {
        if (!isEnabled()) {
            if (!warnedAboutMissingTopic) {
                log.info("ntfy ist nicht konfiguriert (ntfy.topic leer) — Erinnerungen werden nicht verschickt");
                warnedAboutMissingTopic = true;
            }
            return false;
        }
        return sendTo(topic, title, message);
    }

    /**
     * Schickt an ein bestimmtes Thema — für die persönlichen Übersichten, bei
     * denen jeder sein eigenes hinterlegt hat.
     *
     * Ein leeres Thema ist kein Fehler, sondern die Ansage "will ich nicht":
     * es wird dann gar nicht erst versucht.
     *
     * @return true, wenn die Nachricht abgesetzt werden konnte
     */
    public boolean sendTo(String targetTopic, String title, String message) {
        String target = targetTopic == null ? "" : targetTopic.trim();
        if (target.isEmpty()) return false;

        try {
            client.post()
                    .uri("/{topic}", target)
                    .contentType(TEXT_UTF8)
                    // Umlaute im Header muessen RFC-2047-kodiert werden, sonst
                    // verstuemmelt ntfy den Titel.
                    .header("Title", encodeHeader(title))
                    .header("Tags", "alarm_clock")
                    .body(message)
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (Exception e) {
            // Das Thema gehoert maskiert ins Log, sonst steht das Passwort des
            // Kanals in der Datei — es hilft aber zu wissen, welches klemmt.
            log.warn("ntfy-Nachricht an {} konnte nicht zugestellt werden: {}",
                    mask(target), e.getMessage());
            return false;
        }
    }

    /** HTTP-Header duerfen nur ASCII enthalten — alles andere wird base64-kodiert. */
    static String encodeHeader(String value) {
        if (value == null) return "";
        if (value.chars().allMatch(c -> c >= 32 && c < 127)) return value;
        return "=?UTF-8?B?" + Base64.getEncoder()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8)) + "?=";
    }
}
