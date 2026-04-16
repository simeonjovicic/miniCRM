package com.collabcrm.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * SPA (Single Page Application) Routing Konfiguration.
 *
 * Problem: React Router nutzt URLs wie /customers/abc-123, aber im JAR existiert
 * nur index.html. Wenn ein User direkt /customers/abc-123 aufruft oder F5 drückt,
 * würde Spring Boot 404 zurückgeben.
 *
 * Lösung: Alle Pfade die KEINE Dateiendung haben und NICHT mit /api oder /ws anfangen
 * werden auf index.html weitergeleitet. React Router übernimmt dann das Routing clientseitig.
 *
 * Das Regex [^\.]* matched jeden Pfad OHNE Punkt (keine Dateiendungen).
 * So werden statische Dateien (.js, .css, .png) weiterhin direkt ausgeliefert.
 */
@Configuration
public class SpaConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // Ein-Segment-Pfade: /customers, /todos, /finance, /vorlagen etc.
        registry.addViewController("/{path:[^\\.]*}")
                .setViewName("forward:/index.html");
        // Zwei-Segment-Pfade: /customers/abc-123 (Kunden-Detailseite)
        registry.addViewController("/{path1}/{path2:[^\\.]*}")
                .setViewName("forward:/index.html");
    }
}
