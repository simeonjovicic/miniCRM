package com.collabcrm.service;

import com.collabcrm.dto.CrdtOperationDto;
import com.collabcrm.dto.CrdtOperationDto.*;
import com.collabcrm.model.CrdtState;
import com.collabcrm.repository.CrdtStateRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CrdtSyncServiceTest {

    @Mock
    private CrdtStateRepository crdtStateRepository;

    @Mock
    private CustomerService customerService;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    private CrdtSyncService service;

    private final String customerId = UUID.randomUUID().toString();

    @BeforeEach
    void setUp() {
        when(crdtStateRepository.findById(any())).thenReturn(Optional.empty());
        when(crdtStateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        service = new CrdtSyncService(crdtStateRepository, customerService, messagingTemplate, new ObjectMapper());
    }

    // --- LWW Register ---

    @Test
    void lwwUpdatePersistsAndBroadcasts() {
        var op = new LwwUpdate();
        op.setEntityType("CUSTOMER");
        op.setEntityId(customerId);
        op.setField("name");
        op.setValue("Acme Corp");
        op.setNodeId("client-A");
        op.setTimestamp(1);

        service.applyOperation(op);

        // Persisted
        var captor = ArgumentCaptor.forClass(CrdtState.class);
        verify(crdtStateRepository).save(captor.capture());
        assertThat(captor.getValue().getCrdtType()).isEqualTo("LWW");
        assertThat(captor.getValue().getFieldName()).isEqualTo("name");

        // Broadcast to both topics
        verify(messagingTemplate).convertAndSend(eq("/topic/customers/" + customerId), any(CrdtOperationDto.class));
        verify(messagingTemplate).convertAndSend(eq("/topic/customers"), any(CrdtOperationDto.class));
    }

    @Test
    void lwwUpdateHigherTimestampWins() {
        var op1 = lwwOp("name", "Old", "A", 1);
        var op2 = lwwOp("name", "New", "B", 5);

        service.applyOperation(op1);
        service.applyOperation(op2);

        var reg = service.getLwwRegister("CUSTOMER", customerId, "name");
        assertThat(reg.value()).isEqualTo("New");
    }

    @Test
    void lwwUpdateLowerTimestampIgnored() {
        var op1 = lwwOp("name", "First", "A", 5);
        var op2 = lwwOp("name", "Second", "B", 2);

        service.applyOperation(op1);
        service.applyOperation(op2);

        var reg = service.getLwwRegister("CUSTOMER", customerId, "name");
        assertThat(reg.value()).isEqualTo("First");
    }

    // --- OR-Set ---

    @Test
    void orSetAddAndRetrieve() {
        var elemId = UUID.randomUUID().toString();
        var op = new OrSetAdd();
        op.setEntityType("CUSTOMER");
        op.setEntityId(customerId);
        op.setElementId(elemId);
        op.setValue(java.util.Map.of("title", "Call client", "done", false));
        op.setNodeId("client-A");
        op.setTimestamp(1);

        service.applyOperation(op);

        var set = service.getOrSet("CUSTOMER", customerId);
        assertThat(set.size()).isEqualTo(1);
    }

    @Test
    void orSetRemove() {
        var elemId = UUID.randomUUID().toString();

        var addOp = new OrSetAdd();
        addOp.setEntityType("CUSTOMER");
        addOp.setEntityId(customerId);
        addOp.setElementId(elemId);
        addOp.setValue("todo-1");
        addOp.setNodeId("client-A");
        addOp.setTimestamp(1);
        service.applyOperation(addOp);

        var removeOp = new OrSetRemove();
        removeOp.setEntityType("CUSTOMER");
        removeOp.setEntityId(customerId);
        removeOp.setElementId(elemId);
        removeOp.setNodeId("client-A");
        removeOp.setTimestamp(2);
        service.applyOperation(removeOp);

        var set = service.getOrSet("CUSTOMER", customerId);
        assertThat(set.size()).isEqualTo(0);
    }

    // --- PN-Counter ---

    @Test
    void pnCounterIncrement() {
        var op = new PnCounterIncrement();
        op.setEntityType("CUSTOMER");
        op.setEntityId(customerId);
        op.setField("contactCount");
        op.setNodeId("client-A");
        op.setTimestamp(1);

        service.applyOperation(op);
        service.applyOperation(op);

        var counter = service.getPnCounter("CUSTOMER", customerId, "contactCount");
        assertThat(counter.value()).isEqualTo(2);
    }

    @Test
    void pnCounterDecrement() {
        var incOp = new PnCounterIncrement();
        incOp.setEntityType("CUSTOMER");
        incOp.setEntityId(customerId);
        incOp.setField("contactCount");
        incOp.setNodeId("client-A");
        incOp.setTimestamp(1);

        var decOp = new PnCounterDecrement();
        decOp.setEntityType("CUSTOMER");
        decOp.setEntityId(customerId);
        decOp.setField("contactCount");
        decOp.setNodeId("client-A");
        decOp.setTimestamp(2);

        service.applyOperation(incOp);
        service.applyOperation(incOp);
        service.applyOperation(incOp);
        service.applyOperation(decOp);

        var counter = service.getPnCounter("CUSTOMER", customerId, "contactCount");
        assertThat(counter.value()).isEqualTo(2); // 3 - 1
    }

    // --- Server clock ---

    @Test
    void serverClockAdvancesOnOperation() {
        var op = lwwOp("name", "test", "A", 100);
        service.applyOperation(op);

        // Server clock should have received timestamp 100
        long ts = service.getServerTimestamp();
        assertThat(ts).isGreaterThan(100);
    }

    // --- Helpers ---

    private LwwUpdate lwwOp(String field, Object value, String nodeId, long timestamp) {
        var op = new LwwUpdate();
        op.setEntityType("CUSTOMER");
        op.setEntityId(customerId);
        op.setField(field);
        op.setValue(value);
        op.setNodeId(nodeId);
        op.setTimestamp(timestamp);
        return op;
    }
}
