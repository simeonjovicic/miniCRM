package com.collabcrm.repository;

import com.collabcrm.model.CrdtState;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Repository für CRDT-State Persistierung.
 * Composite Key: (entityType, entityId, fieldName)
 *
 * Spring Data JPA generiert die SQL-Queries automatisch aus den Methodennamen.
 */
public interface CrdtStateRepository extends JpaRepository<CrdtState, CrdtState.CrdtStateId> {

    /** Alle CRDT-States einer Entity laden (z.B. alle Felder eines Kunden). */
    List<CrdtState> findByEntityTypeAndEntityId(String entityType, UUID entityId);
}
