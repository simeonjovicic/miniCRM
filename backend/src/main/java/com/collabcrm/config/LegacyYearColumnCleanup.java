package com.collabcrm.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Entfernt beim Start die Spalte "year", die in finance_settings und
 * finance_external_revenue aus der Zeit vor der Umbenennung auf fiscal_year
 * stehengeblieben ist.
 *
 * Warum das nötig ist: "year" ist in H2 ein reserviertes Wort, deshalb heisst
 * die Spalte im Entity inzwischen fiscal_year. ddl-auto=update legt eine
 * umbenannte Spalte aber nur NEU an — die alte bleibt samt ihrer NOT-NULL-Regel
 * stehen. In PostgreSQL, wo die Tabellen schon vorher existierten, schlägt
 * seitdem jedes Speichern fehl: Hibernate füllt nur noch fiscal_year, und die
 * verwaiste Spalte year lehnt den NULL-Wert ab. Bei finance_settings ist sie
 * zusätzlich der Primärschlüssel, der damit ebenfalls am falschen Feld hängt.
 *
 * Läuft absichtlich als Startschritt und nicht als Handgriff auf dem Server:
 * dieselbe Altlast steckt in jeder Datenbank, die vor der Umbenennung angelegt
 * wurde — lokal wie auf dem Pi.
 *
 * Idempotent: fehlt eine der beiden Spalten, passiert nichts. Auf einer frisch
 * erzeugten Datenbank (und damit in den Tests gegen H2) gibt es die Altlast nie,
 * dort ist der Lauf ein No-op.
 */
@Component
public class LegacyYearColumnCleanup implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacyYearColumnCleanup.class);

    private final JdbcTemplate jdbc;

    public LegacyYearColumnCleanup(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        // finance_settings trägt den Primärschlüssel auf der Altlast — er muss
        // hinterher auf fiscal_year sitzen, sonst wäre das Jahr nicht mehr eindeutig.
        cleanUp("finance_settings", true);
        cleanUp("finance_external_revenue", false);
    }

    private void cleanUp(String table, boolean restorePrimaryKey) {
        if (!hasColumn(table, "year") || !hasColumn(table, "fiscal_year")) {
            return;
        }

        // Erst retten, was nur in der alten Spalte steht, dann löschen. Auf einer
        // leeren Tabelle ist das ein Nulldurchlauf, auf einer befüllten der
        // Unterschied zwischen Umzug und Datenverlust.
        jdbc.update("update " + table + " set fiscal_year = \"year\" where fiscal_year is null");
        // Der Primärschlüssel und die alte Unique-Regel hängen an der Spalte und
        // verschwinden in PostgreSQL mit ihr.
        jdbc.execute("alter table " + table + " drop column \"year\"");

        if (restorePrimaryKey && !hasPrimaryKey(table)) {
            jdbc.execute("alter table " + table + " add primary key (fiscal_year)");
        }

        log.info("Altlast entfernt: Spalte year aus {} gelöscht, fiscal_year gilt", table);
    }

    private boolean hasColumn(String table, String column) {
        Integer found = jdbc.queryForObject(
                "select count(*) from information_schema.columns "
                        + "where lower(table_name) = ? and lower(column_name) = ?",
                Integer.class, table, column);
        return found != null && found > 0;
    }

    private boolean hasPrimaryKey(String table) {
        Integer found = jdbc.queryForObject(
                "select count(*) from information_schema.table_constraints "
                        + "where lower(table_name) = ? and constraint_type = 'PRIMARY KEY'",
                Integer.class, table);
        return found != null && found > 0;
    }
}
