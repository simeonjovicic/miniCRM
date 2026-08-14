package com.collabcrm.controller;

import com.collabcrm.model.User;
import com.collabcrm.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Das persönliche ntfy-Thema am laufenden Aufbau.
 *
 * Der Themenname ist gleichzeitig das Passwort des Push-Kanals — die Prüfungen
 * hier drehen sich deshalb vor allem darum, dass er nur an den Besitzer geht
 * und nicht versehentlich woanders mit herausrutscht.
 */
@SpringBootTest
class NtfyTopicControllerTest {

    private static final String PASSWORT = "geheim-genug";
    private static final String THEMA = "simeon-privat-4711";

    @Autowired private WebApplicationContext context;
    @Autowired private UserRepository users;
    @Autowired private PasswordEncoder passwordEncoder;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        users.deleteAll();
    }

    private User givenUser(String username) {
        User u = new User();
        u.setUsername(username);
        u.setEmail(username + "@example.com");
        u.setRole("ADMIN");
        u.setPasswordHash(passwordEncoder.encode(PASSWORT));
        return users.save(u);
    }

    private MockHttpSession loggedIn(String username) throws Exception {
        return (MockHttpSession) mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"%s"}""".formatted(username, PASSWORT)))
                .andReturn().getRequest().getSession(false);
    }

    private static String topicBody(String topic) {
        return """
                {"topic":"%s"}""".formatted(topic);
    }

    // ── Hinterlegen und lesen ─────────────────────────────────────────

    @Test
    void manKannSeinEigenesThemaHinterlegenUndWiederLesen() throws Exception {
        givenUser("simeon");
        MockHttpSession session = loggedIn("simeon");

        mockMvc.perform(put("/api/auth/ntfy-topic").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(topicBody(THEMA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configured").value(true));

        mockMvc.perform(get("/api/auth/ntfy-topic").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.topic").value(THEMA));
    }

    /** Ohne hinterlegtes Thema ist die Antwort leer, nicht null oder ein Fehler. */
    @Test
    void ohneHinterlegtesThemaKommtEinLeeresZurueck() throws Exception {
        givenUser("simeon");

        mockMvc.perform(get("/api/auth/ntfy-topic").session(loggedIn("simeon")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.topic").value(""))
                .andExpect(jsonPath("$.configured").value(false));
    }

    /** Ein leerer Wert ist kein Fehler, sondern die Art es wieder abzubestellen. */
    @Test
    void mitEinemLeerenWertBestelltManEsWiederAb() throws Exception {
        User user = givenUser("simeon");
        user.setNtfyTopic(THEMA);
        users.save(user);
        MockHttpSession session = loggedIn("simeon");

        mockMvc.perform(put("/api/auth/ntfy-topic").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(topicBody("")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configured").value(false));

        assertThat(users.findByUsername("simeon").orElseThrow().hasNtfyTopic()).isFalse();
    }

    @Test
    void umgebendeLeerzeichenWerdenEntfernt() throws Exception {
        givenUser("simeon");
        MockHttpSession session = loggedIn("simeon");

        mockMvc.perform(put("/api/auth/ntfy-topic").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(topicBody("  " + THEMA + "  ")))
                .andExpect(status().isOk());

        assertThat(users.findByUsername("simeon").orElseThrow().getNtfyTopic()).isEqualTo(THEMA);
    }

    // ── Prüfungen ─────────────────────────────────────────────────────

    /** Zu kurz heisst durchprobierbar — und wer es kennt, liest mit. */
    @Test
    void einZuKurzesThemaWirdAbgelehnt() throws Exception {
        givenUser("simeon");

        mockMvc.perform(put("/api/auth/ntfy-topic").session(loggedIn("simeon"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(topicBody("kurz")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    /** ntfy nimmt nur diese Zeichen — ein Schraegstrich waere schon ein anderer Pfad. */
    @Test
    void unzulaessigeZeichenWerdenAbgelehnt() throws Exception {
        givenUser("simeon");
        MockHttpSession session = loggedIn("simeon");

        for (String ungueltig : new String[]{"mein thema xy", "mein/thema/xy", "thema?x=1234"}) {
            mockMvc.perform(put("/api/auth/ntfy-topic").session(session)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(topicBody(ungueltig)))
                    .andExpect(status().isBadRequest());
        }

        assertThat(users.findByUsername("simeon").orElseThrow().hasNtfyTopic()).isFalse();
    }

    // ── Es gehoert nur dem Besitzer ───────────────────────────────────

    @Test
    void ohneAnmeldungKommtManNichtAnDasThema() throws Exception {
        givenUser("simeon");

        mockMvc.perform(get("/api/auth/ntfy-topic")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/auth/ntfy-topic")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(topicBody(THEMA)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void jederSiehtNurSeinEigenes() throws Exception {
        User simeon = givenUser("simeon");
        simeon.setNtfyTopic(THEMA);
        users.save(simeon);
        givenUser("bob");

        mockMvc.perform(get("/api/auth/ntfy-topic").session(loggedIn("bob")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.topic").value(""));
    }

    @Test
    void bobUeberschreibtBeimSetzenNichtSimeonsThema() throws Exception {
        User simeon = givenUser("simeon");
        simeon.setNtfyTopic(THEMA);
        users.save(simeon);
        givenUser("bob");

        mockMvc.perform(put("/api/auth/ntfy-topic").session(loggedIn("bob"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(topicBody("bob-privat-0815")))
                .andExpect(status().isOk());

        assertThat(users.findByUsername("simeon").orElseThrow().getNtfyTopic()).isEqualTo(THEMA);
    }

    /**
     * Der Anmeldebildschirm ist ohne Anmeldung erreichbar — dort darf kein
     * fremdes Thema mit herausrutschen.
     */
    @Test
    void dasThemaTauchtNichtInDerOeffentlichenBenutzerlisteAuf() throws Exception {
        User simeon = givenUser("simeon");
        simeon.setNtfyTopic(THEMA);
        users.save(simeon);

        mockMvc.perform(get("/api/auth/users"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString(THEMA))));
    }

    /** /me sagt nur, ob eines eingerichtet ist — nicht welches. */
    @Test
    void meNenntNurObEinThemaEingerichtetIst() throws Exception {
        User simeon = givenUser("simeon");
        simeon.setNtfyTopic(THEMA);
        users.save(simeon);

        mockMvc.perform(get("/api/auth/me").session(loggedIn("simeon")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasNtfyTopic").value(true))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString(THEMA))));
    }

    // ── Probenachricht ────────────────────────────────────────────────

    /** Ohne Thema gibt es nichts zu testen — und es soll nichts hinausgehen. */
    @Test
    void ohneThemaGibtEsKeineProbenachricht() throws Exception {
        givenUser("simeon");

        mockMvc.perform(post("/api/auth/ntfy-test").session(loggedIn("simeon")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }
}
