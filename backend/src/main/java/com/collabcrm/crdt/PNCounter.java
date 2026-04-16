package com.collabcrm.crdt;

import java.util.HashMap;
import java.util.Map;

/**
 * PN-Counter (Positive-Negative Counter) — CRDT für Zähler.
 */
public class PNCounter {

    private final Map<String, Long> increments;
    private final Map<String, Long> decrements;

    public PNCounter() {
        this.increments = new HashMap<>();
        this.decrements = new HashMap<>();
    }

    private PNCounter(Map<String, Long> increments, Map<String, Long> decrements) {
        this.increments = new HashMap<>(increments);
        this.decrements = new HashMap<>(decrements);
    }

    public void increment(String nodeId) {
        increments.merge(nodeId, 1L, Long::sum);
    }

    public void decrement(String nodeId) {
        decrements.merge(nodeId, 1L, Long::sum);
    }


    public long value() {
        long inc = increments.values().stream().mapToLong(Long::longValue).sum();
        long dec = decrements.values().stream().mapToLong(Long::longValue).sum();
        return inc - dec;
    }


    public void merge(PNCounter other) {
        for (var e : other.increments.entrySet()) {
            increments.merge(e.getKey(), e.getValue(), Math::max);
        }
        for (var e : other.decrements.entrySet()) {
            decrements.merge(e.getKey(), e.getValue(), Math::max);
        }
    }

    // für Tests
    public PNCounter copy() {
        return new PNCounter(increments, decrements);
    }

    public Map<String, Long> increments() {
        return Map.copyOf(increments);
    }

    public Map<String, Long> decrements() {
        return Map.copyOf(decrements);
    }
}
