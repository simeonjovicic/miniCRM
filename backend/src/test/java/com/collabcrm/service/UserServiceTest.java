package com.collabcrm.service;

import com.collabcrm.model.User;
import com.collabcrm.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    @Test
    void findAll() {
        User user = new User();
        user.setUsername("alice");
        when(userRepository.findAll()).thenReturn(List.of(user));

        List<User> result = userService.findAll();
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getUsername()).isEqualTo("alice");
    }

    @Test
    void findByIdFound() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setUsername("alice");
        when(userRepository.findById(id)).thenReturn(Optional.of(user));

        User result = userService.findById(id);
        assertThat(result.getUsername()).isEqualTo("alice");
    }

    @Test
    void findByIdNotFound() {
        UUID id = UUID.randomUUID();
        when(userRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> userService.findById(id))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("User not found");
    }

    @Test
    void create() {
        User user = new User();
        user.setUsername("alice");
        when(userRepository.save(user)).thenReturn(user);

        User result = userService.create(user);
        assertThat(result.getUsername()).isEqualTo("alice");
        verify(userRepository).save(user);
    }
}
