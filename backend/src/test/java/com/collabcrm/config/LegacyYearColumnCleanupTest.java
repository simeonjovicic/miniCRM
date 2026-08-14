package com.collabcrm.config;

import com.collabcrm.model.FinanceSettings;
import com.collabcrm.repository.FinanceSettingsRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Die Altlast, um die es geht, entsteht nur in einer Datenbank, die vor der
 * Umbenennung year → fiscal_year angelegt wurde. H2 baut das Schema im Test
 * frisch aus dem Entity, deshalb wird der alte Zustand hier von Hand
 * nachgestellt — sonst prüfte der Test nichts.
 */
@SpringBootTest
class LegacyYearColumnCleanupTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private LegacyYearColumnCleanup cleanup;
    @Autowired private FinanceSettingsRepository settings;

    @Test
    void entferntDieAlteSpalteUndLaesstSpeichernWiederZu() {
        settings.deleteAll();
        // "year" ist in H2 reserviert und muss deshalb in Anfuehrungszeichen stehen —
        // genau der Grund, aus dem die Spalte einst umbenannt wurde.
        jdbc.execute("alter table finance_settings add column \"year\" int not null default 0");

        cleanup.run(null);

        assertThat(spalteVorhanden()).isFalse();

        // Der eigentliche Beweis: mit der Altlast schlug jedes Speichern fehl.
        settings.save(new FinanceSettings(
                2026, new BigDecimal("7000.00"), new BigDecimal("60000.00"), "GROSS"));

        assertThat(settings.findById(2026)).isPresent();
    }

    @Test
    void laeuftOhneAltlastFolgenlosDurch() {
        assertThat(spalteVorhanden()).isFalse();

        cleanup.run(null);

        assertThat(spalteVorhanden()).isFalse();
    }

    private boolean spalteVorhanden() {
        Integer found = jdbc.queryForObject(
                "select count(*) from information_schema.columns "
                        + "where lower(table_name) = 'finance_settings' and lower(column_name) = 'year'",
                Integer.class);
        return found != null && found > 0;
    }
}
