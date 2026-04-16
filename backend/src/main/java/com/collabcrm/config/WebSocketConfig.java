package com.collabcrm.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * WebSocket-Konfiguration mit STOMP-Protokoll über SockJS.
 *
 * STOMP (Simple Text Oriented Messaging Protocol) bietet:
 *   - Topic-basiertes Pub/Sub (z.B. /topic/customers für Kunden-Updates)
 *   - Automatische JSON-Serialisierung
 *   - Reconnect-Support über SockJS (Fallback auf HTTP-Polling wenn WebSocket nicht verfügbar)
 *
 * Konvention:
 *   - /topic/* → Clients subscriben hier um Updates zu empfangen
 *   - /app/*  → Clients senden hier Nachrichten an den Server
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Aktiviert den In-Memory Message Broker für /topic/* Destinations
        // Clients subscriben z.B. auf /topic/customers oder /topic/presence/online
        registry.enableSimpleBroker("/topic");
        // Prefix für Nachrichten die an @MessageMapping Controller gehen
        // z.B. Client sendet an /app/crdt/operation → CrdtWebSocketController.handleOperation()
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // WebSocket-Endpunkt unter /ws registrieren
        // SockJS als Fallback für Browser die kein natives WebSocket unterstützen
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")  // CORS erlauben (für Dev-Server auf anderem Port)
                .withSockJS();
    }
}
