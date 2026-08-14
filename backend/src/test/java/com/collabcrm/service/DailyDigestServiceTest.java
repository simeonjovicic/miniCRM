package com.collabcrm.service;

import com.collabcrm.model.Appointment;
import com.collabcrm.model.DigestState;
import com.collabcrm.model.Todo;
import com.collabcrm.model.User;
import com.collabcrm.repository.AppointmentRepository;
import com.collabcrm.repository.DigestStateRepository;
import com.collabcrm.repository.TodoRepository;
import com.collabcrm.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DailyDigestServiceTest {

    private static final LocalDate HEUTE = LocalDate.of(2026, 8, 13);
    private static final LocalDateTime MORGENS = HEUTE.atTime(8, 5);

    private static final String SIMEONS_THEMA = "simeon-privat-4711";
    private static final String BOBS_THEMA = "bob-privat-0815";

    @Mock private TodoRepository todoRepository;
    @Mock private AppointmentRepository appointmentRepository;
    @Mock private FinanceStatsService financeStatsService;
    @Mock private DigestStateRepository stateRepository;
    @Mock private UserRepository userRepository;
    @Mock private NtfyService ntfy;

    private DailyDigestService service;

    private User simeon;
    private User bob;

    @BeforeEach
    void setUp() {
        simeon = benutzer("simeon", SIMEONS_THEMA);
        bob = benutzer("bob", BOBS_THEMA);

        when(ntfy.isEnabled()).thenReturn(true);
        when(ntfy.send(any(), any())).thenReturn(true);
        when(ntfy.sendTo(any(), any(), any())).thenReturn(true);
        when(todoRepository.findAll()).thenReturn(List.of());
        when(appointmentRepository.findByStartsAtAfterOrderByStartsAtAsc(any())).thenReturn(List.of());
        when(financeStatsService.openReceivables()).thenReturn(List.of());
        when(stateRepository.findById(anyString())).thenReturn(Optional.empty());
        when(userRepository.findAll()).thenReturn(List.of());
        service = digestService(true, 8);
    }

    private DailyDigestService digestService(boolean enabled, int hour) {
        return new DailyDigestService(todoRepository, appointmentRepository, financeStatsService,
                stateRepository, userRepository, ntfy, enabled, hour);
    }

    // ── Zeitpunkt ─────────────────────────────────────────────────────

    @Test
    void vorDerEingestelltenStundeKommtNichts() {
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));

        assertThat(service.sendIfDue(HEUTE.atTime(7, 59))).isZero();
        verify(ntfy, never()).send(any(), any());
        verify(ntfy, never()).sendTo(any(), any(), any());
    }

    @Test
    void abDerEingestelltenStundeKommtSie() {
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));

        assertThat(service.sendIfDue(MORGENS)).isEqualTo(1);
        verify(ntfy).send(contains("Heute"), contains("Angebot"));
    }

    /** Ein Neustart des Pi darf die Übersicht nicht erneut ausloesen. */
    @Test
    void proTagKommtSieNurEinmal() {
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));
        when(stateRepository.findById(DigestState.SHARED))
                .thenReturn(Optional.of(new DigestState(DigestState.SHARED, HEUTE)));

        assertThat(service.sendIfDue(MORGENS)).isZero();
        verify(ntfy, never()).send(any(), any());
    }

    @Test
    void amNaechstenTagKommtSieWieder() {
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));
        when(stateRepository.findById(DigestState.SHARED))
                .thenReturn(Optional.of(new DigestState(DigestState.SHARED, HEUTE.minusDays(1))));

        assertThat(service.sendIfDue(MORGENS)).isEqualTo(1);
    }

    @Test
    void abgeschaltetPassiertNichts() {
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));

        assertThat(digestService(false, 8).sendIfDue(MORGENS)).isZero();
        verify(ntfy, never()).send(any(), any());
    }

    /** Kommt die Nachricht nicht durch, wird der Tag nicht als erledigt vermerkt. */
    @Test
    void einFehlgeschlagenerVersandWirdSpaeterErneutVersucht() {
        when(ntfy.send(any(), any())).thenReturn(false);
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));

        assertThat(service.sendIfDue(MORGENS)).isZero();
        verify(stateRepository, never()).save(any());
    }

    // ── Aufteilung auf die Empfaenger ─────────────────────────────────

    /**
     * Der Kern der Sache: was einer Person gehoert, geht an ihr eigenes Thema —
     * nicht an das gemeinsame, wo der andere es mitlesen wuerde.
     */
    @Test
    void zugewieseneTodosGehenAnDasEigeneThemaDerPerson() {
        when(userRepository.findAll()).thenReturn(List.of(simeon, bob));
        when(todoRepository.findAll()).thenReturn(List.of(
                zugewiesen("Angebot Acme", simeon),
                zugewiesen("Rechnung Beta", bob)));

        service.sendIfDue(MORGENS);

        verify(ntfy).sendTo(eq(SIMEONS_THEMA), any(), contains("Angebot Acme"));
        verify(ntfy).sendTo(eq(BOBS_THEMA), any(), contains("Rechnung Beta"));
    }

    @Test
    void niemandGesiehtDieTodosDesAnderen() {
        when(userRepository.findAll()).thenReturn(List.of(simeon, bob));
        when(todoRepository.findAll()).thenReturn(List.of(
                zugewiesen("Nur fuer Simeon", simeon),
                zugewiesen("Nur fuer Bob", bob)));

        service.sendIfDue(MORGENS);

        verify(ntfy, never()).sendTo(eq(BOBS_THEMA), any(), contains("Nur fuer Simeon"));
        verify(ntfy, never()).sendTo(eq(SIMEONS_THEMA), any(), contains("Nur fuer Bob"));
    }

    /** Was niemandem gehoert, geht an beide — ueber das gemeinsame Thema. */
    @Test
    void nichtZugewieseneTodosGehenAnDasGemeinsameThema() {
        when(userRepository.findAll()).thenReturn(List.of(simeon, bob));
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Geht uns beide an", null)));

        service.sendIfDue(MORGENS);

        verify(ntfy).send(any(), contains("Geht uns beide an"));
        verify(ntfy, never()).sendTo(any(), any(), any());
    }

    /** Sonst liest man morgens zweimal dasselbe und schaut bald nicht mehr hin. */
    @Test
    void einTodoStehtNieInZweiUebersichten() {
        when(userRepository.findAll()).thenReturn(List.of(simeon));
        when(todoRepository.findAll()).thenReturn(List.of(zugewiesen("Angebot Acme", simeon)));

        service.sendIfDue(MORGENS);

        verify(ntfy, never()).send(any(), contains("Angebot Acme"));
        verify(ntfy).sendTo(eq(SIMEONS_THEMA), any(), contains("Angebot Acme"));
    }

    // ── Ohne eigenes Thema ────────────────────────────────────────────

    /** Ausdruecklich gefordert: ohne Code wird es gar nicht erst versucht. */
    @Test
    void ohneEigenesThemaWirdNichtsVersucht() {
        User ohneThema = benutzer("bob", null);
        when(userRepository.findAll()).thenReturn(List.of(ohneThema));
        when(todoRepository.findAll()).thenReturn(List.of(zugewiesen("Rechnung Beta", ohneThema)));

        service.sendIfDue(MORGENS);

        verify(ntfy, never()).sendTo(any(), any(), any());
    }

    @Test
    void auchEinLeeresThemaZaehltAlsKeines() {
        User leer = benutzer("bob", "   ");
        when(userRepository.findAll()).thenReturn(List.of(leer));
        when(todoRepository.findAll()).thenReturn(List.of(zugewiesen("Rechnung Beta", leer)));

        service.sendIfDue(MORGENS);

        verify(ntfy, never()).sendTo(any(), any(), any());
    }

    /**
     * Kein Zustandseintrag ohne Thema: sobald eines hinterlegt wird, soll die
     * Uebersicht noch am selben Tag kommen und nicht als "schon erledigt" gelten.
     */
    @Test
    void ohneEigenesThemaWirdDerTagNichtAbgehakt() {
        User ohneThema = benutzer("bob", null);
        when(userRepository.findAll()).thenReturn(List.of(ohneThema));
        when(todoRepository.findAll()).thenReturn(List.of(zugewiesen("Rechnung Beta", ohneThema)));

        service.sendIfDue(MORGENS);

        ArgumentCaptor<DigestState> gespeichert = ArgumentCaptor.forClass(DigestState.class);
        verify(stateRepository, atLeast(0)).save(gespeichert.capture());
        assertThat(gespeichert.getAllValues())
                .extracting(DigestState::getRecipient)
                .doesNotContain(DigestState.forUser(ohneThema.getId()));
    }

    /** Das zugewiesene Todo darf auch nicht ersatzweise ins gemeinsame rutschen. */
    @Test
    void ohneEigenesThemaLandetDasTodoNichtImGemeinsamen() {
        User ohneThema = benutzer("bob", null);
        when(userRepository.findAll()).thenReturn(List.of(ohneThema));
        when(todoRepository.findAll()).thenReturn(List.of(zugewiesen("Rechnung Beta", ohneThema)));

        service.sendIfDue(MORGENS);

        verify(ntfy, never()).send(any(), contains("Rechnung Beta"));
    }

    /** Ohne gemeinsames Thema laufen die persoenlichen trotzdem. */
    @Test
    void ohneGemeinsamesThemaKommenDiePersoenlichenTrotzdem() {
        when(ntfy.isEnabled()).thenReturn(false);
        when(userRepository.findAll()).thenReturn(List.of(simeon));
        when(todoRepository.findAll()).thenReturn(List.of(zugewiesen("Angebot Acme", simeon)));

        assertThat(service.sendIfDue(MORGENS)).isEqualTo(1);
        verify(ntfy).sendTo(eq(SIMEONS_THEMA), any(), contains("Angebot Acme"));
    }

    // ── Empfaenger sind voneinander unabhaengig ───────────────────────

    @Test
    void jederEmpfaengerWirdEinzelnAbgehakt() {
        when(userRepository.findAll()).thenReturn(List.of(simeon, bob));
        when(todoRepository.findAll()).thenReturn(List.of(
                zugewiesen("Angebot Acme", simeon),
                zugewiesen("Rechnung Beta", bob)));
        // Simeon hat seine heute schon bekommen, Bob noch nicht
        when(stateRepository.findById(DigestState.forUser(simeon.getId())))
                .thenReturn(Optional.of(new DigestState(DigestState.forUser(simeon.getId()), HEUTE)));

        service.sendIfDue(MORGENS);

        verify(ntfy, never()).sendTo(eq(SIMEONS_THEMA), any(), any());
        verify(ntfy).sendTo(eq(BOBS_THEMA), any(), any());
    }

    /** Ein klemmender Kanal darf den anderen nicht mitreissen. */
    @Test
    void einFehlschlagBeiEinemBetrifftDenAnderenNicht() {
        when(userRepository.findAll()).thenReturn(List.of(simeon, bob));
        when(todoRepository.findAll()).thenReturn(List.of(
                zugewiesen("Angebot Acme", simeon),
                zugewiesen("Rechnung Beta", bob)));
        when(ntfy.sendTo(eq(SIMEONS_THEMA), any(), any())).thenReturn(false);

        assertThat(service.sendIfDue(MORGENS)).isEqualTo(1);
        verify(ntfy).sendTo(eq(BOBS_THEMA), any(), any());
    }

    // ── Inhalt der gemeinsamen Uebersicht ─────────────────────────────

    /** Eine Nachricht "0 offen" trainiert einen nur darauf, sie wegzuwischen. */
    @Test
    void ohneInhaltKommtKeineNachricht() {
        assertThat(service.buildSharedDigest(HEUTE, List.of())).isEmpty();
        assertThat(service.sendIfDue(MORGENS)).isZero();
        verify(ntfy, never()).send(any(), any());
    }

    @Test
    void einLeererTagWirdTrotzdemAbgehaktUmNichtStaendigZuPruefen() {
        service.sendIfDue(MORGENS);

        verify(stateRepository).save(any());
    }

    @Test
    void ueberfaelligeStehenVorDenHeuteFaelligen() {
        String body = service.buildSharedDigest(HEUTE, List.of(
                offenesTodo("Heute dran", HEUTE),
                offenesTodo("Laengst faellig", HEUTE.minusDays(3)))).orElseThrow();

        assertThat(body).contains("2 Todos offen, davon 1 überfällig");
        assertThat(body.indexOf("Laengst faellig")).isLessThan(body.indexOf("Heute dran"));
        assertThat(body).contains("überfällig").contains("heute fällig");
    }

    /** Ohne Auffuellen stuende bei fristlosen Todos nur eine nackte Zahl da. */
    @Test
    void auchTodosOhneFristWerdenGenannt() {
        String body = service.buildSharedDigest(HEUTE, List.of(
                offenesTodo("Steht oben", null),
                offenesTodo("Steht unten", null))).orElseThrow();

        assertThat(body).contains("2 Todos offen");
        assertThat(body.indexOf("Steht oben"))
                .as("in der Reihenfolge der Liste, nicht umsortiert")
                .isLessThan(body.indexOf("Steht unten"));
    }

    @Test
    void erledigteZaehlenNichtMit() {
        Todo erledigt = offenesTodo("Schon fertig", HEUTE);
        erledigt.setDone(true);
        when(todoRepository.findAll()).thenReturn(List.of(erledigt, offenesTodo("Offen", null)));

        service.sendIfDue(MORGENS);

        verify(ntfy).send(any(), argThat(body ->
                body.contains("1 Todo offen") && !body.contains("Schon fertig")));
    }

    @Test
    void termineDesTagesStehenMitUhrzeitDrin() {
        when(appointmentRepository.findByStartsAtAfterOrderByStartsAtAsc(any()))
                .thenReturn(List.of(termin("Besprechung Acme", HEUTE.atTime(14, 0))));

        assertThat(service.buildSharedDigest(HEUTE, List.of()).orElseThrow())
                .contains("Termin heute")
                .contains("14:00")
                .contains("Besprechung Acme");
    }

    @Test
    void termineAndererTageBleibenDraussen() {
        when(appointmentRepository.findByStartsAtAfterOrderByStartsAtAsc(any()))
                .thenReturn(List.of(termin("Naechste Woche", HEUTE.plusDays(5).atTime(9, 0))));

        assertThat(service.buildSharedDigest(HEUTE, List.of())).isEmpty();
    }

    @Test
    void offeneRechnungenStehenAlsSummeDrin() {
        when(financeStatsService.openReceivables()).thenReturn(List.of(
                Map.of("open", new BigDecimal("1200.00")),
                Map.of("open", new BigDecimal("2400.50"))));

        assertThat(service.buildSharedDigest(HEUTE, List.of()).orElseThrow())
                .contains("3.600,50 €");
    }

    /** Termine und Rechnungen gehen beide an — die bleiben im gemeinsamen. */
    @Test
    void termineUndRechnungenStehenNichtInDerPersoenlichen() {
        when(appointmentRepository.findByStartsAtAfterOrderByStartsAtAsc(any()))
                .thenReturn(List.of(termin("Besprechung Acme", HEUTE.atTime(14, 0))));
        when(financeStatsService.openReceivables())
                .thenReturn(List.of(Map.of("open", new BigDecimal("1200.00"))));

        String persoenlich = service.buildPersonalDigest(
                HEUTE, List.of(zugewiesen("Angebot Acme", simeon)), simeon.getId()).orElseThrow();

        assertThat(persoenlich)
                .contains("Angebot Acme")
                .doesNotContain("Besprechung Acme")
                .doesNotContain("1.200");
    }

    @Test
    void dieListeWirdGekuerzt() {
        List<Todo> viele = java.util.stream.IntStream.range(0, 12)
                .mapToObj(i -> offenesTodo("Todo " + i, HEUTE.minusDays(1)))
                .toList();

        String body = service.buildSharedDigest(HEUTE, viele).orElseThrow();

        assertThat(body).contains("12 Todos offen, davon 12 überfällig");
        assertThat(body.lines().filter(l -> l.startsWith("•")).count()).isEqualTo(5);
    }

    // ── Inhalt der persoenlichen Uebersicht ───────────────────────────

    @Test
    void diePersoenlicheIstAlsSolcheErkennbar() {
        String body = service.buildPersonalDigest(
                HEUTE, List.of(zugewiesen("Angebot Acme", simeon)), simeon.getId()).orElseThrow();

        assertThat(body).contains("1 Todo für dich").contains("Angebot Acme");
    }

    @Test
    void ohneZugewiesenesKommtKeinePersoenliche() {
        when(userRepository.findAll()).thenReturn(List.of(simeon));
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Gemeinsam", null)));

        service.sendIfDue(MORGENS);

        verify(ntfy, never()).sendTo(any(), any(), any());
    }

    // ── Wartet auf Kunden ─────────────────────────────────────────────

    /**
     * Eine Frist, die verstrichen ist, waehrend man auf den Kunden wartet, ist
     * kein Versaeumnis — als "ueberfaellig" gemeldet waere sie nur Rauschen.
     */
    @Test
    void wartendesZaehltNichtAlsUeberfaellig() {
        Todo wartend = offenesTodo("Wartet auf Acme", HEUTE.minusDays(5));
        wartend.setWaiting(true);

        String body = service.buildSharedDigest(HEUTE, List.of(
                wartend, offenesTodo("Kann ich machen", null))).orElseThrow();

        assertThat(body).contains("1 Todo offen").doesNotContain("überfällig");
    }

    @Test
    void wartendesStehtAlsHinweisDarunter() {
        Todo wartend = offenesTodo("Wartet auf Acme", null);
        wartend.setWaiting(true);

        String body = service.buildSharedDigest(HEUTE, List.of(
                wartend, offenesTodo("Kann ich machen", null))).orElseThrow();

        assertThat(body).contains("1 wartet auf Kunden").doesNotContain("• Wartet auf Acme");
    }

    /** "0 Todos offen (3 warten)" waere jeden Morgen dasselbe und schnell wertlos. */
    @Test
    void nurWartendesLoestKeineNachrichtAus() {
        Todo wartend = offenesTodo("Wartet auf Acme", HEUTE.minusDays(5));
        wartend.setWaiting(true);

        assertThat(service.buildSharedDigest(HEUTE, List.of(wartend))).isEmpty();
    }

    @Test
    void nurWartendesLoestAuchKeinePersoenlicheAus() {
        Todo wartend = zugewiesen("Wartet auf Acme", simeon);
        wartend.setWaiting(true);

        assertThat(service.buildPersonalDigest(HEUTE, List.of(wartend), simeon.getId())).isEmpty();
    }

    // ── Hilfsmittel ───────────────────────────────────────────────────

    private static User benutzer(String name, String thema) {
        User u = new User();
        u.setUsername(name);
        u.setEmail(name + "@example.com");
        u.setRole("ADMIN");
        u.setNtfyTopic(thema);
        ReflectionTestUtils.setField(u, "id", UUID.randomUUID());
        return u;
    }

    private static Todo offenesTodo(String title, LocalDate due) {
        Todo t = new Todo();
        t.setTitle(title);
        t.setDueDate(due);
        t.setDone(false);
        t.setCreatedBy(UUID.randomUUID());
        return t;
    }

    private static Todo zugewiesen(String title, User assignee) {
        Todo t = offenesTodo(title, null);
        t.setAssigneeId(assignee.getId());
        t.setAssigneeUsername(assignee.getUsername());
        return t;
    }

    private static Appointment termin(String title, LocalDateTime startsAt) {
        Appointment a = new Appointment();
        a.setTitle(title);
        a.setStartsAt(startsAt);
        a.setCreatedBy(UUID.randomUUID());
        return a;
    }
}
