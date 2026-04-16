package com.collabcrm.crdt;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PNCounterTest {

    @Test
    void startsAtZero() {
        var counter = new PNCounter();
        assertThat(counter.value()).isEqualTo(0);
    }

    @Test
    void incrementFromSingleNode() {
        var counter = new PNCounter();
        counter.increment("A");
        counter.increment("A");
        counter.increment("A");
        assertThat(counter.value()).isEqualTo(3);
    }

    @Test
    void decrementFromSingleNode() {
        var counter = new PNCounter();
        counter.increment("A");
        counter.increment("A");
        counter.decrement("A");
        assertThat(counter.value()).isEqualTo(1);
    }

    @Test
    void valueCanBeNegative() {
        var counter = new PNCounter();
        counter.decrement("A");
        counter.decrement("A");
        assertThat(counter.value()).isEqualTo(-2);
    }

    @Test
    void multipleNodes() {
        var counter = new PNCounter();
        counter.increment("A");
        counter.increment("A");
        counter.increment("B");
        counter.decrement("B");
        // A: +2, B: +1-1 = 0 → total = 2
        assertThat(counter.value()).isEqualTo(2);
    }

    // --- Merge tests ---

    @Test
    void mergeFromTwoNodes() {
        var c1 = new PNCounter();
        var c2 = new PNCounter();

        c1.increment("A");
        c1.increment("A");

        c2.increment("B");
        c2.increment("B");
        c2.increment("B");

        c1.merge(c2);
        assertThat(c1.value()).isEqualTo(5); // A:2 + B:3
    }

    @Test
    void mergeIsCommutative() {
        var c1 = new PNCounter();
        var c2 = new PNCounter();

        c1.increment("A");
        c1.increment("A");
        c1.decrement("A");

        c2.increment("B");
        c2.decrement("B");
        c2.decrement("B");

        var copy1 = c1.copy();
        var copy2 = c2.copy();

        copy1.merge(copy2);
        copy2.merge(copy1);

        assertThat(copy1.value()).isEqualTo(copy2.value());
    }

    @Test
    void mergeIsIdempotent() {
        var c1 = new PNCounter();
        var c2 = new PNCounter();

        c1.increment("A");
        c2.increment("B");

        c1.merge(c2);
        long afterFirst = c1.value();

        c1.merge(c2);
        assertThat(c1.value()).isEqualTo(afterFirst);
    }

    @Test
    void mergeIsAssociative() {
        var a = new PNCounter();
        var b = new PNCounter();
        var c = new PNCounter();

        a.increment("A");
        a.increment("A");
        b.increment("B");
        b.decrement("B");
        c.increment("C");

        // (a merge b) merge c
        var ab_c = a.copy();
        ab_c.merge(b.copy());
        ab_c.merge(c.copy());

        // a merge (b merge c)
        var bc = b.copy();
        bc.merge(c.copy());
        var a_bc = a.copy();
        a_bc.merge(bc);

        assertThat(ab_c.value()).isEqualTo(a_bc.value());
    }

    // --- Concurrency scenarios ---

    @Test
    void concurrentIncrementsOnSameNode() {
        // Two replicas both increment for node-A independently
        var c1 = new PNCounter();
        var c2 = new PNCounter();

        c1.increment("A");
        c1.increment("A");
        c1.increment("A"); // A has count 3 on c1

        c2.increment("A");
        c2.increment("A"); // A has count 2 on c2

        c1.merge(c2);
        c2.merge(c1);

        // Merge takes max per node: max(3, 2) = 3
        assertThat(c1.value()).isEqualTo(3);
        assertThat(c2.value()).isEqualTo(3);
    }

    @Test
    void concurrentIncrementAndDecrement() {
        // Node A increments, Node B decrements — both concurrently
        var c1 = new PNCounter();
        var c2 = new PNCounter();

        c1.increment("A");
        c1.increment("A");

        c2.decrement("B");

        c1.merge(c2);
        c2.merge(c1);

        // A: +2, B: -1 → value = 1
        assertThat(c1.value()).isEqualTo(1);
        assertThat(c2.value()).isEqualTo(1);
    }

    @Test
    void threeNodeConcurrentScenario() {
        var c1 = new PNCounter();
        var c2 = new PNCounter();
        var c3 = new PNCounter();

        c1.increment("A");
        c1.increment("A");
        c1.increment("A"); // A: +3

        c2.increment("B");
        c2.decrement("B"); // B: +1, -1

        c3.decrement("C");
        c3.decrement("C"); // C: -2

        // Merge all into all
        var m1 = c1.copy(); m1.merge(c2.copy()); m1.merge(c3.copy());
        var m2 = c2.copy(); m2.merge(c1.copy()); m2.merge(c3.copy());
        var m3 = c3.copy(); m3.merge(c1.copy()); m3.merge(c2.copy());

        // A:+3, B:+1-1, C:-2 → 3 + 0 - 2 = 1
        assertThat(m1.value()).isEqualTo(1);
        assertThat(m2.value()).isEqualTo(1);
        assertThat(m3.value()).isEqualTo(1);
    }

    @Test
    void mergeTakeMaxNotSum() {
        // Verify that merge does NOT sum counts — it takes the max per node
        var c1 = new PNCounter();
        c1.increment("A");
        c1.increment("A"); // A: 2

        var c2 = c1.copy(); // c2 also has A: 2

        c1.increment("A"); // c1 now has A: 3

        c1.merge(c2);
        // Should be max(3, 2) = 3, NOT 3+2 = 5
        assertThat(c1.value()).isEqualTo(3);
    }
}
