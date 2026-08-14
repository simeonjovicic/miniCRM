package com.collabcrm.controller;

import com.collabcrm.model.User;
import com.collabcrm.repository.UserRepository;
import com.collabcrm.service.NtfyService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Anmeldung, Abmeldung und das Festlegen des ersten Passworts.
 *
 * Die Endpunkte hier sind bewusst ohne Anmeldung erreichbar — sonst käme man
 * nie hinein. Alles andere unter /api ist geschützt.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /** Kurz genug zum Merken, lang genug um nicht geraten zu werden. */
    private static final int MIN_PASSWORD_LENGTH = 8;

    /**
     * Ein ntfy-Thema ist öffentlich erreichbar, wer es kennt liest mit. Zu kurz
     * heisst durchprobierbar — deshalb dieselbe Untergrenze wie beim Passwort.
     */
    private static final int MIN_TOPIC_LENGTH = 8;

    /** ntfy erlaubt nur diese Zeichen im Themennamen. */
    private static final java.util.regex.Pattern TOPIC_PATTERN =
            java.util.regex.Pattern.compile("[A-Za-z0-9_-]+");

    private final UserRepository users;
    private final AuthenticationManager authenticationManager;
    private final PasswordEncoder passwordEncoder;
    private final SecurityContextRepository securityContextRepository;
    private final NtfyService ntfy;

    public AuthController(UserRepository users,
                          AuthenticationManager authenticationManager,
                          PasswordEncoder passwordEncoder,
                          SecurityContextRepository securityContextRepository,
                          NtfyService ntfy) {
        this.users = users;
        this.authenticationManager = authenticationManager;
        this.passwordEncoder = passwordEncoder;
        this.securityContextRepository = securityContextRepository;
        this.ntfy = ntfy;
    }

    /**
     * Benutzer für den Anmeldebildschirm — Name und ob schon ein Passwort
     * gesetzt ist. Bewusst ohne weitere Angaben: mehr braucht der Bildschirm
     * nicht, und mehr soll unangemeldet auch nicht herausgehen.
     */
    @GetMapping("/users")
    public List<Map<String, Object>> listForLogin() {
        return users.findAll().stream()
                .map(u -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("username", u.getUsername());
                    entry.put("hasPassword", u.hasPassword());
                    return entry;
                })
                .toList();
    }

    /**
     * Erstes Passwort festlegen.
     *
     * Geht nur, solange der Benutzer noch keines hat. Danach ist dieser Weg für
     * ihn zu — ein Zurücksetzen muss über die Datenbank laufen, sonst könnte
     * jeder jedem das Passwort überschreiben.
     */
    @PostMapping("/set-password")
    public Map<String, Object> setPassword(@RequestBody Map<String, String> body,
                                           HttpServletRequest request,
                                           HttpServletResponse response) {
        String username = body.getOrDefault("username", "").trim();
        String password = body.getOrDefault("password", "");

        User user = users.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unbekannter Benutzer."));

        if (user.hasPassword()) {
            throw new IllegalStateException(
                    "Für diesen Benutzer ist bereits ein Passwort gesetzt.");
        }
        if (password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException(
                    "Das Passwort braucht mindestens " + MIN_PASSWORD_LENGTH + " Zeichen.");
        }

        user.setPasswordHash(passwordEncoder.encode(password));
        users.save(user);

        // Gleich anmelden, damit man nicht zweimal tippen muss
        return login(Map.of("username", username, "password", password), request, response);
    }

    /**
     * Legt den allerersten Benutzer an — nur solange es überhaupt keinen gibt.
     *
     * Ohne diesen Weg wäre eine frische Installation nicht benutzbar: alles ist
     * geschützt, und ohne Benutzer kann sich niemand anmelden. Sobald einer
     * existiert, ist der Weg zu.
     */
    @PostMapping("/bootstrap")
    public Map<String, Object> bootstrap(@RequestBody Map<String, String> body,
                                         HttpServletRequest request,
                                         HttpServletResponse response) {
        if (users.count() > 0) {
            throw new IllegalStateException(
                    "Es gibt bereits Benutzer — weitere legt man angemeldet an.");
        }

        String username = body.getOrDefault("username", "").trim();
        String email = body.getOrDefault("email", "").trim();
        String password = body.getOrDefault("password", "");

        if (username.isEmpty() || email.isEmpty()) {
            throw new IllegalArgumentException("Benutzername und E-Mail sind nötig.");
        }
        if (password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException(
                    "Das Passwort braucht mindestens " + MIN_PASSWORD_LENGTH + " Zeichen.");
        }

        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setRole("ADMIN");
        user.setPasswordHash(passwordEncoder.encode(password));
        users.save(user);

        return login(Map.of("username", username, "password", password), request, response);
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body,
                                     HttpServletRequest request,
                                     HttpServletResponse response) {
        String username = body.getOrDefault("username", "").trim();
        String password = body.getOrDefault("password", "");

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(username, password));
        } catch (Exception e) {
            // Bewusst ohne Unterscheidung, ob der Name oder das Passwort falsch war
            throw new BadCredentialsException("Benutzername oder Passwort stimmt nicht.");
        }

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        return currentUser(authentication.getName());
    }

    /**
     * Passwort ändern, im Unterschied zum erstmaligen Festlegen.
     *
     * Braucht eine bestehende Anmeldung UND das aktuelle Passwort — sonst
     * könnte jemand an einem offen stehenden Rechner das Passwort übernehmen
     * und wäre danach der Einzige mit Zugang.
     */
    @PostMapping("/change-password")
    public Map<String, Object> changePassword(@RequestBody Map<String, String> body,
                                              Authentication authentication) {
        User user = users.findByUsername(authentication.getName())
                .orElseThrow(() -> new IllegalStateException("Angemeldeter Benutzer nicht gefunden."));

        String current = body.getOrDefault("currentPassword", "");
        String next = body.getOrDefault("newPassword", "");

        if (!passwordEncoder.matches(current, user.getPasswordHash())) {
            throw new BadCredentialsException("Das aktuelle Passwort stimmt nicht.");
        }
        if (next.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException(
                    "Das neue Passwort braucht mindestens " + MIN_PASSWORD_LENGTH + " Zeichen.");
        }
        if (passwordEncoder.matches(next, user.getPasswordHash())) {
            throw new IllegalArgumentException("Das neue Passwort ist dasselbe wie das alte.");
        }

        user.setPasswordHash(passwordEncoder.encode(next));
        users.save(user);

        // Die Sitzung bleibt bestehen — man muss sich nicht neu anmelden.
        return currentUser(user.getUsername());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
    }

    /**
     * Der gerade angemeldete Benutzer. Das Frontend fragt das beim Start, um
     * eine bestehende Sitzung wiederherzustellen — deshalb übersteht die
     * Anmeldung ein Neuladen.
     */
    @GetMapping("/me")
    public Map<String, Object> me(Authentication authentication) {
        return currentUser(authentication.getName());
    }

    // ── Persönliches ntfy-Thema ─────────────────────────────────────────

    /**
     * Das eigene ntfy-Thema, im Klartext.
     *
     * Bewusst lesbar und nicht maskiert: man muss es mit dem vergleichen können,
     * was in der ntfy-App eingetragen ist — genau da liegt der Fehler, wenn
     * nichts ankommt. Es geht nur an den Besitzer selbst, nie an den anderen.
     */
    @GetMapping("/ntfy-topic")
    public Map<String, Object> ntfyTopic(Authentication authentication) {
        User user = requireUser(authentication);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("topic", user.getNtfyTopic() == null ? "" : user.getNtfyTopic());
        out.put("configured", user.hasNtfyTopic());
        return out;
    }

    /**
     * Eigenes Thema setzen oder mit einem leeren Wert wieder abbestellen.
     *
     * Ohne Thema gibt es keine persönliche Übersicht — das ist kein Fehler,
     * sondern die Art, sie abzuschalten.
     */
    @PutMapping("/ntfy-topic")
    public Map<String, Object> setNtfyTopic(@RequestBody Map<String, String> body,
                                            Authentication authentication) {
        User user = requireUser(authentication);
        String topic = body.getOrDefault("topic", "").trim();

        if (!topic.isEmpty()) {
            if (topic.length() < MIN_TOPIC_LENGTH) {
                throw new IllegalArgumentException(
                        "Das Thema braucht mindestens " + MIN_TOPIC_LENGTH
                                + " Zeichen — es ist gleichzeitig das Passwort des Kanals.");
            }
            if (!TOPIC_PATTERN.matcher(topic).matches()) {
                throw new IllegalArgumentException(
                        "Erlaubt sind Buchstaben, Ziffern, Bindestrich und Unterstrich.");
            }
        }

        user.setNtfyTopic(topic.isEmpty() ? null : topic);
        users.save(user);
        return ntfyTopic(authentication);
    }

    /**
     * Schickt eine Probenachricht an das eigene Thema.
     *
     * Ein falsch abgetipptes Thema fällt sonst nicht auf: ntfy nimmt jeden
     * Namen an, die Nachricht landet nur dort, wo niemand zuhört.
     */
    @PostMapping("/ntfy-test")
    public Map<String, Object> testNtfy(Authentication authentication) {
        User user = requireUser(authentication);
        if (!user.hasNtfyTopic()) {
            throw new IllegalArgumentException("Erst ein Thema hinterlegen.");
        }

        boolean ok = ntfy.sendTo(user.getNtfyTopic(), "miniCRM",
                "Probenachricht — die tägliche Übersicht kommt hier an.");
        return Map.of("sent", ok);
    }

    private User requireUser(Authentication authentication) {
        return users.findByUsername(authentication.getName())
                .orElseThrow(() -> new IllegalStateException("Angemeldeter Benutzer nicht gefunden."));
    }

    private Map<String, Object> currentUser(String username) {
        User user = users.findByUsername(username)
                .orElseThrow(() -> new IllegalStateException("Angemeldeter Benutzer nicht gefunden."));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", user.getId().toString());
        out.put("username", user.getUsername());
        out.put("email", user.getEmail());
        out.put("role", user.getRole());
        out.put("createdAt", user.getCreatedAt().toString());
        // Nur ob, nicht welches — das Thema selbst geht ueber /ntfy-topic.
        out.put("hasNtfyTopic", user.hasNtfyTopic());
        return out;
    }

    @ExceptionHandler(BadCredentialsException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public Map<String, String> handleBadCredentials(BadCredentialsException ex) {
        return Map.of("error", ex.getMessage());
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> handleBadRequest(RuntimeException ex) {
        return Map.of("error", ex.getMessage());
    }
}
