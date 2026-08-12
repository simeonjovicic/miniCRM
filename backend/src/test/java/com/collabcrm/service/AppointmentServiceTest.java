package com.collabcrm.service;

import com.collabcrm.model.Appointment;
import com.collabcrm.repository.AppointmentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AppointmentServiceTest {

    /** Termin: Donnerstag, 14.08.2026 um 14:00 */
    private static final LocalDateTime TERMIN = LocalDateTime.of(2026, 8, 14, 14, 0);

    @Mock
    private AppointmentRepository repository;

    @Mock
    private NtfyService ntfy;

    private AppointmentService service;

    @BeforeEach
    void setUp() {
        when(ntfy.isEnabled()).thenReturn(true);
        when(ntfy.send(any(), any())).thenReturn(true);
        service = new AppointmentService(repository, ntfy, "2,1", 9);
    }

    // ── Fälligkeit ────────────────────────────────────────────────────

    @Test
    void zweiTageVorherOeffnetUmNeun() {
        Appointment termin = appointment();

        assertThat(service.dueReminderDays(termin, LocalDateTime.of(2026, 8, 12, 8, 59)))
                .as("vor 9 Uhr noch nicht")
                .isEmpty();
        assertThat(service.dueReminderDays(termin, LocalDateTime.of(2026, 8, 12, 9, 0)))
                .containsExactly(2);
    }

    @Test
    void einenTagVorherKommtDieZweiteErinnerung() {
        assertThat(service.dueReminderDays(appointment(), LocalDateTime.of(2026, 8, 13, 9, 0)))
                .containsExactly(1);
    }

    /**
     * Der Pi darf zwischendurch aus sein: die Erinnerung bleibt den ganzen Tag
     * fällig und wird beim nächsten Lauf nachgeholt.
     */
    @Test
    void eineVerpassteErinnerungWirdSpaeterAmTagNachgeholt() {
        assertThat(service.dueReminderDays(appointment(), LocalDateTime.of(2026, 8, 12, 23, 30)))
                .containsExactly(2);
    }

    /**
     * Kern des Fenster-Ansatzes: wer einen Termin erst einen Tag vorher
     * einträgt, soll nicht die unsinnige Meldung "in 2 Tagen" bekommen.
     */
    @Test
    void einAbgelaufenesFensterFeuertNichtNachtraeglich() {
        List<Integer> due = service.dueReminderDays(appointment(), LocalDateTime.of(2026, 8, 13, 11, 0));

        assertThat(due)
                .as("nur noch 'morgen', nicht mehr 'in 2 Tagen'")
                .containsExactly(1);
    }

    @Test
    void bereitsVerschickteErinnerungenKommenNichtNochmal() {
        Appointment termin = appointment();
        termin.setRemindersSentDays("2");

        assertThat(service.dueReminderDays(termin, LocalDateTime.of(2026, 8, 12, 15, 0))).isEmpty();
    }

    @Test
    void fuerVergangeneTermineGibtEsKeineErinnerung() {
        assertThat(service.dueReminderDays(appointment(), TERMIN.plusMinutes(1))).isEmpty();
    }

    @Test
    void amTerminTagSelbstKommtNichtsMehr() {
        assertThat(service.dueReminderDays(appointment(), LocalDateTime.of(2026, 8, 14, 9, 0)))
                .as("das Fenster fuer 'morgen' endete um 9 Uhr am Termintag")
                .isEmpty();
    }

    // ── Versand ───────────────────────────────────────────────────────

    @Test
    void derVersandMerktSichWasSchonRausIst() {
        Appointment termin = appointment();
        when(repository.findByStartsAtAfterOrderByStartsAtAsc(any())).thenReturn(List.of(termin));

        int sent = service.sendDueReminders(LocalDateTime.of(2026, 8, 12, 9, 0));

        assertThat(sent).isEqualTo(1);
        assertThat(AppointmentService.sentDays(termin)).containsExactly(2);
        verify(repository).save(termin);
    }

    @Test
    void einZweiterLaufAmSelbenTagSchicktNichtsNochmal() {
        Appointment termin = appointment();
        when(repository.findByStartsAtAfterOrderByStartsAtAsc(any())).thenReturn(List.of(termin));

        service.sendDueReminders(LocalDateTime.of(2026, 8, 12, 9, 0));
        int zweiterLauf = service.sendDueReminders(LocalDateTime.of(2026, 8, 12, 10, 0));

        assertThat(zweiterLauf).isZero();
        verify(ntfy, times(1)).send(any(), any());
    }

    /** Kommt die Nachricht nicht durch, bleibt sie offen und wird erneut versucht. */
    @Test
    void einFehlgeschlagenerVersandWirdNichtAlsErledigtVermerkt() {
        when(ntfy.send(any(), any())).thenReturn(false);
        Appointment termin = appointment();
        when(repository.findByStartsAtAfterOrderByStartsAtAsc(any())).thenReturn(List.of(termin));

        int sent = service.sendDueReminders(LocalDateTime.of(2026, 8, 12, 9, 0));

        assertThat(sent).isZero();
        assertThat(AppointmentService.sentDays(termin)).isEmpty();
    }

    @Test
    void ohneNtfyKonfigurationPassiertNichts() {
        when(ntfy.isEnabled()).thenReturn(false);

        assertThat(service.sendDueReminders(LocalDateTime.of(2026, 8, 12, 9, 0))).isZero();
        verify(repository, never()).findByStartsAtAfterOrderByStartsAtAsc(any());
    }

    // ── Text ──────────────────────────────────────────────────────────

    @Test
    void derTitelNenntDenVorlauf() {
        assertThat(AppointmentService.reminderTitle(2)).isEqualTo("Termin in 2 Tagen");
        assertThat(AppointmentService.reminderTitle(1)).isEqualTo("Termin morgen");
        assertThat(AppointmentService.reminderTitle(0)).isEqualTo("Termin heute");
    }

    @Test
    void derNachrichtentextEnthaeltDasWichtigste() {
        Appointment termin = appointment();
        termin.setCustomerName("Acme Corp");
        termin.setLocation("Büro Wien");
        termin.setDescription("Angebot durchgehen");

        String body = AppointmentService.reminderBody(termin);

        assertThat(body)
                .contains("Besprechung")
                .contains("14.08.2026")
                .contains("14:00")
                .contains("Acme Corp")
                .contains("Büro Wien")
                .contains("Angebot durchgehen");
    }

    @Test
    void ohneZusatzangabenBleibtDerTextKurz() {
        String body = AppointmentService.reminderBody(appointment());

        assertThat(body.lines()).hasSize(2);
    }

    // ── Verschieben ───────────────────────────────────────────────────

    @Test
    void einVerschobenerTerminErinnertWieder() {
        UUID id = UUID.randomUUID();
        Appointment existing = appointment();
        existing.setRemindersSentDays("2,1");
        when(repository.findById(id)).thenReturn(java.util.Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Appointment update = appointment();
        update.setStartsAt(TERMIN.plusDays(14));

        Appointment result = service.update(id, update);

        assertThat(result.getRemindersSentDays())
                .as("nach dem Verschieben sind die Erinnerungen wieder offen")
                .isNull();
    }

    @Test
    void eineReineTiteländerungLaesstDieErinnerungenInRuhe() {
        UUID id = UUID.randomUUID();
        Appointment existing = appointment();
        existing.setRemindersSentDays("2");
        when(repository.findById(id)).thenReturn(java.util.Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Appointment update = appointment();
        update.setTitle("Besprechung (verlegt in Raum 2)");

        assertThat(service.update(id, update).getRemindersSentDays()).isEqualTo("2");
    }

    // ── Hilfsmittel ───────────────────────────────────────────────────

    private static Appointment appointment() {
        Appointment a = new Appointment();
        a.setTitle("Besprechung");
        a.setStartsAt(TERMIN);
        a.setCreatedBy(UUID.randomUUID());
        return a;
    }
}
