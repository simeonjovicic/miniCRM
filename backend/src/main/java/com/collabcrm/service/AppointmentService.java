package com.collabcrm.service;

import com.collabcrm.model.Appointment;
import com.collabcrm.repository.AppointmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Termine samt Erinnerungen.
 *
 * <h2>Wann eine Erinnerung fällig ist</h2>
 * Zu jeder Vorlaufzeit (Standard 2 und 1 Tag) gehört ein Zeitfenster: es
 * beginnt an dem Tag zur eingestellten Uhrzeit und dauert 24 Stunden.
 *
 * <pre>
 *   Termin: Do 14.08. um 14:00, Erinnerungsstunde 9
 *
 *   "in 2 Tagen"  Fenster  Di 12.08. 09:00 → Mi 13.08. 09:00
 *   "morgen"      Fenster  Mi 13.08. 09:00 → Do 14.08. 09:00
 * </pre>
 *
 * Das Fenster löst zwei Dinge auf einmal: der Pi darf zwischendurch aus sein
 * und holt die Erinnerung beim nächsten Lauf nach — und ein Termin, den man
 * erst einen Tag vorher einträgt, bekommt keine unsinnige Meldung
 * "in 2 Tagen" mehr, weil dieses Fenster schon vorbei ist.
 */
@Service
@Transactional
public class AppointmentService {

    private static final Logger log = LoggerFactory.getLogger(AppointmentService.class);

    private static final DateTimeFormatter GERMAN =
            DateTimeFormatter.ofPattern("EEE, dd.MM.yyyy 'um' HH:mm", Locale.GERMAN);

    private final AppointmentRepository repository;
    private final NtfyService ntfy;

    /** Vorlaufzeiten in Tagen, absteigend — die längste zuerst. */
    private final List<Integer> reminderDays;
    private final int reminderHour;

    public AppointmentService(AppointmentRepository repository,
                              NtfyService ntfy,
                              @Value("${reminders.days-before}") String daysBefore,
                              @Value("${reminders.hour}") int reminderHour) {
        this.repository = repository;
        this.ntfy = ntfy;
        this.reminderHour = reminderHour;
        this.reminderDays = Arrays.stream(daysBefore.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Integer::parseInt)
                .distinct()
                .sorted(Comparator.reverseOrder())
                .toList();
    }

    public List<Appointment> findAll() {
        return repository.findAllByOrderByStartsAtAsc();
    }

    public Appointment create(Appointment appointment) {
        return repository.save(appointment);
    }

    public Appointment update(UUID id, Appointment data) {
        Appointment existing = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Appointment not found: " + id));

        boolean moved = data.getStartsAt() != null && !data.getStartsAt().equals(existing.getStartsAt());

        if (data.getTitle() != null) existing.setTitle(data.getTitle());
        if (data.getStartsAt() != null) existing.setStartsAt(data.getStartsAt());
        existing.setDescription(data.getDescription());
        existing.setLocation(data.getLocation());
        existing.setCustomerId(data.getCustomerId());
        existing.setCustomerName(data.getCustomerName());

        // Verschobener Termin heißt: die Erinnerungen gelten wieder als offen.
        if (moved) existing.setRemindersSentDays(null);

        return repository.save(existing);
    }

    public void delete(UUID id) {
        repository.deleteById(id);
    }

    // ── Erinnerungen ──────────────────────────────────────────────────

    /**
     * Verschickt alle fälligen Erinnerungen. Wird vom Zeitplan aufgerufen.
     *
     * @return Anzahl der verschickten Nachrichten
     */
    public int sendDueReminders(LocalDateTime now) {
        if (!ntfy.isEnabled()) return 0;

        int sent = 0;
        for (Appointment appointment : repository.findByStartsAtAfterOrderByStartsAtAsc(now)) {
            for (int days : dueReminderDays(appointment, now)) {
                if (ntfy.send(reminderTitle(days), reminderBody(appointment))) {
                    markSent(appointment, days);
                    repository.save(appointment);
                    sent++;
                    log.info("Erinnerung verschickt: '{}' ({} Tage vorher)", appointment.getTitle(), days);
                }
            }
        }
        return sent;
    }

    /** Vorlaufzeiten, deren Fenster gerade offen ist und die noch nicht raus sind. */
    List<Integer> dueReminderDays(Appointment appointment, LocalDateTime now) {
        if (appointment.getStartsAt() == null || !now.isBefore(appointment.getStartsAt())) {
            return List.of();
        }
        Set<Integer> alreadySent = sentDays(appointment);

        return reminderDays.stream()
                .filter(d -> !alreadySent.contains(d))
                .filter(d -> {
                    LocalDateTime opens = windowOpensAt(appointment, d);
                    return !now.isBefore(opens) && now.isBefore(opens.plusDays(1));
                })
                .toList();
    }

    LocalDateTime windowOpensAt(Appointment appointment, int daysBefore) {
        return appointment.getStartsAt()
                .toLocalDate()
                .minusDays(daysBefore)
                .atTime(reminderHour, 0);
    }

    static String reminderTitle(int daysBefore) {
        return switch (daysBefore) {
            case 0 -> "Termin heute";
            case 1 -> "Termin morgen";
            default -> "Termin in " + daysBefore + " Tagen";
        };
    }

    static String reminderBody(Appointment appointment) {
        StringBuilder body = new StringBuilder(appointment.getTitle());
        body.append('\n').append(appointment.getStartsAt().format(GERMAN));

        if (appointment.getCustomerName() != null && !appointment.getCustomerName().isBlank()) {
            body.append('\n').append(appointment.getCustomerName());
        }
        if (appointment.getLocation() != null && !appointment.getLocation().isBlank()) {
            body.append('\n').append(appointment.getLocation());
        }
        if (appointment.getDescription() != null && !appointment.getDescription().isBlank()) {
            body.append("\n\n").append(appointment.getDescription());
        }
        return body.toString();
    }

    static Set<Integer> sentDays(Appointment appointment) {
        String raw = appointment.getRemindersSentDays();
        if (raw == null || raw.isBlank()) return Set.of();

        Set<Integer> days = new TreeSet<>();
        for (String part : raw.split(",")) {
            try {
                days.add(Integer.parseInt(part.trim()));
            } catch (NumberFormatException ignored) {
                // Kaputte Altwerte einfach überspringen
            }
        }
        return days;
    }

    static void markSent(Appointment appointment, int daysBefore) {
        Set<Integer> days = new TreeSet<>(sentDays(appointment));
        days.add(daysBefore);
        appointment.setRemindersSentDays(
                days.stream().map(String::valueOf).reduce((a, b) -> a + "," + b).orElse(""));
    }
}
