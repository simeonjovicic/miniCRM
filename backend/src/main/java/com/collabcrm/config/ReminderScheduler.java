package com.collabcrm.config;

import com.collabcrm.service.AppointmentService;
import com.collabcrm.service.DailyDigestService;
import com.collabcrm.service.TodoService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.LocalDateTime;

/**
 * Prüft regelmäßig, ob eine Termin-Erinnerung fällig ist, und schickt sie raus.
 *
 * Läuft alle 15 Minuten statt punktgenau zur Erinnerungsstunde: die Fälligkeit
 * hängt an einem 24-Stunden-Fenster, nicht an einem exakten Zeitpunkt. Der Pi
 * darf also neu starten oder kurz aus sein, ohne dass eine Erinnerung ausfällt.
 */
@Configuration
@EnableScheduling
public class ReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    private final AppointmentService appointmentService;
    private final DailyDigestService dailyDigestService;
    private final TodoService todoService;

    public ReminderScheduler(AppointmentService appointmentService,
                             DailyDigestService dailyDigestService,
                             TodoService todoService) {
        this.appointmentService = appointmentService;
        this.dailyDigestService = dailyDigestService;
        this.todoService = todoService;
    }

    /**
     * Ein Durchlauf für alles Wiederkehrende. Jeder Schritt ist für sich
     * abgesichert: geht einer schief, laufen die anderen trotzdem — sonst
     * würde ein Aussetzer beim Push die Wiederholungen mit blockieren.
     */
    @Scheduled(fixedDelayString = "${reminders.check-interval-ms:900000}", initialDelay = 30_000)
    public void run() {
        LocalDateTime now = LocalDateTime.now();

        safely("Termin-Erinnerungen", () -> appointmentService.sendDueReminders(now));
        safely("Morgen-Übersicht", () -> dailyDigestService.sendIfDue(now));
        safely("Wiederkehrende Todos", () -> todoService.spawnOverdueRecurrences(now.toLocalDate()));
    }

    private void safely(String label, Runnable step) {
        try {
            step.run();
        } catch (Exception e) {
            log.warn("{} fehlgeschlagen: {}", label, e.getMessage());
        }
    }
}
