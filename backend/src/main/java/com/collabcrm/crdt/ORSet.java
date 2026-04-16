package com.collabcrm.crdt;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * OR-Set (Observed-Remove Set) — CRDT für Mengen mit Add-Wins-Semantik.

 */
public class ORSet<T> {

    /**
     * Ein Dot identifiziert ein einzelnes Add-Event eindeutig.
     * Kombination aus nodeId (wer) und timestamp (wann) ist immer einzigartig.
     */
    public record Dot(String nodeId, long timestamp) {}


    public static class Entry<T> {
        public final T value;
        public final Set<Dot> addDots = new HashSet<>();     // Alle Add-Events
        public final Set<Dot> removeDots = new HashSet<>();   // Alle Remove-Events (beobachtete Dots)

        Entry(T value) {
            this.value = value;
        }


        boolean isAlive() {
            var surviving = new HashSet<>(addDots);
            surviving.removeAll(removeDots);
            return !surviving.isEmpty();
        }


        Entry<T> copy() {
            var e = new Entry<>(value);
            e.addDots.addAll(addDots);
            e.removeDots.addAll(removeDots);
            return e;
        }
    }


    private final Map<UUID, Entry<T>> entries = new ConcurrentHashMap<>();

    /**
     * Fügt ein neues Element mit zufälliger ID hinzu.
     * Erzeugt einen neuen Dot (nodeId + timestamp) als Add-Event.
     * Wird vom lokalen User aufgerufen wenn er ein Todo erstellt.
     */
    public UUID add(T element, String nodeId, long timestamp) {
        var id = UUID.randomUUID();
        var entry = new Entry<>(element);
        entry.addDots.add(new Dot(nodeId, timestamp));
        entries.put(id, entry);
        return id;
    }

    /**
     * Fügt ein Element mit expliziter ID hinzu (für Replikation).
     * Wird aufgerufen wenn eine Operation von einem anderen Node empfangen wird.
     * compute() ist atomar → kein Race Condition bei gleichzeitigen Operationen.
     */
    public void add(UUID elementId, T element, String nodeId, long timestamp) {
        entries.compute(elementId, (id, existing) -> {
            if (existing == null) {
                existing = new Entry<>(element);
            }
            existing.addDots.add(new Dot(nodeId, timestamp));
            return existing;
        });
    }


    public void remove(UUID elementId) {
        var entry = entries.get(elementId);
        if (entry != null) {
            entry.removeDots.addAll(entry.addDots);
        }
    }

    /**
     * Entfernt spezifische Dots (für Merge/Replikation).
     * Der Remote-Node teilt mit, welche Dots ER gesehen und entfernt hat.
     */
    public void remove(UUID elementId, Set<Dot> observedDots) {
        var entry = entries.get(elementId);
        if (entry != null) {
            entry.removeDots.addAll(observedDots);
        }
    }


    public Set<T> value() {
        var result = new HashSet<T>();
        for (var entry : entries.values()) {
            if (entry.isAlive()) {
                result.add(entry.value);
            }
        }
        return result;
    }


     // REST-Endpunkt  Todo-Liste eines Kunden zu liefern.

    public Map<UUID, T> elements() {
        var result = new LinkedHashMap<UUID, T>();
        for (var e : entries.entrySet()) {
            if (e.getValue().isAlive()) {
                result.put(e.getKey(), e.getValue().value);
            }
        }
        return result;
    }


    public void merge(ORSet<T> other) {
        for (var e : other.entries.entrySet()) {
            entries.compute(e.getKey(), (id, existing) -> {
                if (existing == null) {
                    return e.getValue().copy();
                }
                existing.addDots.addAll(e.getValue().addDots);
                existing.removeDots.addAll(e.getValue().removeDots);
                return existing;
            });
        }
    }

    // Für tests
    public ORSet<T> copy() {
        var result = new ORSet<T>();
        for (var e : entries.entrySet()) {
            result.entries.put(e.getKey(), e.getValue().copy());
        }
        return result;
    }


    public int size() {
        return (int) entries.values().stream().filter(Entry::isAlive).count();
    }

    public Map<UUID, Entry<T>> rawEntries() {
        return entries;
    }
}
