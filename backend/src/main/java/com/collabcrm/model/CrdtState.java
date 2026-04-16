package com.collabcrm.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;


@Entity
@Table(name = "crdt_state")
@IdClass(CrdtState.CrdtStateId.class)
public class CrdtState {

    /** z.B. "CUSTOMER" — welcher Entity-Typ */
    @Id
    @Column(name = "entity_type", length = 50)
    private String entityType;

    /** z.B. UUID des Kunden — welche konkrete Entity */
    @Id
    @Column(name = "entity_id")
    private UUID entityId;

    /** z.B. "name", "email", "todos", "contactCount" — welches Feld */
    @Id
    @Column(name = "field_name", length = 100)
    private String fieldName;

    /** "LWW", "OR_SET" oder "PN_COUNTER" — damit beim Laden klar ist, wie der JSON deserialisiert wird */
    @Column(name = "crdt_type", length = 20, nullable = false)
    private String crdtType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "state", columnDefinition = "jsonb", nullable = false)
    private String state;

    /** Wird automatisch bei jedem Speichern aktualisiert */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** JPA Lifecycle Hook: Setzt updatedAt automatisch bei INSERT und UPDATE */
    @PrePersist
    @PreUpdate
    void updateTimestamp() {
        updatedAt = Instant.now();
    }


    public String getEntityType() { return entityType; }
    public void setEntityType(String entityType) { this.entityType = entityType; }

    public UUID getEntityId() { return entityId; }
    public void setEntityId(UUID entityId) { this.entityId = entityId; }

    public String getFieldName() { return fieldName; }
    public void setFieldName(String fieldName) { this.fieldName = fieldName; }

    public String getCrdtType() { return crdtType; }
    public void setCrdtType(String crdtType) { this.crdtType = crdtType; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public Instant getUpdatedAt() { return updatedAt; }

    public static class CrdtStateId implements Serializable {
        private String entityType;
        private UUID entityId;
        private String fieldName;

        public CrdtStateId() {}

        public CrdtStateId(String entityType, UUID entityId, String fieldName) {
            this.entityType = entityType;
            this.entityId = entityId;
            this.fieldName = fieldName;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof CrdtStateId that)) return false;
            return Objects.equals(entityType, that.entityType)
                    && Objects.equals(entityId, that.entityId)
                    && Objects.equals(fieldName, that.fieldName);
        }

        @Override
        public int hashCode() {
            return Objects.hash(entityType, entityId, fieldName);
        }
    }
}
