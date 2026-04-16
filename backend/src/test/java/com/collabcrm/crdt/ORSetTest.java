package com.collabcrm.crdt;

import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ORSetTest {

    @Test
    void addAndRetrieve() {
        var set = new ORSet<String>();
        set.add("todo-1", "node-A", 1);
        set.add("todo-2", "node-A", 2);

        assertThat(set.value()).containsExactlyInAnyOrder("todo-1", "todo-2");
        assertThat(set.size()).isEqualTo(2);
    }

    @Test
    void removeByElementId() {
        var set = new ORSet<String>();
        UUID id = set.add("todo-1", "node-A", 1);
        set.add("todo-2", "node-A", 2);

        set.remove(id);

        assertThat(set.value()).containsExactly("todo-2");
    }

    @Test
    void removeNonexistentIsNoOp() {
        var set = new ORSet<String>();
        set.add("todo-1", "node-A", 1);

        set.remove(UUID.randomUUID()); // should not throw

        assertThat(set.value()).containsExactly("todo-1");
    }

    // --- Merge tests ---

    @Test
    void mergeAddsFromBothSides() {
        var s1 = new ORSet<String>();
        var s2 = new ORSet<String>();

        s1.add("todo-1", "node-A", 1);
        s2.add("todo-2", "node-B", 1);

        s1.merge(s2);

        assertThat(s1.value()).containsExactlyInAnyOrder("todo-1", "todo-2");
    }

    @Test
    void mergeIsCommutative() {
        var s1 = new ORSet<String>();
        var s2 = new ORSet<String>();

        s1.add("a", "node-A", 1);
        s2.add("b", "node-B", 1);

        var c1 = s1.copy();
        var c2 = s2.copy();

        c1.merge(c2);
        c2.merge(c1);

        assertThat(c1.value()).isEqualTo(c2.value());
    }

    @Test
    void mergeIsIdempotent() {
        var s1 = new ORSet<String>();
        var s2 = new ORSet<String>();

        s1.add("a", "node-A", 1);
        s2.add("b", "node-B", 1);

        s1.merge(s2);
        Set<String> afterFirst = Set.copyOf(s1.value());

        s1.merge(s2);
        assertThat(s1.value()).isEqualTo(afterFirst);
    }

    @Test
    void mergeIsAssociative() {
        var a = new ORSet<String>();
        var b = new ORSet<String>();
        var c = new ORSet<String>();

        a.add("x", "A", 1);
        b.add("y", "B", 1);
        c.add("z", "C", 1);

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
    void concurrentAddAndRemove_addWins() {
        // Setup: both replicas see "todo-1"
        var s1 = new ORSet<String>();
        UUID elemId = s1.add("todo-1", "node-A", 1);
        var s2 = s1.copy();

        // Node A removes the element
        s1.remove(elemId);
        // Concurrently, Node B re-adds the same element with a new dot
        s2.add(elemId, "todo-1", "node-B", 2);

        // Merge both ways
        s1.merge(s2);
        s2.merge(s1);

        // Add-wins: the concurrent add created a new dot that the remove didn't see
        assertThat(s1.value()).contains("todo-1");
        assertThat(s1.value()).isEqualTo(s2.value());
    }

    @Test
    void concurrentRemoveOnBothSides() {
        // Both replicas have the element, both remove it
        var s1 = new ORSet<String>();
        UUID id = s1.add("todo-1", "node-A", 1);
        var s2 = s1.copy();

        s1.remove(id);
        s2.remove(id);

        s1.merge(s2);
        s2.merge(s1);

        // Both removed → element is gone
        assertThat(s1.value()).isEmpty();
        assertThat(s2.value()).isEmpty();
    }

    @Test
    void concurrentAddsSameValue() {
        // Two nodes add the same value independently
        var s1 = new ORSet<String>();
        var s2 = new ORSet<String>();

        s1.add("todo-1", "node-A", 1);
        s2.add("todo-1", "node-B", 1);

        s1.merge(s2);
        s2.merge(s1);

        // Both are present (as separate entries, but value() deduplicates)
        assertThat(s1.value()).containsExactly("todo-1");
        assertThat(s2.value()).containsExactly("todo-1");
    }

    @Test
    void removeOnlyAffectsObservedDots() {
        // Node A adds element at t=1
        var s1 = new ORSet<String>();
        UUID id = s1.add("item", "node-A", 1);
        var s2 = s1.copy();

        // Node A adds a new dot at t=3 (re-assertion)
        s1.add(id, "item", "node-A", 3);

        // Node B, which only saw the t=1 dot, removes
        s2.remove(id);

        // Merge: Node A's t=3 dot survives because B never observed it
        s1.merge(s2);
        assertThat(s1.value()).contains("item");
    }

    @Test
    void threeNodeConcurrentScenario() {
        var s1 = new ORSet<String>();
        var s2 = new ORSet<String>();
        var s3 = new ORSet<String>();

        // Each node adds a different element
        UUID id1 = s1.add("from-A", "A", 1);
        s2.add("from-B", "B", 1);
        s3.add("from-C", "C", 1);

        // Node 1 removes its own element before merge
        s1.remove(id1);

        // Merge all into all
        var merged1 = s1.copy();
        merged1.merge(s2.copy());
        merged1.merge(s3.copy());

        var merged2 = s2.copy();
        merged2.merge(s1.copy());
        merged2.merge(s3.copy());

        var merged3 = s3.copy();
        merged3.merge(s1.copy());
        merged3.merge(s2.copy());

        // All converge: from-A was removed, from-B and from-C survive
        var expected = Set.of("from-B", "from-C");
        assertThat(merged1.value()).isEqualTo(expected);
        assertThat(merged2.value()).isEqualTo(expected);
        assertThat(merged3.value()).isEqualTo(expected);
    }

    @Test
    void elementsReturnsIdToValueMapping() {
        var set = new ORSet<String>();
        UUID id1 = set.add("a", "node-A", 1);
        UUID id2 = set.add("b", "node-A", 2);

        var elements = set.elements();
        assertThat(elements).containsEntry(id1, "a");
        assertThat(elements).containsEntry(id2, "b");
        assertThat(elements).hasSize(2);
    }
}
