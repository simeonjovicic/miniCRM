package com.collabcrm.repository;

import com.collabcrm.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository für Benutzer.
 */
public interface UserRepository extends JpaRepository<User, UUID> {
    /** User per Username suchen (für Login) */
    Optional<User> findByUsername(String username);
}
