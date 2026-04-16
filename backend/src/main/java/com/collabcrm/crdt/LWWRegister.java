package com.collabcrm.crdt;

import java.util.Objects;

/**
 * LWW-Register (Last-Writer-Wins Register) — CRDT für einzelne Werte.
 */
public class LWWRegister<T> {

    private T value;       // Der aktuelle Wert (z.B. "Jenny Cai")
    private long timestamp; // Lamport-Timestamp der letzten Änderung
    private String nodeId;  // Wer hat die letzte Änderung gemacht (z.B. "client-abc123")

    public LWWRegister(T value, long timestamp, String nodeId) {
        this.value = value;
        this.timestamp = timestamp;
        this.nodeId = Objects.requireNonNull(nodeId);
    }

    public void set(T newValue, long newTimestamp, String newNodeId) {
        if (newTimestamp > this.timestamp
                || (newTimestamp == this.timestamp && newNodeId.compareTo(this.nodeId) > 0)) {
            this.value = newValue;
            this.timestamp = newTimestamp;
            this.nodeId = newNodeId;
        }
    }

    public void merge(LWWRegister<T> other) {
        set(other.value, other.timestamp, other.nodeId);
    }

    public T value() {
        return value;
    }

    public long timestamp() {
        return timestamp;
    }

    public String nodeId() {
        return nodeId;
    }

    /**
     * Erstellt eine unabhängige Kopie dieses Registers (für Tests und Merge-Operationen).
     */
    public LWWRegister<T> copy() {
        return new LWWRegister<>(value, timestamp, nodeId);
    }
}
