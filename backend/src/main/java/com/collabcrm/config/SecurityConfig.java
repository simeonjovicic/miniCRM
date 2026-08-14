package com.collabcrm.config;

import com.collabcrm.repository.UserRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

import java.util.List;

/**
 * Anmeldung per Benutzername und Passwort, gehalten in einer Server-Session.
 *
 * <h2>Warum Session und nicht Token</h2>
 * Der Browser schickt das Session-Cookie von selbst mit — auch beim WebSocket-
 * Handshake. Ein Token müsste man an jeder Stelle von Hand mitgeben und
 * irgendwo im Browser ablegen, wo es angreifbarer wäre. Nebenbei übersteht die
 * Anmeldung dadurch ein Neuladen der Seite, ohne dass etwas im localStorage liegt.
 *
 * <h2>Warum CSRF abgeschaltet ist</h2>
 * Das Session-Cookie ist auf {@code SameSite=Strict} gestellt (siehe
 * application.yml). Der Browser schickt es damit bei Anfragen von fremden
 * Seiten gar nicht erst mit, womit der Angriffsweg entfällt, gegen den CSRF-
 * Token schützen. Für zwei Leute hinter Tailscale ist das der bessere Tausch
 * als Token-Handling an jedem Formular.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /** Pfade, die ohne Anmeldung erreichbar sein müssen. */
    private static final String[] PUBLIC_API = {
            "/api/auth/users",
            "/api/auth/login",
            "/api/auth/set-password",
            // Prüft selbst, dass es noch keinen Benutzer gibt
            "/api/auth/bootstrap",
    };

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {})
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(PUBLIC_API).permitAll()
                        // Die Oberflaeche selbst muss laden koennen, damit man
                        // ueberhaupt zum Anmeldebildschirm kommt.
                        .requestMatchers("/", "/index.html", "/assets/**", "/*.png", "/*.svg", "/*.ico").permitAll()
                        .requestMatchers("/api/**", "/ws/**").authenticated()
                        // Alles Uebrige sind SPA-Routen, die auf index.html zeigen.
                        .anyRequest().permitAll())
                // Ohne Anmeldung ein klares 401 statt einer Weiterleitung auf ein
                // Login-Formular — das Frontend wertet den Statuscode aus.
                .exceptionHandling(ex -> ex.authenticationEntryPoint(
                        new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .logout(logout -> logout.disable());

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** Legt den angemeldeten Zustand in der Session ab. */
    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    /**
     * Lädt Benutzer aus der Datenbank. Wer noch kein Passwort gesetzt hat, kann
     * sich nicht anmelden — für den ist erst das Festlegen vorgesehen.
     */
    @Bean
    public UserDetailsService userDetailsService(UserRepository users) {
        return username -> users.findByUsername(username)
                .filter(com.collabcrm.model.User::hasPassword)
                .map(u -> User.withUsername(u.getUsername())
                        .password(u.getPasswordHash())
                        .authorities(List.of())
                        .build())
                .orElseThrow(() -> new UsernameNotFoundException("Unbekannt oder ohne Passwort: " + username));
    }

    @Bean
    public AuthenticationManager authenticationManager(UserDetailsService userDetailsService,
                                                       PasswordEncoder passwordEncoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(passwordEncoder);
        provider.setUserDetailsService(userDetailsService);
        return provider::authenticate;
    }
}
