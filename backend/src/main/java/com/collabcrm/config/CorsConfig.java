package com.collabcrm.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS-Konfiguration für REST-Endpunkte.
 *
 * Erlaubt Cross-Origin Requests von jedem Origin auf /api/** Endpunkte.
 * Notwendig für die Entwicklung, wenn Frontend (Vite auf Port 5173)
 * und Backend (Spring Boot auf Port 8080) auf verschiedenen Ports laufen.
 *
 * In Produktion (Frontend eingebettet im JAR) braucht man kein CORS,
 * aber es schadet nicht und vereinfacht die Konfiguration.
 */
@Configuration
public class CorsConfig {

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOriginPatterns("*")
                        .allowedMethods("*")
                        .allowedHeaders("*")
                        .allowCredentials(true);  // Cookies und Auth-Headers erlauben
            }
        };
    }
}
