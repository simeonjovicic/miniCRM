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
 * Prüft die Absicherung am laufenden Aufbau — mit echtem Filter, echter
 * Datenbank und echter Session. Ein Test mit abgeschalteten Filtern würde
 * genau das nicht prüfen, worum es hier geht.
 */
@SpringBootTest
class AuthSecurityTest {

    private static final String PASSWORT = "geheim-genug";

    @Autowired private WebApplicationContext context;
    @Autowired private UserRepository users;
    @Autowired private PasswordEncoder passwordEncoder;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        users.deleteAll();
    }

    private User givenUser(String username, boolean withPassword) {
        User u = new User();
        u.setUsername(username);
        u.setEmail(username + "@example.com");
        u.setRole("ADMIN");
        if (withPassword) u.setPasswordHash(passwordEncoder.encode(PASSWORT));
        return users.save(u);
    }

    private String loginBody(String username, String password) {
        return """
                {"username":"%s","password":"%s"}""".formatted(username, password);
    }

    // ── Absicherung ───────────────────────────────────────────────────

    @Test
    void ohneAnmeldungKommtManNirgendwoHin() throws Exception {
        mockMvc.perform(get("/api/customers")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/finance")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/todos")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/dashboard/stats")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/users")).andExpect(status().isUnauthorized());
    }

    /** Sonst koennte sich jeder selbst einen Zugang anlegen. */
    @Test
    void auchDasAnlegenVonBenutzernIstGeschuetzt() throws Exception {
        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"eindringling","email":"x@example.com","role":"ADMIN"}"""))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void derAnmeldebildschirmBleibtErreichbar() throws Exception {
        givenUser("alice", true);

        mockMvc.perform(get("/api/auth/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].username").value("alice"))
                .andExpect(jsonPath("$[0].hasPassword").value(true));
    }

    /** Der Hash darf unter keinen Umstaenden nach aussen gehen. */
    @Test
    void dasPasswortTauchtInKeinerAntwortAuf() throws Exception {
        givenUser("alice", true);

        String antwort = mockMvc.perform(get("/api/auth/users"))
                .andReturn().getResponse().getContentAsString();

        assertThat(antwort).doesNotContain("passwordHash").doesNotContain("$2a$");
    }

    // ── Anmelden ──────────────────────────────────────────────────────

    @Test
    void mitRichtigemPasswortKommtManRein() throws Exception {
        givenUser("alice", true);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("alice", PASSWORT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void mitFalschemPasswortNicht() throws Exception {
        givenUser("alice", true);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("alice", "daneben")))
                .andExpect(status().isUnauthorized());
    }

    /** Die Meldung darf nicht verraten, ob es den Benutzer ueberhaupt gibt. */
    @Test
    void unbekannterBenutzerUndFalschesPasswortSehenGleichAus() throws Exception {
        givenUser("alice", true);

        String falschesPasswort = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("alice", "daneben")))
                .andReturn().getResponse().getContentAsString();
        String unbekannt = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("gibtsnicht", "daneben")))
                .andReturn().getResponse().getContentAsString();

        assertThat(falschesPasswort).isEqualTo(unbekannt);
    }

    // ── Sitzung ───────────────────────────────────────────────────────

    /**
     * Der Kern der Sache: nach dem Anmelden traegt die Session den Zustand, und
     * genau deshalb uebersteht die Anmeldung ein Neuladen der Seite.
     */
    @Test
    void nachDemAnmeldenTraegtDieSessionDenZugriff() throws Exception {
        givenUser("alice", true);

        MockHttpSession session = (MockHttpSession) mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("alice", PASSWORT)))
                .andReturn().getRequest().getSession(false);

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice"));

        mockMvc.perform(get("/api/todos").session(session))
                .andExpect(status().isOk());
    }

    @Test
    void nachDemAbmeldenIstWiederZu() throws Exception {
        givenUser("alice", true);

        MockHttpSession session = (MockHttpSession) mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("alice", PASSWORT)))
                .andReturn().getRequest().getSession(false);

        mockMvc.perform(post("/api/auth/logout").session(session)).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/todos").session(session)).andExpect(status().isUnauthorized());
    }

    // ── Erstes Passwort ───────────────────────────────────────────────

    @Test
    void werNochKeinPasswortHatKannEinsFestlegen() throws Exception {
        givenUser("bob", false);

        mockMvc.perform(post("/api/auth/set-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("bob", PASSWORT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("bob"));

        assertThat(users.findByUsername("bob").orElseThrow().hasPassword()).isTrue();
    }

    /** Sonst koennte jeder jedem das Passwort ueberschreiben. */
    @Test
    void einBestehendesPasswortLaesstSichSoNichtUeberschreiben() throws Exception {
        givenUser("alice", true);

        mockMvc.perform(post("/api/auth/set-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("alice", "neues-passwort")))
                .andExpect(status().isBadRequest());

        // Das alte gilt weiterhin
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("alice", PASSWORT)))
                .andExpect(status().isOk());
    }

    @Test
    void einZuKurzesPasswortWirdAbgelehnt() throws Exception {
        givenUser("bob", false);

        mockMvc.perform(post("/api/auth/set-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("bob", "kurz")))
                .andExpect(status().isBadRequest());

        assertThat(users.findByUsername("bob").orElseThrow().hasPassword()).isFalse();
    }

    // ── Passwort ändern ───────────────────────────────────────────────

    private MockHttpSession loggedIn(String username) throws Exception {
        return (MockHttpSession) mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(username, PASSWORT)))
                .andReturn().getRequest().getSession(false);
    }

    private String changeBody(String current, String next) {
        return """
                {"currentPassword":"%s","newPassword":"%s"}""".formatted(current, next);
    }

    @Test
    void angemeldetLaesstSichDasPasswortAendern() throws Exception {
        givenUser("alice", true);
        MockHttpSession session = loggedIn("alice");

        mockMvc.perform(post("/api/auth/change-password").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(changeBody(PASSWORT, "das-neue-passwort")))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("alice", "das-neue-passwort")))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("alice", PASSWORT)))
                .andExpect(status().isUnauthorized());
    }

    /** Sonst koennte an einem offenen Rechner jemand das Passwort uebernehmen. */
    @Test
    void ohneDasAktuellePasswortGehtEsNicht() throws Exception {
        givenUser("alice", true);
        MockHttpSession session = loggedIn("alice");

        mockMvc.perform(post("/api/auth/change-password").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(changeBody("daneben", "das-neue-passwort")))
                .andExpect(status().isUnauthorized());

        // Das alte gilt weiterhin
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("alice", PASSWORT)))
                .andExpect(status().isOk());
    }

    @Test
    void ohneAnmeldungGehtEsErstRechtNicht() throws Exception {
        givenUser("alice", true);

        mockMvc.perform(post("/api/auth/change-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(changeBody(PASSWORT, "das-neue-passwort")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void einZuKurzesNeuesPasswortWirdAbgelehnt() throws Exception {
        givenUser("alice", true);

        mockMvc.perform(post("/api/auth/change-password").session(loggedIn("alice"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(changeBody(PASSWORT, "kurz")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void dasselbePasswortNochmalIstKeineAenderung() throws Exception {
        givenUser("alice", true);

        mockMvc.perform(post("/api/auth/change-password").session(loggedIn("alice"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(changeBody(PASSWORT, PASSWORT)))
                .andExpect(status().isBadRequest());
    }

    /** Man soll nach dem Wechsel weiterarbeiten koennen, nicht rausfliegen. */
    @Test
    void nachDemWechselBleibtDieSitzungBestehen() throws Exception {
        givenUser("alice", true);
        MockHttpSession session = loggedIn("alice");

        mockMvc.perform(post("/api/auth/change-password").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(changeBody(PASSWORT, "das-neue-passwort")))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/todos").session(session)).andExpect(status().isOk());
    }

    @Test
    void ohnePasswortKannManSichNichtAnmelden() throws Exception {
        givenUser("bob", false);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("bob", "irgendwas")))
                .andExpect(status().isUnauthorized());
    }
}
