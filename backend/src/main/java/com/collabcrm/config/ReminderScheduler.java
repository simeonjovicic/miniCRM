package com.collabcrm.config;

import com.collabcrm.service.AppointmentService;
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

    private final AppointmentService appointmentService;

    public ReminderScheduler(AppointmentService appointmentService) {
        this.appointmentService = appointmentService;
    }

    @Scheduled(fixedDelayString = "${reminders.check-interval-ms:900000}", initialDelay = 30_000)
    public void sendDueReminders() {
        appointmentService.sendDueReminders(LocalDateTime.now());
    }
}
