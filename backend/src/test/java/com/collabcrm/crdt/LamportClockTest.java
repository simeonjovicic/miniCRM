package com.collabcrm.crdt;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LamportClockTest {

    @Test
    void tickIncrementsMonotonically() {
        var clock = new LamportClock();
        assertThat(clock.tick()).isEqualTo(1);
        assertThat(clock.tick()).isEqualTo(2);
        assertThat(clock.tick()).isEqualTo(3);
    }

    @Test
    void receiveAdvancesPastReceivedValue() {
        var clock = new LamportClock();
        clock.tick(); // 1

        long result = clock.receive(10);
        assertThat(result).isEqualTo(11);
        assertThat(clock.current()).isEqualTo(11);
    }

    @Test
    void receiveIgnoresLowerValue() {
        var clock = new LamportClock(10);

        long result = clock.receive(5);
        assertThat(result).isEqualTo(11); // max(10, 5) + 1
    }

    @Test
    void initialValueIsRespected() {
        var clock = new LamportClock(42);
        assertThat(clock.current()).isEqualTo(42);
        assertThat(clock.tick()).isEqualTo(43);
    }
}
