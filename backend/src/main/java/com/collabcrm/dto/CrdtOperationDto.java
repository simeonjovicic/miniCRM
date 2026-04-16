package com.collabcrm.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = CrdtOperationDto.LwwUpdate.class, name = "LWW_UPDATE"),
    @JsonSubTypes.Type(value = CrdtOperationDto.OrSetAdd.class, name = "OR_SET_ADD"),
    @JsonSubTypes.Type(value = CrdtOperationDto.OrSetRemove.class, name = "OR_SET_REMOVE"),
    @JsonSubTypes.Type(value = CrdtOperationDto.PnCounterIncrement.class, name = "PN_COUNTER_INCREMENT"),
    @JsonSubTypes.Type(value = CrdtOperationDto.PnCounterDecrement.class, name = "PN_COUNTER_DECREMENT"),
})
public sealed class CrdtOperationDto
        permits CrdtOperationDto.LwwUpdate, CrdtOperationDto.OrSetAdd, CrdtOperationDto.OrSetRemove,
                CrdtOperationDto.PnCounterIncrement, CrdtOperationDto.PnCounterDecrement {

    private String entityType;  // z.B. "CUSTOMER" — welcher Entity-Typ
    private String entityId;    // z.B. UUID des Kunden — welche Entity
    private String nodeId;      // z.B. "client-abc123" — welcher Client hat die Änderung gemacht
    private long timestamp;     // Lamport-Timestamp — logische Uhr statt Systemzeit

    public String getEntityType() { return entityType; }
    public void setEntityType(String entityType) { this.entityType = entityType; }

    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }

    public String getNodeId() { return nodeId; }
    public void setNodeId(String nodeId) { this.nodeId = nodeId; }

    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }

    /**
     * LWW-Register Update: Setzt ein einzelnes Feld auf einen neuen Wert.
     * z.B. Kundenname ändern: field="name", value="Jenny Cai"
     */
    public static final class LwwUpdate extends CrdtOperationDto {
        private String field;   // Welches Feld (name, email, company, phone, status)
        private Object value;   // Der neue Wert

        public String getField() { return field; }
        public void setField(String field) { this.field = field; }

        public Object getValue() { return value; }
        public void setValue(Object value) { this.value = value; }
    }

    /**
     * OR-Set Add: Fügt ein Element zu einer Menge hinzu (z.B. ein neues Todo).
     * Erzeugt einen neuen Dot (nodeId + timestamp) im OR-Set.
     */
    public static final class OrSetAdd extends CrdtOperationDto {
        private String elementId;  // Eindeutige ID des Elements (UUID)
        private Object value;      // Der Inhalt des Elements (z.B. Todo-Text)

        public String getElementId() { return elementId; }
        public void setElementId(String elementId) { this.elementId = elementId; }

        public Object getValue() { return value; }
        public void setValue(Object value) { this.value = value; }
    }

    /**
     * OR-Set Remove: Entfernt ein Element aus der Menge.
     * Verschiebt alle bekannten Add-Dots zu Remove-Dots.
     */
    public static final class OrSetRemove extends CrdtOperationDto {
        private String elementId;  // ID des zu entfernenden Elements

        public String getElementId() { return elementId; }
        public void setElementId(String elementId) { this.elementId = elementId; }
    }

    /**
     * PN-Counter Increment: Erhöht den Zähler um 1 für den sendenden Node.
     * z.B. Kontaktaufnahmen-Zähler eines Kunden erhöhen.
     */
    public static final class PnCounterIncrement extends CrdtOperationDto {
        private String field;  // Welcher Counter (z.B. "contactCount")

        public String getField() { return field; }
        public void setField(String field) { this.field = field; }
    }

    /**
     * PN-Counter Decrement: Verringert den Zähler um 1 für den sendenden Node.
     */
    public static final class PnCounterDecrement extends CrdtOperationDto {
        private String field;

        public String getField() { return field; }
        public void setField(String field) { this.field = field; }
    }
}
