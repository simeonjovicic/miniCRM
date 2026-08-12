package com.collabcrm.repository;

import com.collabcrm.model.Appointment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface AppointmentRepository extends JpaRepository<Appointment, UUID> {

    /** Alle Termine, die nächsten zuerst. */
    List<Appointment> findAllByOrderByStartsAtAsc();

    /**
     * Termine, die noch bevorstehen — nur für die kann eine Erinnerung fällig
     * sein. Vergangene werden vom Scheduler gar nicht erst betrachtet.
     */
    List<Appointment> findByStartsAtAfterOrderByStartsAtAsc(LocalDateTime from);
}
