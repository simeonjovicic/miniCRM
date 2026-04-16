package com.collabcrm.crdt;

/**
 * Lamport Clock — Logische Uhr für verteilte Systeme.

 */
public class LamportClock {

    private long counter;

    public LamportClock() {
        this.counter = 0;
    }

    public LamportClock(long initial) {
        this.counter = initial;
    }


    public synchronized long tick() {
        return ++counter;
    }


    public synchronized long receive(long received) {
        counter = Math.max(counter, received) + 1;
        return counter;
    }


    public synchronized long current() {
        return counter;
    }
}
