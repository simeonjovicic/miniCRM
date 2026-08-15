package com.collabcrm.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Überführt beim Start die alten Todo-Notizen in Kommentare.
 *
 * Das Notizfeld ist entfallen — Kommentare leisten dasselbe, nur mit Verfasser
 * und Zeitpunkt. Bestehende Notizen wären damit aber unerreichbar geworden:
 * die Spalte bliebe befüllt in der Datenbank stehen, und in der Oberfläche
 * gäbe es nichts mehr, was sie anzeigt. Deshalb wandern sie einmalig um.
 *
 * <p>Als Startschritt und nicht als Handgriff auf dem Server: dieselben Notizen
 * liegen in jeder Datenbank, die vor der Umstellung befüllt wurde — lokal wie
 * auf dem Pi.
 *
 * <p>Idempotent: übernommene Notizen werden geleert, ein zweiter Lauf findet
 * nichts mehr. Auf einer frischen Datenbank ist der Lauf ein No-op, in den
 * Tests gegen H2 also ebenfalls.
 */
@Component
public class LegacyTodoNotesToComments implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacyTodoNotesToComments.class);

    private final JdbcTemplate jdbc;

    public LegacyTodoNotesToComments(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Ein Startschritt, der wirft, verhindert den Start der ganzen Anwendung —
     * das ist einer Datenumstellung nicht angemessen. Schlägt sie fehl, wird
     * das laut protokolliert und die Notizen bleiben stehen, wo sie sind; man
     * kann es nach dem Beheben erneut versuchen.
     */
    @Override
    public void run(ApplicationArguments args) {
        try {
            migrate();
        } catch (Exception e) {
            log.error("Todo-Notizen konnten nicht in Kommentare überführt werden — "
                    + "sie bleiben unangetastet in der Spalte notes: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        if (!hasNotesColumn()) return;

        List<Map<String, Object>> withNotes = jdbc.queryForList(
                "select id, notes, created_by from todos where notes is not null and notes <> ''");
        if (withNotes.isEmpty()) return;

        for (Map<String, Object> row : withNotes) {
            UUID todoId = (UUID) row.get("id");
            String notes = (String) row.get("notes");
            UUID author = (UUID) row.get("created_by");

            jdbc.update("""
                    insert into todo_comments (id, todo_id, text, created_by, created_by_username, created_at)
                    values (?, ?, ?, ?, (select username from users where id = ?), ?)
                    """,
                    UUID.randomUUID(), todoId, notes, author, author,
                    // Timestamp statt Instant: der PostgreSQL-Treiber kann den
                    // SQL-Typ für Instant nicht ableiten und bricht ab.
                    java.sql.Timestamp.from(java.time.Instant.now()));

            // Geleert statt gelöscht: ein zweiter Lauf soll nichts doppeln,
            // die Spalte selbst bleibt als Altlast harmlos stehen.
            jdbc.update("update todos set notes = null where id = ?", todoId);
        }

        log.info("{} Todo-Notizen in Kommentare überführt", withNotes.size());
    }

    private boolean hasNotesColumn() {
        Integer found = jdbc.queryForObject(
                "select count(*) from information_schema.columns "
                        + "where lower(table_name) = 'todos' and lower(column_name) = 'notes'",
                Integer.class);
        return found != null && found > 0;
    }
}
