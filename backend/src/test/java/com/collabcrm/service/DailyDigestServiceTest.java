package com.collabcrm.service;

import com.collabcrm.model.Appointment;
import com.collabcrm.model.DailyDigestState;
import com.collabcrm.model.Todo;
import com.collabcrm.repository.AppointmentRepository;
import com.collabcrm.repository.DailyDigestStateRepository;
import com.collabcrm.repository.TodoRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DailyDigestServiceTest {

    private static final LocalDate HEUTE = LocalDate.of(2026, 8, 13);
    private static final LocalDateTime MORGENS = HEUTE.atTime(8, 5);

    @Mock private TodoRepository todoRepository;
    @Mock private AppointmentRepository appointmentRepository;
    @Mock private FinanceStatsService financeStatsService;
    @Mock private DailyDigestStateRepository stateRepository;
    @Mock private NtfyService ntfy;

    private DailyDigestService service;

    @BeforeEach
    void setUp() {
        when(ntfy.isEnabled()).thenReturn(true);
        when(ntfy.send(any(), any())).thenReturn(true);
        when(todoRepository.findAll()).thenReturn(List.of());
        when(appointmentRepository.findByStartsAtAfterOrderByStartsAtAsc(any())).thenReturn(List.of());
        when(financeStatsService.openReceivables()).thenReturn(List.of());
        when(stateRepository.findById(anyInt())).thenReturn(Optional.empty());
        service = digestService(true, 8);
    }

    private DailyDigestService digestService(boolean enabled, int hour) {
        return new DailyDigestService(todoRepository, appointmentRepository, financeStatsService,
                stateRepository, ntfy, enabled, hour);
    }

    // ── Zeitpunkt ─────────────────────────────────────────────────────

    @Test
    void vorDerEingestelltenStundeKommtNichts() {
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));

        assertThat(service.sendIfDue(HEUTE.atTime(7, 59))).isFalse();
        verify(ntfy, never()).send(any(), any());
    }

    @Test
    void abDerEingestelltenStundeKommtSie() {
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));

        assertThat(service.sendIfDue(MORGENS)).isTrue();
        verify(ntfy).send(contains("Heute"), contains("Angebot"));
    }

    /** Ein Neustart des Pi darf die Übersicht nicht erneut ausloesen. */
    @Test
    void proTagKommtSieNurEinmal() {
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));
        when(stateRepository.findById(anyInt()))
                .thenReturn(Optional.of(new DailyDigestState(HEUTE)));

        assertThat(service.sendIfDue(MORGENS)).isFalse();
        verify(ntfy, never()).send(any(), any());
    }

    @Test
    void amNaechstenTagKommtSieWieder() {
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));
        when(stateRepository.findById(anyInt()))
                .thenReturn(Optional.of(new DailyDigestState(HEUTE.minusDays(1))));

        assertThat(service.sendIfDue(MORGENS)).isTrue();
    }

    @Test
    void abgeschaltetPassiertNichts() {
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));

        assertThat(digestService(false, 8).sendIfDue(MORGENS)).isFalse();
        verify(ntfy, never()).send(any(), any());
    }

    /** Kommt die Nachricht nicht durch, wird der Tag nicht als erledigt vermerkt. */
    @Test
    void einFehlgeschlagenerVersandWirdSpaeterErneutVersucht() {
        when(ntfy.send(any(), any())).thenReturn(false);
        when(todoRepository.findAll()).thenReturn(List.of(offenesTodo("Angebot", null)));

        assertThat(service.sendIfDue(MORGENS)).isFalse();
        verify(stateRepository, never()).save(any());
    }

    // ── Inhalt ────────────────────────────────────────────────────────

    /** Eine Nachricht "0 offen" trainiert einen nur darauf, sie wegzuwischen. */
    @Test
    void ohneInhaltKommtKeineNachricht() {
        assertThat(service.buildDigest(HEUTE)).isEmpty();
        assertThat(service.sendIfDue(MORGENS)).isFalse();
        verify(ntfy, never()).send(any(), any());
    }

    @Test
    void einLeererTagWirdTrotzdemAbgehaktUmNichtStaendigZuPruefen() {
        service.sendIfDue(MORGENS);

        verify(stateRepository).save(any());
    }

    @Test
    void ueberfaelligeStehenVorDenHeuteFaelligen() {
        when(todoRepository.findAll()).thenReturn(List.of(
                offenesTodo("Heute dran", HEUTE),
                offenesTodo("Laengst faellig", HEUTE.minusDays(3))));

        String body = service.buildDigest(HEUTE).orElseThrow();

        assertThat(body).contains("2 Todos offen, davon 1 überfällig");
        assertThat(body.indexOf("Laengst faellig")).isLessThan(body.indexOf("Heute dran"));
        assertThat(body).contains("überfällig").contains("heute fällig");
    }

    /** Ohne Auffuellen stuende bei fristlosen Todos nur eine nackte Zahl da. */
    @Test
    void auchTodosOhneFristWerdenGenannt() {
        when(todoRepository.findAll()).thenReturn(List.of(
                offenesTodo("Nebensaechlich", null, "LOW"),
                offenesTodo("Wichtig ohne Frist", null, "HIGH")));

        String body = service.buildDigest(HEUTE).orElseThrow();

        assertThat(body).contains("2 Todos offen");
        assertThat(body.indexOf("Wichtig ohne Frist"))
                .as("die dringenderen zuerst")
                .isLessThan(body.indexOf("Nebensaechlich"));
    }

    @Test
    void erledigteZaehlenNichtMit() {
        Todo erledigt = offenesTodo("Schon fertig", HEUTE);
        erledigt.setDone(true);
        when(todoRepository.findAll()).thenReturn(List.of(erledigt, offenesTodo("Offen", null)));

        assertThat(service.buildDigest(HEUTE).orElseThrow())
                .contains("1 Todo offen")
                .doesNotContain("Schon fertig");
    }

    @Test
    void termineDesTagesStehenMitUhrzeitDrin() {
        when(appointmentRepository.findByStartsAtAfterOrderByStartsAtAsc(any()))
                .thenReturn(List.of(termin("Besprechung Acme", HEUTE.atTime(14, 0))));

        assertThat(service.buildDigest(HEUTE).orElseThrow())
                .contains("Termin heute")
                .contains("14:00")
                .contains("Besprechung Acme");
    }

    @Test
    void termineAndererTageBleibenDraussen() {
        when(appointmentRepository.findByStartsAtAfterOrderByStartsAtAsc(any()))
                .thenReturn(List.of(termin("Naechste Woche", HEUTE.plusDays(5).atTime(9, 0))));

        assertThat(service.buildDigest(HEUTE)).isEmpty();
    }

    @Test
    void offeneRechnungenStehenAlsSummeDrin() {
        when(financeStatsService.openReceivables()).thenReturn(List.of(
                Map.of("open", new BigDecimal("1200.00")),
                Map.of("open", new BigDecimal("2400.50"))));

        assertThat(service.buildDigest(HEUTE).orElseThrow()).contains("3.600,50 €");
    }

    @Test
    void dieListeWirdGekuerzt() {
        List<Todo> viele = java.util.stream.IntStream.range(0, 12)
                .mapToObj(i -> offenesTodo("Todo " + i, HEUTE.minusDays(1)))
                .toList();
        when(todoRepository.findAll()).thenReturn(viele);

        String body = service.buildDigest(HEUTE).orElseThrow();

        assertThat(body).contains("12 Todos offen, davon 12 überfällig");
        assertThat(body.lines().filter(l -> l.startsWith("•")).count()).isEqualTo(5);
    }

    // ── Hilfsmittel ───────────────────────────────────────────────────

    private static Todo offenesTodo(String title, LocalDate due) {
        return offenesTodo(title, due, "MEDIUM");
    }

    private static Todo offenesTodo(String title, LocalDate due, String priority) {
        Todo t = new Todo();
        t.setTitle(title);
        t.setPriority(priority);
        t.setDueDate(due);
        t.setDone(false);
        t.setCreatedBy(UUID.randomUUID());
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
