package com.collabcrm.service;

import com.collabcrm.crdt.LWWRegister;
import com.collabcrm.crdt.LamportClock;
import com.collabcrm.crdt.ORSet;
import com.collabcrm.crdt.PNCounter;
import com.collabcrm.dto.CrdtOperationDto;
import com.collabcrm.dto.CrdtOperationDto.*;
import com.collabcrm.model.CrdtState;
import com.collabcrm.repository.CrdtStateRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;


@Service
public class CrdtSyncService {

    private static final Logger log = LoggerFactory.getLogger(CrdtSyncService.class);

    private final CrdtStateRepository crdtStateRepository;
    private final CustomerService customerService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    private final LamportClock serverClock = new LamportClock();

    private static final Set<String> CUSTOMER_JPA_FIELDS = Set.of("name", "email", "company", "phone", "address", "status");


    private final Map<String, Object> crdtCache = new ConcurrentHashMap<>();

    public CrdtSyncService(CrdtStateRepository crdtStateRepository,
                           CustomerService customerService,
                           SimpMessagingTemplate messagingTemplate,
                           ObjectMapper objectMapper) {
        this.crdtStateRepository = crdtStateRepository;
        this.customerService = customerService;
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }


    public void applyOperation(CrdtOperationDto op) {
        // Lamport Clock synchronisieren: Server-Counter = max(eigener, empfangener) + 1
        serverClock.receive(op.getTimestamp());

        // Java 21 Pattern Matching: erkennt den konkreten Subtyp der Operation
        switch (op) {
            case LwwUpdate lww -> applyLwwUpdate(lww);
            case OrSetAdd add -> applyOrSetAdd(add);
            case OrSetRemove remove -> applyOrSetRemove(remove);
            case PnCounterIncrement inc -> applyPnCounterIncrement(inc);
            case PnCounterDecrement dec -> applyPnCounterDecrement(dec);
            default -> throw new IllegalArgumentException("Unknown operation type: " + op.getClass());
        }

        // An alle Clients broadcasten die diesen Kunden beobachten
        String topic = "/topic/customers/" + op.getEntityId();
        messagingTemplate.convertAndSend(topic, op);
        // Auch an die allgemeine Kundenliste broadcasten (für Dashboard-Updates etc.)
        messagingTemplate.convertAndSend("/topic/customers", op);
    }


    private void applyLwwUpdate(LwwUpdate op) {
        String key = cacheKey(op.getEntityType(), op.getEntityId(), op.getField());
        crdtCache.compute(key, (k, existing) -> {
            @SuppressWarnings("unchecked")
            var reg = (LWWRegister<Object>) existing;
            if (reg == null) {
                reg = loadLwwRegister(op.getEntityType(), op.getEntityId(), op.getField());
            }
            // CRDT-Merge: Höherer Timestamp gewinnt
            reg.set(op.getValue(), op.getTimestamp(), op.getNodeId());
            // In DB persistieren als JSONB
            persistState(op.getEntityType(), op.getEntityId(), op.getField(), "LWW", serializeLww(reg));
            return reg;
        });


        if ("CUSTOMER".equals(op.getEntityType()) && CUSTOMER_JPA_FIELDS.contains(op.getField())) {
            try {
                var updates = new com.collabcrm.model.Customer();
                String val = op.getValue() != null ? op.getValue().toString() : null;
                switch (op.getField()) {
                    case "name" -> updates.setName(val);
                    case "email" -> updates.setEmail(val);
                    case "company" -> updates.setCompany(val);
                    case "phone" -> updates.setPhone(val);
                    case "address" -> updates.setAddress(val);
                    case "status" -> updates.setStatus(val);
                }
                customerService.update(UUID.fromString(op.getEntityId()), updates);
            } catch (Exception e) {
                log.warn("Failed to sync LWW field '{}' to Customer JPA entity: {}", op.getField(), e.getMessage());
            }
        }
    }

    @SuppressWarnings("unchecked")
    public LWWRegister<Object> getLwwRegister(String entityType, String entityId, String field) {
        String key = cacheKey(entityType, entityId, field);
        return (LWWRegister<Object>) crdtCache.computeIfAbsent(key,
                k -> loadLwwRegister(entityType, entityId, field));
    }

    private LWWRegister<Object> loadLwwRegister(String entityType, String entityId, String field) {
        var id = new CrdtState.CrdtStateId(entityType, UUID.fromString(entityId), field);
        return crdtStateRepository.findById(id)
                .map(state -> deserializeLww(state.getState()))
                .orElse(new LWWRegister<>(null, 0, "server"));
    }


    private void applyOrSetAdd(OrSetAdd op) {
        String key = cacheKey(op.getEntityType(), op.getEntityId(), "todos");
        crdtCache.compute(key, (k, existing) -> {
            @SuppressWarnings("unchecked")
            var set = (ORSet<Object>) existing;
            if (set == null) {
                set = loadOrSet(op.getEntityType(), op.getEntityId());
            }
            UUID elemId = UUID.fromString(op.getElementId());
            // Fügt einen neuen Dot (nodeId + timestamp) für dieses Element hinzu
            set.add(elemId, op.getValue(), op.getNodeId(), op.getTimestamp());
            persistState(op.getEntityType(), op.getEntityId(), "todos", "OR_SET", serializeOrSet(set));
            return set;
        });
    }

    private void applyOrSetRemove(OrSetRemove op) {
        String key = cacheKey(op.getEntityType(), op.getEntityId(), "todos");
        crdtCache.compute(key, (k, existing) -> {
            @SuppressWarnings("unchecked")
            var set = (ORSet<Object>) existing;
            if (set == null) {
                set = loadOrSet(op.getEntityType(), op.getEntityId());
            }
            set.remove(UUID.fromString(op.getElementId()));
            persistState(op.getEntityType(), op.getEntityId(), "todos", "OR_SET", serializeOrSet(set));
            return set;
        });
    }

    @SuppressWarnings("unchecked")
    public ORSet<Object> getOrSet(String entityType, String entityId) {
        String key = cacheKey(entityType, entityId, "todos");
        return (ORSet<Object>) crdtCache.computeIfAbsent(key,
                k -> loadOrSet(entityType, entityId));
    }

    private ORSet<Object> loadOrSet(String entityType, String entityId) {
        var id = new CrdtState.CrdtStateId(entityType, UUID.fromString(entityId), "todos");
        return crdtStateRepository.findById(id)
                .map(state -> deserializeOrSet(state.getState()))
                .orElse(new ORSet<>());
    }


    private void applyPnCounterIncrement(PnCounterIncrement op) {
        String key = cacheKey(op.getEntityType(), op.getEntityId(), op.getField());
        crdtCache.compute(key, (k, existing) -> {
            var counter = (PNCounter) existing;
            if (counter == null) {
                counter = loadPnCounter(op.getEntityType(), op.getEntityId(), op.getField());
            }
            counter.increment(op.getNodeId());
            persistState(op.getEntityType(), op.getEntityId(), op.getField(), "PN_COUNTER", serializePnCounter(counter));
            return counter;
        });
    }

    private void applyPnCounterDecrement(PnCounterDecrement op) {
        String key = cacheKey(op.getEntityType(), op.getEntityId(), op.getField());
        crdtCache.compute(key, (k, existing) -> {
            var counter = (PNCounter) existing;
            if (counter == null) {
                counter = loadPnCounter(op.getEntityType(), op.getEntityId(), op.getField());
            }
            counter.decrement(op.getNodeId());
            persistState(op.getEntityType(), op.getEntityId(), op.getField(), "PN_COUNTER", serializePnCounter(counter));
            return counter;
        });
    }

    public PNCounter getPnCounter(String entityType, String entityId, String field) {
        String key = cacheKey(entityType, entityId, field);
        return (PNCounter) crdtCache.computeIfAbsent(key,
                k -> loadPnCounter(entityType, entityId, field));
    }

    private PNCounter loadPnCounter(String entityType, String entityId, String field) {
        var id = new CrdtState.CrdtStateId(entityType, UUID.fromString(entityId), field);
        return crdtStateRepository.findById(id)
                .map(state -> deserializePnCounter(state.getState()))
                .orElse(new PNCounter());
    }


    public Map<String, Object> getFullCrdtState(String entityType, String entityId) {
        var states = crdtStateRepository.findByEntityTypeAndEntityId(entityType, UUID.fromString(entityId));
        var result = new HashMap<String, Object>();
        for (var state : states) {
            Object value = switch (state.getCrdtType()) {
                case "LWW" -> deserializeLww(state.getState()).value();
                case "OR_SET" -> deserializeOrSet(state.getState()).elements();
                case "PN_COUNTER" -> deserializePnCounter(state.getState()).value();
                default -> state.getState();
            };
            result.put(state.getFieldName(), value);
        }
        return result;
    }


    private void persistState(String entityType, String entityId, String fieldName, String crdtType, String json) {
        var state = new CrdtState();
        state.setEntityType(entityType);
        state.setEntityId(UUID.fromString(entityId));
        state.setFieldName(fieldName);
        state.setCrdtType(crdtType);
        state.setState(json);
        crdtStateRepository.save(state);
    }


    private String serializeLww(LWWRegister<Object> reg) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                    "value", reg.value() != null ? reg.value() : "",
                    "timestamp", reg.timestamp(),
                    "nodeId", reg.nodeId()
            ));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize LWW register", e);
        }
    }


    private LWWRegister<Object> deserializeLww(String json) {
        try {
            Map<String, Object> map = objectMapper.readValue(json, new TypeReference<>() {});
            Object value = map.get("value");
            long ts = ((Number) map.get("timestamp")).longValue();
            String nodeId = (String) map.get("nodeId");
            return new LWWRegister<>(value, ts, nodeId);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize LWW register", e);
        }
    }


    private <T> String serializeOrSet(ORSet<T> set) {
        try {
            var entries = new ArrayList<Map<String, Object>>();
            for (var e : set.rawEntries().entrySet()) {
                var entry = new HashMap<String, Object>();
                entry.put("elementId", e.getKey().toString());
                entry.put("value", e.getValue().value);
                entry.put("addDots", e.getValue().addDots.stream()
                        .map(d -> Map.of("nodeId", d.nodeId(), "timestamp", d.timestamp()))
                        .toList());
                entry.put("removeDots", e.getValue().removeDots.stream()
                        .map(d -> Map.of("nodeId", d.nodeId(), "timestamp", d.timestamp()))
                        .toList());
                entries.add(entry);
            }
            return objectMapper.writeValueAsString(entries);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize OR-Set", e);
        }
    }


    @SuppressWarnings("unchecked")
    private ORSet<Object> deserializeOrSet(String json) {
        try {
            List<Map<String, Object>> entries = objectMapper.readValue(json, new TypeReference<>() {});
            var set = new ORSet<Object>();
            for (var entry : entries) {
                UUID elemId = UUID.fromString((String) entry.get("elementId"));
                Object value = entry.get("value");
                var addDots = (List<Map<String, Object>>) entry.get("addDots");
                var removeDots = (List<Map<String, Object>>) entry.get("removeDots");

                // Alle Add-Events wiederherstellen
                for (var dot : addDots) {
                    set.add(elemId, value, (String) dot.get("nodeId"), ((Number) dot.get("timestamp")).longValue());
                }
                // Alle Remove-Events wiederherstellen
                for (var dot : removeDots) {
                    set.remove(elemId, Set.of(new ORSet.Dot(
                            (String) dot.get("nodeId"),
                            ((Number) dot.get("timestamp")).longValue()
                    )));
                }
            }
            return set;
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize OR-Set", e);
        }
    }

    private String serializePnCounter(PNCounter counter) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                    "increments", counter.increments(),
                    "decrements", counter.decrements()
            ));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize PN-Counter", e);
        }
    }


    private PNCounter deserializePnCounter(String json) {
        try {
            Map<String, Map<String, Number>> map = objectMapper.readValue(json, new TypeReference<>() {});
            var counter = new PNCounter();
            map.getOrDefault("increments", Map.of()).forEach((nodeId, count) -> {
                for (long i = 0; i < count.longValue(); i++) counter.increment(nodeId);
            });
            map.getOrDefault("decrements", Map.of()).forEach((nodeId, count) -> {
                for (long i = 0; i < count.longValue(); i++) counter.decrement(nodeId);
            });
            return counter;
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize PN-Counter", e);
        }
    }

    /** Erzeugt den Cache-Key im Format "entityType:entityId:fieldName" */
    private String cacheKey(String entityType, String entityId, String field) {
        return entityType + ":" + entityId + ":" + field;
    }

    /** Gibt einen neuen Server-Timestamp zurück (für Server-initiierte Operationen). */
    public long getServerTimestamp() {
        return serverClock.tick();
    }
}
