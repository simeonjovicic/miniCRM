package com.collabcrm.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class NtfyServiceTest {

    private MockRestServiceServer server;

    private NtfyService serviceWithTopic(String topic) {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        return new NtfyService(builder, "http://ntfy.test", topic);
    }

    @Test
    void dieNachrichtGehtAufDasThema() {
        NtfyService service = serviceWithTopic("mein-thema");
        server.expect(requestTo("http://ntfy.test/mein-thema"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string("Besprechung\nDo, 14.08.2026"))
                .andRespond(withSuccess());

        assertThat(service.send("Termin morgen", "Besprechung\nDo, 14.08.2026")).isTrue();
        server.verify();
    }

    /**
     * text/plain ohne Charset verschickt Spring als ISO-8859-1 — dann kommt aus
     * "Büro" in der App "B?ro". Der Charset muss am Content-Type stehen.
     */
    @Test
    void derTextGehtAlsUtf8Raus() {
        NtfyService service = serviceWithTopic("mein-thema");
        server.expect(requestTo("http://ntfy.test/mein-thema"))
                .andExpect(header("Content-Type", "text/plain;charset=UTF-8"))
                .andExpect(content().string("Büro Wien — Angebot durchgehen"))
                .andRespond(withSuccess());

        service.send("Termin", "Büro Wien — Angebot durchgehen");
        server.verify();
    }

    /** HTTP-Header vertragen nur ASCII, Umlaute muessen kodiert werden. */
    @Test
    void derTitelWirdBeiUmlautenKodiert() {
        String encoded = NtfyService.encodeHeader("Termin: Büro");

        assertThat(encoded).startsWith("=?UTF-8?B?").endsWith("?=");
        String base64 = encoded.substring("=?UTF-8?B?".length(), encoded.length() - 2);
        assertThat(new String(Base64.getDecoder().decode(base64), StandardCharsets.UTF_8))
                .isEqualTo("Termin: Büro");
    }

    @Test
    void reinesAsciiBleibtUnveraendert() {
        assertThat(NtfyService.encodeHeader("Termin morgen")).isEqualTo("Termin morgen");
    }

    @Test
    void ohneThemaWirdNichtsVerschickt() {
        NtfyService service = serviceWithTopic("  ");

        assertThat(service.isEnabled()).isFalse();
        assertThat(service.send("Titel", "Text")).isFalse();
        server.verify(); // keine Anfrage erwartet
    }

    /** Ein Ausfall von ntfy darf den Zeitplan nicht abbrechen. */
    @Test
    void einFehlerBeimVersandWirdGemeldetAberNichtGeworfen() {
        NtfyService service = serviceWithTopic("mein-thema");
        server.expect(requestTo("http://ntfy.test/mein-thema")).andRespond(withServerError());

        assertThat(service.send("Titel", "Text")).isFalse();
    }

    // ── Persoenliche Themen ───────────────────────────────────────────

    /** Fuer die persoenlichen Uebersichten: jeder auf sein eigenes Thema. */
    @Test
    void anEinBestimmtesThemaGehtEsDorthinUndNichtAufsGemeinsame() {
        NtfyService service = serviceWithTopic("gemeinsames-thema");
        server.expect(requestTo("http://ntfy.test/simeon-privat"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string("1 Todo für dich"))
                .andRespond(withSuccess());

        assertThat(service.sendTo("simeon-privat", "Heute", "1 Todo für dich")).isTrue();
        server.verify();
    }

    @Test
    void auchAnEinBestimmtesThemaGehtDerTextAlsUtf8Raus() {
        NtfyService service = serviceWithTopic("gemeinsames-thema");
        server.expect(requestTo("http://ntfy.test/simeon-privat"))
                .andExpect(header("Content-Type", "text/plain;charset=UTF-8"))
                .andExpect(content().string("Büro Wien — Angebot durchgehen"))
                .andRespond(withSuccess());

        service.sendTo("simeon-privat", "Heute", "Büro Wien — Angebot durchgehen");
        server.verify();
    }

    /**
     * Wer kein eigenes Thema hinterlegt hat, bekommt keine Uebersicht — es darf
     * dafuer aber auch nichts an den ntfy-Server hinausgehen.
     */
    @Test
    void ohneZielthemaWirdKeineAnfrageGestellt() {
        NtfyService service = serviceWithTopic("gemeinsames-thema");

        assertThat(service.sendTo(null, "Heute", "Text")).isFalse();
        assertThat(service.sendTo("", "Heute", "Text")).isFalse();
        assertThat(service.sendTo("   ", "Heute", "Text")).isFalse();
        server.verify(); // keine Anfrage erwartet
    }

    /** Ein persoenliches Thema geht auch dann, wenn gar kein gemeinsames gesetzt ist. */
    @Test
    void einPersoenlichesThemaFunktioniertOhneGemeinsames() {
        NtfyService service = serviceWithTopic("");
        server.expect(requestTo("http://ntfy.test/simeon-privat")).andRespond(withSuccess());

        assertThat(service.isEnabled()).isFalse();
        assertThat(service.sendTo("simeon-privat", "Heute", "Text")).isTrue();
        server.verify();
    }

    /** Ein Thema ist ein Passwort — es darf nicht im Klartext ins Log. */
    @Test
    void dasThemaWirdFuerDasLogGekuerzt() {
        assertThat(NtfyService.mask("simeon-privat-4711")).isEqualTo("simeon-p***");
        assertThat(NtfyService.mask("kurz")).isEqualTo("***");
        assertThat(NtfyService.mask(null)).isEqualTo("***");
    }
}
