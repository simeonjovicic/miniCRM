package com.collabcrm.crdt;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LWWRegisterTest {

    @Test
    void initialValue() {
        var reg = new LWWRegister<>("hello", 1, "A");
        assertThat(reg.value()).isEqualTo("hello");
        assertThat(reg.timestamp()).isEqualTo(1);
        assertThat(reg.nodeId()).isEqualTo("A");
    }

    @Test
    void setWithHigherTimestampWins() {
        var reg = new LWWRegister<>("old", 1, "A");
        reg.set("new", 2, "A");
        assertThat(reg.value()).isEqualTo("new");
    }

    @Test
    void setWithLowerTimestampIsIgnored() {
        var reg = new LWWRegister<>("current", 5, "A");
        reg.set("old", 3, "A");
        assertThat(reg.value()).isEqualTo("current");
    }

    @Test
    void equalTimestampHigherNodeIdWins() {
        var reg = new LWWRegister<>("fromA", 5, "A");
        reg.set("fromB", 5, "B");
        assertThat(reg.value()).isEqualTo("fromB"); // B > A lexicographically
    }

    @Test
    void equalTimestampLowerNodeIdLoses() {
        var reg = new LWWRegister<>("fromB", 5, "B");
        reg.set("fromA", 5, "A");
        assertThat(reg.value()).isEqualTo("fromB"); // A < B, so B keeps winning
    }

    // --- Merge tests ---

    @Test
    void mergeHigherTimestampWins() {
        var r1 = new LWWRegister<>("v1", 1, "A");
        var r2 = new LWWRegister<>("v2", 2, "B");

        r1.merge(r2);
        assertThat(r1.value()).isEqualTo("v2");
    }

    @Test
    void mergeIsCommutative() {
        var r1 = new LWWRegister<>("v1", 3, "A");
        var r2 = new LWWRegister<>("v2", 5, "B");

        var copy1 = r1.copy();
        var copy2 = r2.copy();

        copy1.merge(copy2);
        copy2.merge(copy1);

        assertThat(copy1.value()).isEqualTo(copy2.value());
        assertThat(copy1.timestamp()).isEqualTo(copy2.timestamp());
    }

    @Test
    void mergeIsIdempotent() {
        var r1 = new LWWRegister<>("v1", 1, "A");
        var r2 = new LWWRegister<>("v2", 2, "B");

        r1.merge(r2);
        String afterFirst = r1.value();

        r1.merge(r2);
        assertThat(r1.value()).isEqualTo(afterFirst);
    }

    @Test
    void mergeIsAssociative() {
        var a = new LWWRegister<>("a", 1, "A");
        var b = new LWWRegister<>("b", 2, "B");
        var c = new LWWRegister<>("c", 3, "C");

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
    void concurrentUpdatesWithSameTimestampResolvedByNodeId() {
        // Two nodes update "simultaneously" with the same Lamport timestamp
        var r1 = new LWWRegister<>("initial", 0, "X");
        var r2 = new LWWRegister<>("initial", 0, "X");

        r1.set("alice-edit", 5, "node-A");
        r2.set("bob-edit", 5, "node-B");

        r1.merge(r2);
        r2.merge(r1);

        // Both converge: node-B > node-A, so bob-edit wins
        assertThat(r1.value()).isEqualTo("bob-edit");
        assertThat(r2.value()).isEqualTo("bob-edit");
    }

    @Test
    void threeWayConcurrentMerge() {
        var r1 = new LWWRegister<>("init", 0, "X");
        var r2 = r1.copy();
        var r3 = r1.copy();

        r1.set("from-A", 3, "A");
        r2.set("from-B", 3, "B");
        r3.set("from-C", 2, "C");

        // Merge all into each
        r1.merge(r2);
        r1.merge(r3);

        r2.merge(r1);
        r2.merge(r3);

        r3.merge(r1);
        r3.merge(r2);

        // All must converge: ts=3, B > A, so from-B wins
        assertThat(r1.value()).isEqualTo("from-B");
        assertThat(r2.value()).isEqualTo("from-B");
        assertThat(r3.value()).isEqualTo("from-B");
    }
}
