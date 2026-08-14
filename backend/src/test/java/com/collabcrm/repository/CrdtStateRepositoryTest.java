package com.collabcrm.repository;

import com.collabcrm.model.CrdtState;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Der CRDT-Zustand war lange gar nicht testbar: die Spalte war fest als
 * "jsonb" deklariert, ein Typ den H2 nicht kennt — die Tabelle liess sich im
 * Test nicht anlegen und jeder Zugriff darauf waere gescheitert. Seit der Typ
 * vom Dialekt bestimmt wird, geht es. Diese Tests halten das fest.
 */
@DataJpaTest
class CrdtStateRepositoryTest {

    private static final String LWW_JSON =
            "{\"value\":\"Acme Corp\",\"timestamp\":42,\"nodeId\":\"client-x\"}";

    @Autowired
    private CrdtStateRepository repository;

    private CrdtState state(String entityType, UUID entityId, String field, String json) {
        CrdtState s = new CrdtState();
        s.setEntityType(entityType);
        s.setEntityId(entityId);
        s.setFieldName(field);
        s.setCrdtType("LWW");
        s.setState(json);
        return s;
    }

    @Test
    void jsonZustandUeberstehtSpeichernUndLaden() {
        UUID entityId = UUID.randomUUID();

        repository.save(state("customer", entityId, "name", LWW_JSON));
        repository.flush();

        CrdtState geladen = repository
                .findById(new CrdtState.CrdtStateId("customer", entityId, "name"))
                .orElseThrow();

        assertThat(geladen.getState()).isEqualTo(LWW_JSON);
        assertThat(geladen.getCrdtType()).isEqualTo("LWW");
    }

    @Test
    void derZeitstempelWirdBeimSpeichernGesetzt() {
        UUID entityId = UUID.randomUUID();

        CrdtState gespeichert = repository.saveAndFlush(
                state("customer", entityId, "name", LWW_JSON));

        assertThat(gespeichert.getUpdatedAt()).isNotNull();
    }

    /** Der Schluessel ist dreiteilig — dasselbe Feld an einem anderen Kunden ist ein anderer Eintrag. */
    @Test
    void gleicherFeldnameAnVerschiedenenEntitaetenBleibtGetrennt() {
        UUID ersterKunde = UUID.randomUUID();
        UUID zweiterKunde = UUID.randomUUID();

        repository.save(state("customer", ersterKunde, "name", "{\"value\":\"Acme\"}"));
        repository.save(state("customer", zweiterKunde, "name", "{\"value\":\"Globex\"}"));
        repository.flush();

        assertThat(repository.findByEntityTypeAndEntityId("customer", ersterKunde))
                .singleElement()
                .satisfies(s -> assertThat(s.getState()).contains("Acme"));
        assertThat(repository.findByEntityTypeAndEntityId("customer", zweiterKunde))
                .singleElement()
                .satisfies(s -> assertThat(s.getState()).contains("Globex"));
    }

    @Test
    void alleFelderEinerEntitaetKommenZusammen() {
        UUID entityId = UUID.randomUUID();

        repository.save(state("customer", entityId, "name", "{\"value\":\"Acme\"}"));
        repository.save(state("customer", entityId, "email", "{\"value\":\"a@b.de\"}"));
        repository.flush();

        assertThat(repository.findByEntityTypeAndEntityId("customer", entityId))
                .extracting(CrdtState::getFieldName)
                .containsExactlyInAnyOrder("name", "email");
    }

    @Test
    void einZweitesSpeichernUeberschreibtDenZustand() {
        UUID entityId = UUID.randomUUID();
        repository.saveAndFlush(state("customer", entityId, "name", "{\"value\":\"Alt\"}"));

        repository.saveAndFlush(state("customer", entityId, "name", "{\"value\":\"Neu\"}"));

        assertThat(repository.findByEntityTypeAndEntityId("customer", entityId))
                .singleElement()
                .satisfies(s -> assertThat(s.getState()).contains("Neu"));
    }
}
