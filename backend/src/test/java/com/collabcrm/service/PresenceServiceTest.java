package com.collabcrm.service;

import com.collabcrm.model.User;
import com.collabcrm.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PresenceServiceTest {

    private static final UUID ALICE = UUID.randomUUID();
    private static final UUID BOB = UUID.randomUUID();

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Mock
    private UserRepository userRepository;

    private PresenceService service;

    @BeforeEach
    void setUp() {
        when(userRepository.findAll()).thenReturn(List.of(user(ALICE, "alice"), user(BOB, "bob")));
        service = new PresenceService(messagingTemplate, userRepository);
    }

    /**
     * Der eigentliche Grund für den Griff in die Datenbank: nach einem Neustart
     * hat sich noch niemand verbunden, die Mitgliederliste darf trotzdem nicht
     * leer sein.
     */
    @Test
    void alleMitgliederErscheinenAuchOhneVerbindung() {
        List<Map<String, Object>> presence = service.getAllUsersPresence();

        assertThat(presence).hasSize(2);
        assertThat(presence).extracting(m -> m.get("username"))
                .containsExactlyInAnyOrder("alice", "bob");
        assertThat(presence).allSatisfy(m -> assertThat(m.get("online")).isEqualTo(false));
    }

    @Test
    void einVerbundenesMitgliedGiltAlsOnline() {
        service.userConnected("session-1", ALICE.toString(), "alice");

        assertThat(onlineFlagOf(service.getAllUsersPresence(), "alice")).isEqualTo(true);
        assertThat(onlineFlagOf(service.getAllUsersPresence(), "bob")).isEqualTo(false);
    }

    @Test
    void nachDemTrennenIstDasMitgliedWiederOffline() {
        service.userConnected("session-1", ALICE.toString(), "alice");
        service.userDisconnected("session-1");

        var alice = entryFor(service.getAllUsersPresence(), "alice");

        assertThat(alice.get("online")).isEqualTo(false);
        assertThat(alice.get("lastSeenAt")).as("der Zeitpunkt wird festgehalten").isNotNull();
    }

    @Test
    void jedesMitgliedErscheintNurEinmal() {
        service.userConnected("session-1", ALICE.toString(), "alice");
        service.userConnected("session-2", ALICE.toString(), "alice");

        assertThat(service.getAllUsersPresence()).hasSize(2);
    }

    @Test
    void ohneAngelegteBenutzerBleibtDieListeLeer() {
        when(userRepository.findAll()).thenReturn(List.of());

        assertThat(service.getAllUsersPresence()).isEmpty();
    }

    private static Object onlineFlagOf(List<Map<String, Object>> presence, String username) {
        return entryFor(presence, username).get("online");
    }

    private static Map<String, Object> entryFor(List<Map<String, Object>> presence, String username) {
        return presence.stream()
                .filter(m -> username.equals(m.get("username")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Kein Eintrag für " + username));
    }

    private static User user(UUID id, String username) {
        User u = new User();
        ReflectionTestUtils.setField(u, "id", id);
        u.setUsername(username);
        u.setEmail(username + "@example.com");
        u.setRole("ADMIN");
        return u;
    }
}
