package com.collabcrm.repository;

import com.collabcrm.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Test
    void saveAndFindById() {
        User user = newUser("alice", "alice@example.com", "ADMIN");
        User saved = userRepository.save(user);

        assertThat(saved.getId()).isNotNull();

        Optional<User> found = userRepository.findById(saved.getId());
        assertThat(found).isPresent();
        assertThat(found.get().getUsername()).isEqualTo("alice");
        assertThat(found.get().getCreatedAt()).isNotNull();
    }

    @Test
    void findByUsername() {
        userRepository.save(newUser("bob", "bob@example.com", "SALES"));

        Optional<User> found = userRepository.findByUsername("bob");
        assertThat(found).isPresent();
        assertThat(found.get().getEmail()).isEqualTo("bob@example.com");
    }

    @Test
    void findByUsernameNotFound() {
        assertThat(userRepository.findByUsername("nonexistent")).isEmpty();
    }

    @Test
    void findAll() {
        userRepository.save(newUser("alice", "alice@example.com", "ADMIN"));
        userRepository.save(newUser("bob", "bob@example.com", "SALES"));

        assertThat(userRepository.findAll()).hasSize(2);
    }

    private User newUser(String username, String email, String role) {
        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setRole(role);
        return user;
    }
}
